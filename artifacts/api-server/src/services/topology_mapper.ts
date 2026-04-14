/**
 * Topology Mapper — Causal Dependency Graph Builder
 *
 * Takes a TraceID, fetches all linked events ordered by timestamp, and builds:
 *  · Nodes   — atomic actions typed by content (Memory_Recall, API_Call, etc.)
 *  · Edges   — causal handoffs with chain integrity + quantum verification status
 *  · Drift propagation — accumulated drift that bleeds onto subsequent edges
 *  · Timeline buckets — millisecond offsets for Timeline Scrub replay
 */

import { db, auditLogsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

// ── Node types ────────────────────────────────────────────────────────────────
export type NodeType =
  | "Memory_Recall"
  | "API_Call"
  | "Logic_Branch"
  | "Tool_Call"
  | "Intent"
  | "Action"
  | "Result"
  | "Error"
  | "Override"
  | "Breach"
  | "Verification"
  | "Pulse";

// ── Shape definitions ─────────────────────────────────────────────────────────
export interface TopoNode {
  id: string;           // "node-<eventId>"
  eventId: string;
  agentId: string;
  eventType: string;
  nodeType: NodeType;
  label: string;        // short human-readable label
  timestamp: string;    // ISO
  offsetMs: number;     // ms from trace start
  drift: number;        // 0-100 (100 = fully anomalous)
  payload: unknown;
  rationale?: string | null;
  quantumVerified: boolean;
  currentHash: string;
  previousHash?: string | null;
  isAnomalous: boolean;
  swarmId?: string | null;
  parentAgentId?: string | null;
}

export interface TopoEdge {
  id: string;           // "edge-<srcId>-<tgtId>"
  source: string;       // node id
  target: string;       // node id
  edgeType: "sequential" | "handoff" | "result_to_intent" | "cross_swarm";
  chainIntact: boolean;
  quantumVerified: boolean;
  driftBleed: number;   // 0-1: how much upstream drift is bleeding through
  accDrift: number;     // accumulated drift on this edge for heatmap intensity
  data: {
    sent: unknown;      // source payload (what was sent)
    received: unknown;  // target payload (what was received)
  };
  sourceAgent: string;
  targetAgent: string;
  timestamp: string;
  offsetMs: number;
}

export interface TopologyGraph {
  traceId: string;
  nodes: TopoNode[];
  edges: TopoEdge[];
  agentIds: string[];
  swarmIds: string[];
  startTime: string;
  endTime: string;
  durationMs: number;
  /** Ordered list of [nodeId, offsetMs] for timeline scrub */
  timeline: Array<{ nodeId: string; edgeId?: string; offsetMs: number }>;
  stats: {
    totalNodes: number;
    brokenLinks: number;
    avgDrift: number;
    handoffs: number;
    quantumVerifiedPct: number;
  };
}

// ── Node type inference ───────────────────────────────────────────────────────
function inferNodeType(eventType: string, payload: unknown): NodeType {
  if (eventType === "HUMAN_IN_THE_LOOP_OVERRIDE") return "Override";
  if (
    eventType === "HONEY_TOKEN_BREACH" ||
    eventType === "HONEY_TOKEN_TRIGGERED" ||
    eventType === "REVOCATION" ||
    eventType === "KILL_SWITCH" ||
    eventType === "DRIFT_LOCKOUT"
  ) return "Breach";
  if (eventType === "Error") return "Error";
  if (eventType === "Result") return "Result";
  if (eventType === "CIRCUIT_BREAKER_OPEN") return "Verification";
  if (eventType === "SOVEREIGN_PULSE") return "Pulse";

  const p = payload as Record<string, unknown> | null;
  if (!p) return eventType === "Intent" ? "Intent" : "Action";

  // Check tool field
  const tool = String(p.tool ?? p.toolName ?? p.action ?? "").toLowerCase();
  if (tool) {
    if (/memory|recall|retrieve|store|embed|vector/i.test(tool)) return "Memory_Recall";
    if (/api|http|fetch|request|rest|graphql|webhook/i.test(tool)) return "API_Call";
    if (/branch|condition|route|switch|if|decision/i.test(tool)) return "Logic_Branch";
    return "Tool_Call";
  }

  // Check payload keys
  const keys = Object.keys(p).join(" ").toLowerCase();
  if (/memory|recall|retrieve|embedding/i.test(keys)) return "Memory_Recall";
  if (/api|http|url|endpoint/i.test(keys)) return "API_Call";
  if (/branch|condition|decision/i.test(keys)) return "Logic_Branch";

  return eventType === "Intent" ? "Intent" : "Action";
}

function buildNodeLabel(eventType: string, nodeType: NodeType, payload: unknown): string {
  const p = payload as Record<string, unknown> | null;
  const tool = p ? String(p.tool ?? p.toolName ?? p.action ?? "") : "";
  if (tool) return `${nodeType.replace("_", " ")}: ${tool}`;
  if (p?.step) return `Step ${p.step}: ${nodeType.replace("_", " ")}`;
  if (nodeType !== "Intent" && nodeType !== "Action") return nodeType.replace("_", " ");
  return eventType;
}

// ── Main builder ──────────────────────────────────────────────────────────────
export async function buildTopologyGraph(
  traceId: string
): Promise<TopologyGraph | null> {
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.traceId, traceId))
    .orderBy(asc(auditLogsTable.timestamp));

  if (rows.length === 0) return null;

  const startMs = new Date(rows[0].timestamp as any).getTime();
  const endMs   = new Date(rows[rows.length - 1].timestamp as any).getTime();
  const durationMs = Math.max(1, endMs - startMs);

  // Build nodes
  const nodes: TopoNode[] = rows.map((row) => {
    const drift = Math.max(0, Math.min(100,
      (1 - (row.consistencyScore ?? 1.0)) * 100
    ));
    const ts = new Date(row.timestamp as any).toISOString();
    const offsetMs = new Date(row.timestamp as any).getTime() - startMs;
    const nodeType = inferNodeType(row.eventType, row.payload);

    return {
      id: `node-${row.id}`,
      eventId: row.id,
      agentId: row.agentId,
      eventType: row.eventType,
      nodeType,
      label: buildNodeLabel(row.eventType, nodeType, row.payload),
      timestamp: ts,
      offsetMs,
      drift,
      payload: row.payload,
      rationale: row.rationale ?? null,
      quantumVerified: !!(
        (row as any).pqSignature ||
        (row as any).quantumSig
      ),
      currentHash: row.currentHash ?? "",
      previousHash: row.previousHash ?? null,
      isAnomalous: row.isAnomalous ?? false,
      swarmId:       (row as any).swarmId ?? null,
      parentAgentId: (row as any).parentAgentId ?? null,
    };
  });

  // Build edges: sequential + handoff + cross-swarm
  const edges: TopoEdge[] = [];
  let accumulatedDrift = 0;

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const prevNode = nodes[i - 1];
    const currNode = nodes[i];

    const chainIntact = curr.previousHash !== null && curr.previousHash === prev.currentHash;

    const isHandoff = prev.agentId !== curr.agentId;
    const isCrossSwarm =
      (prev as any).swarmId &&
      (curr as any).swarmId &&
      (prev as any).swarmId !== (curr as any).swarmId;

    const edgeType: TopoEdge["edgeType"] = isCrossSwarm
      ? "cross_swarm"
      : isHandoff
      ? "handoff"
      : prev.eventType === "Result" && curr.eventType === "Intent"
      ? "result_to_intent"
      : "sequential";

    // Drift bleed: current node's parent's drift propagates forward
    accumulatedDrift = Math.max(prevNode.drift, accumulatedDrift * 0.5);
    const driftBleed = Math.min(1, accumulatedDrift / 100);

    edges.push({
      id: `edge-${prev.id}-${curr.id}`,
      source: prevNode.id,
      target: currNode.id,
      edgeType,
      chainIntact,
      quantumVerified: currNode.quantumVerified,
      driftBleed,
      accDrift: accumulatedDrift,
      data: {
        sent:     prev.payload,
        received: curr.payload,
      },
      sourceAgent: prev.agentId,
      targetAgent: curr.agentId,
      timestamp: currNode.timestamp,
      offsetMs:  currNode.offsetMs,
    });
  }

  // Timeline for scrub: merge nodes + edges ordered by offsetMs
  const timeline: TopologyGraph["timeline"] = [
    ...nodes.map(n => ({ nodeId: n.id, offsetMs: n.offsetMs })),
    ...edges.map(e => ({ nodeId: e.target, edgeId: e.id, offsetMs: e.offsetMs })),
  ].sort((a, b) => a.offsetMs - b.offsetMs);

  const agentIds = [...new Set(nodes.map(n => n.agentId))];
  const swarmIds = [...new Set(nodes.map(n => n.swarmId).filter(Boolean) as string[])];

  const brokenLinks = edges.filter(e => !e.chainIntact).length;
  const avgDrift = nodes.reduce((s, n) => s + n.drift, 0) / (nodes.length || 1);
  const handoffs = edges.filter(e => e.edgeType === "handoff" || e.edgeType === "cross_swarm").length;
  const quantumVerifiedPct =
    (edges.filter(e => e.quantumVerified).length / Math.max(1, edges.length)) * 100;

  return {
    traceId,
    nodes,
    edges,
    agentIds,
    swarmIds,
    startTime: nodes[0].timestamp,
    endTime:   nodes[nodes.length - 1].timestamp,
    durationMs,
    timeline,
    stats: { totalNodes: nodes.length, brokenLinks, avgDrift, handoffs, quantumVerifiedPct },
  };
}
