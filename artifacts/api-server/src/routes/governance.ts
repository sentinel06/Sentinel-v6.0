/**
 * Governance Routes — Active Circuit Breaker, Registry, War Room
 *
 * POST /v1/authorize          — Agent pre-execution gate
 * GET  /v1/authorize/:id/status — Long-poll for auth result (≤30s)
 * POST /v1/authorize/:id/resolve — Admin approve/deny
 * GET  /v1/authorize/pending  — List all pending requests
 * GET  /v1/authorize/history  — Full authorization audit log (Art. 14)
 *
 * GET  /v1/registry           — List all registered agents
 * POST /v1/registry           — Register a new agent
 * PATCH /v1/registry/:agentId — Update agent settings
 * DELETE /v1/registry/:agentId — Deactivate agent
 *
 * POST /v1/admin/kill-switch  — Emergency: revoke all active sessions
 * GET  /v1/admin/kill-switch  — Current kill-switch status
 */

import { Router, type IRouter } from "express";
import { db, agentRegistryTable, authorizationRequestsTable } from "@workspace/db";
import { eq, desc, asc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getSessionHealth,
  isHighRiskAction,
  isAgentRevoked,
  storeAuthRequest,
  getAuthRequest,
  getAllPendingRequests,
  getAllAuthRequests,
  resolveAuthRequest,
  waitForResolution,
  activateGlobalKillSwitch,
  deactivateGlobalKillSwitch,
  isGlobalKillActive,
  getRevokedAgents,
  revokeAgent,
  emitGovernanceEvent,
} from "../lib/governance";
import { broadcastGovernanceEvent } from "../lib/ws";

const router: IRouter = Router();

const HEALTH_THRESHOLD = 0.7;

// ── /v1/authorize ─────────────────────────────────────────────────────────

router.post("/v1/authorize", async (req, res): Promise<void> => {
  const { agentId, traceId, intent, proposedAction, actionType } = req.body ?? {};

  if (!agentId || !traceId || !intent || !proposedAction || !actionType) {
    res.status(400).json({
      error: "Required fields: agentId, traceId, intent, proposedAction, actionType",
    });
    return;
  }

  // Killed agent → immediately BLOCKED
  if (isAgentRevoked(agentId)) {
    res.status(403).json({
      status: "BLOCKED",
      reason: "Agent has been revoked via kill-switch",
      requestId: null,
    });
    return;
  }

  const sessionHealth = getSessionHealth(agentId);
  const actionIsHighRisk = isHighRiskAction(actionType);

  // Check agent registry for tool authorization
  const [registryEntry] = await db
    .select()
    .from(agentRegistryTable)
    .where(eq(agentRegistryTable.agentId, agentId))
    .limit(1);

  let privilegeEscalation = false;
  if (registryEntry) {
    const authorizedTools = (registryEntry.authorizedTools as string[]) ?? [];
    if (authorizedTools.length > 0) {
      const normalized = actionType.toLowerCase();
      const allowed = authorizedTools.some((t) => normalized.includes(t.toLowerCase()));
      if (!allowed) privilegeEscalation = true;
    }
  }

  const id = randomUUID();
  const requestedAt = new Date().toISOString();

  // Determine initial status
  let status: "PENDING" | "AUTHORIZED" | "BLOCKED" | "AUTO_BLOCKED" = "PENDING";
  let autoReason: string | undefined;

  if (privilegeEscalation) {
    status = "AUTO_BLOCKED";
    autoReason = `Privilege escalation: action type "${actionType}" is not in this agent's authorized tools list`;
  } else if (sessionHealth < HEALTH_THRESHOLD || actionIsHighRisk) {
    status = "PENDING"; // requires human approval
  } else {
    status = "AUTHORIZED"; // low-risk + healthy session → auto-approve
  }

  const authState = {
    id,
    agentId,
    traceId,
    intent,
    proposedAction,
    actionType,
    status: status as any,
    sessionHealthScore: sessionHealth,
    requestedAt,
    resolvedAt: status !== "PENDING" ? requestedAt : undefined,
    resolvedBy: status !== "PENDING" ? "sentinel-auto" : undefined,
    notes: autoReason,
  };

  storeAuthRequest(authState);

  // Persist to DB
  await db.insert(authorizationRequestsTable).values({
    id,
    agentId,
    traceId,
    intent,
    proposedAction,
    actionType,
    status,
    sessionHealthScore: sessionHealth,
    notes: autoReason,
    resolvedAt: status !== "PENDING" ? new Date() : undefined,
    resolvedBy: status !== "PENDING" ? "sentinel-auto" : undefined,
  });

  // Broadcast to dashboard clients
  broadcastGovernanceEvent("auth_request", authState);

  if (status === "PENDING") {
    // Signal that admin intervention is needed
    broadcastGovernanceEvent("pending_approval", {
      id,
      agentId,
      actionType,
      sessionHealthScore: sessionHealth,
      isHighRisk: actionIsHighRisk,
    });

    res.status(202).json({
      status: "PENDING_APPROVAL",
      requestId: id,
      message: "Authorization pending human review. Poll GET /v1/authorize/:id/status for result.",
      sessionHealthScore: sessionHealth,
      isHighRisk: actionIsHighRisk,
    });
    return;
  }

  res.json({
    status,
    requestId: id,
    sessionHealthScore: sessionHealth,
    reason: autoReason,
  });
});

/** Long-poll: waits up to 29s for an admin to resolve the request */
router.get("/v1/authorize/:id/status", async (req, res): Promise<void> => {
  const { id } = req.params;
  const existing = getAuthRequest(id);
  if (!existing) {
    res.status(404).json({ error: "Authorization request not found" });
    return;
  }
  if (existing.status !== "PENDING") {
    res.json(existing);
    return;
  }
  // Block until resolved or timeout
  const resolved = await waitForResolution(id, 29_000);
  res.json(resolved);
});

/** Admin: approve or deny */
router.post("/v1/authorize/:id/resolve", async (req, res): Promise<void> => {
  const { id } = req.params;
  const { decision, resolvedBy, notes } = req.body ?? {};

  if (!["AUTHORIZED", "BLOCKED"].includes(decision)) {
    res.status(400).json({ error: "decision must be AUTHORIZED or BLOCKED" });
    return;
  }

  const resolved = resolveAuthRequest(id, decision, resolvedBy ?? "admin", notes);
  if (!resolved) {
    res.status(404).json({ error: "Authorization request not found" });
    return;
  }

  // Update DB
  await db
    .update(authorizationRequestsTable)
    .set({
      status: decision,
      resolvedAt: new Date(resolved.resolvedAt!),
      resolvedBy: resolved.resolvedBy ?? "admin",
      notes: resolved.notes,
    })
    .where(eq(authorizationRequestsTable.id, id));

  broadcastGovernanceEvent("auth_resolved", resolved);
  res.json(resolved);
});

router.get("/v1/authorize/pending", (_req, res): void => {
  res.json({ requests: getAllPendingRequests() });
});

router.get("/v1/authorize/history", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(authorizationRequestsTable)
    .orderBy(desc(authorizationRequestsTable.requestedAt))
    .limit(200);
  res.json({ requests: rows });
});

// ── /v1/registry ──────────────────────────────────────────────────────────

router.get("/v1/registry", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(agentRegistryTable)
    .orderBy(asc(agentRegistryTable.registeredAt));
  res.json({ agents: rows });
});

router.post("/v1/registry", async (req, res): Promise<void> => {
  const { agentId, ownerEmail, authorizedTools, riskTier, maxBudgetPerTrace } = req.body ?? {};
  if (!agentId || !ownerEmail) {
    res.status(400).json({ error: "agentId and ownerEmail are required" });
    return;
  }

  const [inserted] = await db
    .insert(agentRegistryTable)
    .values({
      agentId,
      ownerEmail,
      authorizedTools: authorizedTools ?? [],
      riskTier: riskTier ?? "Medium",
      maxBudgetPerTrace: maxBudgetPerTrace ?? null,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: agentRegistryTable.agentId,
      set: {
        ownerEmail,
        authorizedTools: authorizedTools ?? [],
        riskTier: riskTier ?? "Medium",
        maxBudgetPerTrace: maxBudgetPerTrace ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  broadcastGovernanceEvent("registry_update", inserted);
  res.status(201).json(inserted);
});

router.patch("/v1/registry/:agentId", async (req, res): Promise<void> => {
  const { agentId } = req.params;
  const { ownerEmail, authorizedTools, riskTier, maxBudgetPerTrace, isActive } = req.body ?? {};

  const updates: Partial<typeof agentRegistryTable.$inferInsert> = { updatedAt: new Date() };
  if (ownerEmail !== undefined) updates.ownerEmail = ownerEmail;
  if (authorizedTools !== undefined) updates.authorizedTools = authorizedTools;
  if (riskTier !== undefined) updates.riskTier = riskTier;
  if (maxBudgetPerTrace !== undefined) updates.maxBudgetPerTrace = maxBudgetPerTrace;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db
    .update(agentRegistryTable)
    .set(updates)
    .where(eq(agentRegistryTable.agentId, agentId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Agent not found in registry" });
    return;
  }

  if (isActive === false) revokeAgent(agentId);

  broadcastGovernanceEvent("registry_update", updated);
  res.json(updated);
});

// ── /v1/admin/kill-switch ─────────────────────────────────────────────────

router.post("/v1/admin/kill-switch", async (req, res): Promise<void> => {
  const { activate, reason, resolvedBy } = req.body ?? {};

  if (activate) {
    activateGlobalKillSwitch();

    // Deactivate all agents in DB
    await db.update(agentRegistryTable).set({ isActive: false, updatedAt: new Date() });

    broadcastGovernanceEvent("kill_switch", {
      active: true,
      reason: reason ?? "Emergency kill-switch activated",
      activatedBy: resolvedBy ?? "admin",
      activatedAt: new Date().toISOString(),
    });

    res.json({
      active: true,
      message: "Global kill-switch activated. All agent sessions revoked.",
    });
  } else {
    deactivateGlobalKillSwitch();
    broadcastGovernanceEvent("kill_switch", { active: false });
    res.json({ active: false, message: "Kill-switch deactivated." });
  }
});

router.get("/v1/admin/kill-switch", (_req, res): void => {
  res.json({
    active: isGlobalKillActive(),
    revokedAgents: getRevokedAgents(),
  });
});

export default router;
