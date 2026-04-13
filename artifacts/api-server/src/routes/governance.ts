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
 *
 * POST /v1/admin/kill-switch  — Emergency: revoke all active sessions
 * GET  /v1/admin/kill-switch  — Current kill-switch status
 *
 * GET  /v1/honeypot/tokens    — List declared honeypot tokens (admin)
 *
 * GET  /v1/export/audit-pdf   — Generate signed PDF evidence package
 */

import { Router, type IRouter } from "express";
import { db, agentRegistryTable, authorizationRequestsTable, auditLogsTable } from "@workspace/db";
import { eq, desc, asc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getSessionHealth,
  isHighRiskAction,
  isHoneypotToken,
  HONEYPOT_TOKENS,
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
import { generateAuditPDF } from "../lib/pdf-export";

const router: IRouter = Router();

const HEALTH_THRESHOLD = 0.7;

// ── /v1/authorize ─────────────────────────────────────────────────────────

router.post("/v1/authorize", async (req, res): Promise<void> => {
  const { agentId, traceId, intent, proposedAction, actionType, parentTraceId } = req.body ?? {};

  if (!agentId || !traceId || !intent || !proposedAction || !actionType) {
    res.status(400).json({
      error: "Required fields: agentId, traceId, intent, proposedAction, actionType",
    });
    return;
  }

  // ── 0. HONEY-TOKEN TRAP: check before anything else ─────────────────────
  if (isHoneypotToken(actionType)) {
    // Immediately revoke the agent
    revokeAgent(agentId);

    const id = randomUUID();
    const now = new Date().toISOString();
    const breachRecord = {
      id,
      agentId,
      traceId,
      intent,
      proposedAction,
      actionType,
      status: "HONEYPOT_BREACH" as const,
      sessionHealthScore: getSessionHealth(agentId),
      requestedAt: now,
      resolvedAt: now,
      resolvedBy: "sentinel-honeypot",
      notes: `CRITICAL BREACH: Agent attempted to invoke honey-token "${actionType}". Agent has been permanently revoked.`,
      isCriticalBreach: true,
    };

    storeAuthRequest(breachRecord);

    // Persist to DB (store as AUTO_BLOCKED in DB for schema compatibility)
    await db.insert(authorizationRequestsTable).values({
      id,
      agentId,
      traceId,
      intent,
      proposedAction,
      actionType,
      status: "AUTO_BLOCKED",
      sessionHealthScore: breachRecord.sessionHealthScore,
      notes: breachRecord.notes,
      resolvedAt: new Date(),
      resolvedBy: "sentinel-honeypot",
    });

    // Broadcast critical breach alert
    broadcastGovernanceEvent("honeypot_breach", {
      id,
      agentId,
      actionType,
      traceId,
      notes: breachRecord.notes,
      timestamp: now,
    });

    req.log.warn({ agentId, actionType, traceId }, "HONEYPOT BREACH DETECTED — agent revoked");

    res.status(403).json({
      status: "HONEYPOT_BREACH",
      requestId: id,
      reason: `CRITICAL SECURITY BREACH: "${actionType}" is a honey-token. Agent "${agentId}" has been permanently revoked and the War Room has been alerted.`,
    });
    return;
  }

  // ── 1. Killed agent → immediately BLOCKED ────────────────────────────────
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

  // ── 2. Cluster Health: propagate ancestor trust degradation ──────────────
  let clusterHealthScore = sessionHealth;
  if (parentTraceId) {
    // Look up the parent trace's agent and their session health
    const parentRows = await db
      .select({ agentId: auditLogsTable.agentId, parentTraceId: auditLogsTable.parentTraceId })
      .from(auditLogsTable)
      .where(eq(auditLogsTable.traceId, parentTraceId))
      .limit(1);

    if (parentRows.length > 0) {
      const parentAgentId = parentRows[0].agentId;
      const parentHealth = getSessionHealth(parentAgentId);
      // Weighted: 60% own health + 40% ancestor health (recursive degradation)
      clusterHealthScore = 0.6 * sessionHealth + 0.4 * parentHealth;

      // Check grandparent if parent itself has a parent
      if (parentRows[0].parentTraceId) {
        const grandRows = await db
          .select({ agentId: auditLogsTable.agentId })
          .from(auditLogsTable)
          .where(eq(auditLogsTable.traceId, parentRows[0].parentTraceId))
          .limit(1);
        if (grandRows.length > 0) {
          const grandHealth = getSessionHealth(grandRows[0].agentId);
          clusterHealthScore = 0.5 * sessionHealth + 0.3 * parentHealth + 0.2 * grandHealth;
        }
      }
    }
  }

  // ── 3. Registry: privilege escalation check ──────────────────────────────
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

  // ── 4. Determine status ──────────────────────────────────────────────────
  // Use clusterHealthScore (which incorporates ancestor chain) as the effective threshold
  let status: "PENDING" | "AUTHORIZED" | "BLOCKED" | "AUTO_BLOCKED" = "PENDING";
  let autoReason: string | undefined;

  if (privilegeEscalation) {
    status = "AUTO_BLOCKED";
    autoReason = `Privilege escalation: action type "${actionType}" is not in this agent's authorized tools list`;
  } else if (clusterHealthScore < HEALTH_THRESHOLD || actionIsHighRisk) {
    status = "PENDING";
    if (clusterHealthScore < sessionHealth - 0.1) {
      autoReason = `Logic poisoning detected: cluster health (${(clusterHealthScore * 100).toFixed(0)}%) degraded below own session health (${(sessionHealth * 100).toFixed(0)}%) due to upstream ancestor trust decay`;
    }
  } else {
    status = "AUTHORIZED";
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
    clusterHealthScore,
    requestedAt,
    resolvedAt: status !== "PENDING" ? requestedAt : undefined,
    resolvedBy: status !== "PENDING" ? "sentinel-auto" : undefined,
    notes: autoReason,
  };

  storeAuthRequest(authState);

  await db.insert(authorizationRequestsTable).values({
    id,
    agentId,
    traceId,
    intent,
    proposedAction,
    actionType,
    status,
    sessionHealthScore: clusterHealthScore, // store effective score for human reviewers
    notes: autoReason,
    resolvedAt: status !== "PENDING" ? new Date() : undefined,
    resolvedBy: status !== "PENDING" ? "sentinel-auto" : undefined,
  });

  broadcastGovernanceEvent("auth_request", authState);

  if (status === "PENDING") {
    broadcastGovernanceEvent("pending_approval", {
      id,
      agentId,
      actionType,
      sessionHealthScore: clusterHealthScore,
      isHighRisk: actionIsHighRisk,
      logicPoisoned: clusterHealthScore < sessionHealth - 0.1,
    });

    res.status(202).json({
      status: "PENDING_APPROVAL",
      requestId: id,
      message: "Authorization pending human review. Poll GET /v1/authorize/:id/status for result.",
      sessionHealthScore: sessionHealth,
      clusterHealthScore,
      isHighRisk: actionIsHighRisk,
      logicPoisoned: clusterHealthScore < sessionHealth - 0.1,
    });
    return;
  }

  res.json({
    status,
    requestId: id,
    sessionHealthScore: sessionHealth,
    clusterHealthScore,
    reason: autoReason,
  });
});

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
  const resolved = await waitForResolution(id, 29_000);
  res.json(resolved);
});

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
    await db.update(agentRegistryTable).set({ isActive: false, updatedAt: new Date() });
    broadcastGovernanceEvent("kill_switch", {
      active: true,
      reason: reason ?? "Emergency kill-switch activated",
      activatedBy: resolvedBy ?? "admin",
      activatedAt: new Date().toISOString(),
    });
    res.json({ active: true, message: "Global kill-switch activated. All agent sessions revoked." });
  } else {
    deactivateGlobalKillSwitch();
    broadcastGovernanceEvent("kill_switch", { active: false });
    res.json({ active: false, message: "Kill-switch deactivated." });
  }
});

router.get("/v1/admin/kill-switch", (_req, res): void => {
  res.json({ active: isGlobalKillActive(), revokedAgents: getRevokedAgents() });
});

// ── /v1/honeypot/tokens ────────────────────────────────────────────────────

router.get("/v1/honeypot/tokens", (_req, res): void => {
  res.json({
    tokens: Array.from(HONEYPOT_TOKENS),
    description: "These tool names are permanently forbidden. Any invocation triggers immediate agent lockdown and War Room alert.",
  });
});

// ── /v1/export/audit-pdf ─────────────────────────────────────────────────

router.get("/v1/export/audit-pdf", async (req, res): Promise<void> => {
  const { agentId, traceId, startTime, endTime } = req.query;

  await generateAuditPDF(res, {
    agentId: typeof agentId === "string" ? agentId : undefined,
    traceId: typeof traceId === "string" ? traceId : undefined,
    startTime: typeof startTime === "string" ? new Date(startTime) : undefined,
    endTime: typeof endTime === "string" ? new Date(endTime) : undefined,
  });
});

// ── /v1/badge — Dynamic SVG health badge ─────────────────────────────────

function buildBadgeSvg(label: string, value: string, color: string, icon: string): string {
  const labelWidth = label.length * 6.5 + 18;
  const valueWidth = value.length * 7.2 + 18;
  const totalWidth = labelWidth + valueWidth;
  const labelX = labelWidth / 2;
  const valueX = labelWidth + valueWidth / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <defs>
    <linearGradient id="s" x2="0" y2="100%">
      <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
      <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
    <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#1a1a2e"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelX}" y="15" fill="#eee">${label}</text>
    <text x="${valueX}" y="15" font-weight="bold">${icon} ${value}</text>
  </g>
</svg>`;
}

router.get("/v1/badge/:agentId.svg", (req, res): void => {
  const { agentId } = req.params;
  const health = getSessionHealth(agentId);
  const pct = Math.round(health * 100);

  let color: string;
  let icon: string;
  let label: string;

  if (isAgentRevoked(agentId)) {
    color = "#e74c3c"; icon = "✕"; label = "REVOKED";
  } else if (pct >= 80) {
    color = "#27ae60"; icon = "✓"; label = `${pct}% health`;
  } else if (pct >= 60) {
    color = "#f39c12"; icon = "⚠"; label = `${pct}% health`;
  } else {
    color = "#e74c3c"; icon = "✕"; label = `${pct}% — COMPROMISED`;
  }

  const svg = buildBadgeSvg("sentinel-governed", label, color, icon);
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "no-cache, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.send(svg);
});

router.get("/v1/badge.svg", (_req, res): void => {
  const svg = buildBadgeSvg("sentinel-governed", "EU AI Act compliant", "#2980b9", "🛡");
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(svg);
});

export default router;
