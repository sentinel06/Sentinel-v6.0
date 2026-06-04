/**
 * statePublisher — Server-side push for swarm map and system status
 *
 * Replaces per-client polling by broadcasting derived state over the shared
 * WebSocket channel whenever it changes:
 *
 *   "swarm_map"       — node/edge graph for every agent session
 *                        debounced at 300 ms; triggered by every StreamManager flush
 *   "integrity_status" — global hash-chain tamper check
 *                        debounced at 6 000 ms; triggered by StreamManager flush
 *   "status_update"   — latest sovereign pulse snapshot
 *                        called directly from pulse_engine after each pulse write
 *
 * All three broadcasts carry the same shape as the equivalent REST responses so
 * clients can swap polling fetch() calls for event listeners with zero data-model
 * changes.
 */

import { db, agentSessionsTable, systemPulsesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { verifyHashChain } from "../lib/integrity.js";
import { broadcastGovernanceEvent } from "../lib/ws.js";
import { logger } from "../lib/logger.js";

// ── Swarm-map debounce ────────────────────────────────────────────────────────

let swarmTimer: ReturnType<typeof setTimeout> | null = null;
const SWARM_DEBOUNCE_MS = 300;

export function scheduleSwarmMapPublish(): void {
  if (swarmTimer !== null) return;
  swarmTimer = setTimeout(() => {
    swarmTimer = null;
    void publishSwarmMap().catch((err: unknown) =>
      logger.warn({ err }, "statePublisher: swarm_map push failed"),
    );
  }, SWARM_DEBOUNCE_MS);
}

async function publishSwarmMap(): Promise<void> {
  const sessions = await db.select().from(agentSessionsTable);

  // Deduplicate: same logic as GET /v1/swarm/map
  const byAgentId = new Map<string, typeof agentSessionsTable.$inferSelect>();
  for (const s of sessions) {
    const existing = byAgentId.get(s.agentId);
    if (!existing) { byAgentId.set(s.agentId, s); continue; }
    const preferRevoked = s.status === "revoked" && existing.status !== "revoked";
    const newer = s.createdAt > existing.createdAt;
    if (preferRevoked || newer) byAgentId.set(s.agentId, s);
  }
  const unique = Array.from(byAgentId.values());

  const nodes = unique.map((s) => ({
    id:            s.agentId,
    label:         s.agentId,
    status:        s.status,
    swarmId:       s.swarmId,
    rootSwarmId:   s.rootSwarmId,
    parentUid:     s.parentUid,
    createdAt:     s.createdAt,
    revokedAt:     s.revokedAt,
    revokedReason: s.revokedReason,
  }));

  const edgeSet = new Set<string>();
  const edges: { source: string; target: string }[] = [];
  for (const s of unique) {
    if (!s.parentUid) continue;
    const key = `${s.parentUid}|${s.agentId}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ source: s.parentUid, target: s.agentId });
  }

  broadcastGovernanceEvent("swarm_map", {
    nodes,
    edges,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  });
}

// ── Integrity-status debounce ─────────────────────────────────────────────────

let integrityTimer: ReturnType<typeof setTimeout> | null = null;
const INTEGRITY_DEBOUNCE_MS = 6_000;

export function scheduleIntegrityPublish(): void {
  if (integrityTimer !== null) return;
  integrityTimer = setTimeout(() => {
    integrityTimer = null;
    void publishIntegrityStatus().catch((err: unknown) =>
      logger.warn({ err }, "statePublisher: integrity_status push failed"),
    );
  }, INTEGRITY_DEBOUNCE_MS);
}

async function publishIntegrityStatus(): Promise<void> {
  const status = await verifyHashChain();
  broadcastGovernanceEvent("integrity_status", {
    ...status,
    lastVerifiedAt: new Date().toISOString(),
    scope: "global",
  });
}

// ── Status-update (sovereign pulse) ──────────────────────────────────────────
// Called directly by pulse_engine after each pulse insert — no debounce needed
// because pulses fire every few hours, not on every log insert.

export function publishStatusUpdate(pulse: Record<string, unknown>): void {
  broadcastGovernanceEvent("status_update", pulse);
}
