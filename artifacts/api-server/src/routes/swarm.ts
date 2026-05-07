/**
 * Swarm Ancestry Engine — API Routes
 *
 * POST /v1/swarm/sessions           — Register an agent session (with parentUid / rootSwarmId)
 * GET  /v1/swarm/ancestry/:agentId  — Recursive ancestry trace for a given agent
 * GET  /v1/swarm/map                — Full swarm topology (nodes + edges) for dashboard
 * POST /v1/swarm/revoke-tree/:agentId — Recursive revocation up the ancestry chain to root
 */

import { Router, type IRouter } from "express";
import { db, agentSessionsTable, auditLogsTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { revokeAgent, recursiveRevokeTree } from "../lib/governance";
import { requireAuth } from "../lib/requireAuth";
import { viewerScopeCondition } from "../lib/owner";

const router: IRouter = Router();

// ── POST /v1/swarm/sessions ───────────────────────────────────────────────

router.post("/v1/swarm/sessions", requireAuth, async (req, res): Promise<void> => {
  const { agentId, parentUid, rootSwarmId, swarmId } = req.body ?? {};

  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "agentId is required" });
    return;
  }

  // Derive rootSwarmId from parent if not supplied
  let resolvedRootSwarmId: string | null = rootSwarmId ?? null;
  if (!resolvedRootSwarmId && parentUid) {
    const [parentSession] = await db
      .select({ rootSwarmId: agentSessionsTable.rootSwarmId, swarmId: agentSessionsTable.swarmId })
      .from(agentSessionsTable)
      .where(eq(agentSessionsTable.agentId, parentUid))
      .limit(1);
    resolvedRootSwarmId = parentSession?.rootSwarmId ?? parentSession?.swarmId ?? null;
  }

  const [session] = await db
    .insert(agentSessionsTable)
    .values({
      agentId,
      parentUid: parentUid ?? null,
      rootSwarmId: resolvedRootSwarmId,
      swarmId: swarmId ?? null,
      status: "active",
    })
    .returning();

  res.status(201).json({ session });
});

// ── GET /v1/swarm/ancestry/:agentId ──────────────────────────────────────

router.get("/v1/swarm/ancestry/:agentId", async (req, res): Promise<void> => {
  const { agentId } = req.params;
  const ancestors: typeof agentSessionsTable.$inferSelect[] = [];

  // Start from this agent and walk up
  const [startSession] = await db
    .select()
    .from(agentSessionsTable)
    .where(eq(agentSessionsTable.agentId, agentId))
    .limit(1);

  if (!startSession) {
    res.status(404).json({ error: "No session found for agentId", agentId });
    return;
  }

  let current: typeof agentSessionsTable.$inferSelect | undefined = startSession;
  const visited = new Set<string>();

  while (current?.parentUid && !visited.has(current.parentUid)) {
    visited.add(current.parentUid);
    const [parent] = await db
      .select()
      .from(agentSessionsTable)
      .where(eq(agentSessionsTable.agentId, current.parentUid))
      .limit(1);
    if (!parent) break;
    ancestors.push(parent);
    current = parent;
  }

  res.json({
    agentId,
    session: startSession,
    ancestors,
    depth: ancestors.length,
    rootAgentId: ancestors.length > 0 ? ancestors[ancestors.length - 1]!.agentId : agentId,
  });
});

// ── GET /v1/swarm/map ─────────────────────────────────────────────────────

router.get("/v1/swarm/map", async (_req, res): Promise<void> => {
  const sessions = await db.select().from(agentSessionsTable);

  // Deduplicate: if the same agentId appears multiple times, keep the most
  // recently created session (highest createdAt). Prefer "revoked" status over
  // "active" so a later revocation always wins.
  const byAgentId = new Map<string, typeof agentSessionsTable.$inferSelect>();
  for (const s of sessions) {
    const existing = byAgentId.get(s.agentId);
    if (!existing) { byAgentId.set(s.agentId, s); continue; }
    // Prefer revoked over active, otherwise prefer newer
    const preferRevoked = s.status === "revoked" && existing.status !== "revoked";
    const newer = s.createdAt > existing.createdAt;
    if (preferRevoked || newer) byAgentId.set(s.agentId, s);
  }
  const unique = Array.from(byAgentId.values());

  const nodes = unique.map((s) => ({
    id: s.agentId,
    label: s.agentId,
    status: s.status,
    swarmId: s.swarmId,
    rootSwarmId: s.rootSwarmId,
    parentUid: s.parentUid,
    createdAt: s.createdAt,
    revokedAt: s.revokedAt,
    revokedReason: s.revokedReason,
  }));

  // Deduplicate edges too (same source→target pair only once)
  const edgeSet = new Set<string>();
  const edges: { source: string; target: string }[] = [];
  for (const s of unique) {
    if (!s.parentUid) continue;
    const key = `${s.parentUid}|${s.agentId}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ source: s.parentUid, target: s.agentId });
  }

  res.json({ nodes, edges, totalNodes: nodes.length, totalEdges: edges.length });
});

// ── POST /v1/swarm/revoke-tree/:agentId ──────────────────────────────────

router.post("/v1/swarm/revoke-tree/:agentId", requireAuth, async (req, res): Promise<void> => {
  const agentIdParam = req.params.agentId;
  if (typeof agentIdParam !== "string") {
    res.status(400).json({ error: "agentId is required" });
    return;
  }
  const agentId: string = agentIdParam;
  const { reason } = req.body ?? {};

  // IDOR guard: only allow revoking trees the viewer can see in their
  // tenant slice. Probe audit_logs for at least one row tying this agent to
  // the viewer (admins see any non-demo agent).
  const [owned] = await db
    .select({ id: auditLogsTable.id })
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.agentId, agentId), viewerScopeCondition(req)))
    .limit(1);
  if (!owned) {
    res.status(404).json({ error: "Agent not found in your scope" });
    return;
  }

  const revokedChain = await recursiveRevokeTree(agentId, reason ?? "Manual recursive revocation");
  res.json({
    revokedChain,
    totalRevoked: revokedChain.length,
    message: `Recursive revocation complete — ${revokedChain.length} agent(s) revoked up the ancestry tree.`,
  });
});

export default router;
