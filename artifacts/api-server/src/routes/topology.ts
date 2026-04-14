/**
 * Topology Engine API
 *
 * GET /v1/topology/:traceId
 *   Returns the full Causal Dependency Graph for a given trace:
 *   nodes, edges, timeline, drift stats, agent/swarm breakdown.
 *
 * GET /v1/topology/:traceId/diff/:edgeId
 *   Returns the payload diff for a specific causal edge
 *   (sent payload vs received payload, field-by-field).
 */

import { Router } from "express";
import { buildTopologyGraph } from "../services/topology_mapper.js";

const router = Router();

// ── GET /v1/topology/:traceId ─────────────────────────────────────────────────
router.get("/v1/topology/:traceId", async (req, res): Promise<void> => {
  const { traceId } = req.params;

  if (!traceId || typeof traceId !== "string") {
    res.status(400).json({ error: "traceId is required" });
    return;
  }

  try {
    const graph = await buildTopologyGraph(traceId);

    if (!graph) {
      res.status(404).json({ error: "No events found for this trace", traceId });
      return;
    }

    res.json({ ok: true, graph });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Topology build failed", message });
  }
});

// ── GET /v1/topology/:traceId/diff/:edgeId ───────────────────────────────────
router.get("/v1/topology/:traceId/diff/:edgeId", async (req, res): Promise<void> => {
  const { traceId, edgeId } = req.params;

  try {
    const graph = await buildTopologyGraph(traceId);
    if (!graph) { res.status(404).json({ error: "Trace not found" }); return; }

    const edge = graph.edges.find(e => e.id === edgeId);
    if (!edge) { res.status(404).json({ error: "Edge not found" }); return; }

    // Produce a field-level diff between sent and received
    const diff = computePayloadDiff(edge.data.sent, edge.data.received);

    res.json({
      ok: true,
      edgeId,
      sourceAgent: edge.sourceAgent,
      targetAgent: edge.targetAgent,
      edgeType: edge.edgeType,
      chainIntact: edge.chainIntact,
      quantumVerified: edge.quantumVerified,
      driftBleed: edge.driftBleed,
      diff,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Diff computation failed", message });
  }
});

// ── Payload diff utility ──────────────────────────────────────────────────────
type DiffEntry = {
  key: string;
  status: "added" | "removed" | "changed" | "unchanged";
  sentValue: unknown;
  receivedValue: unknown;
};

function computePayloadDiff(sent: unknown, received: unknown): DiffEntry[] {
  const s = flattenObject(sent ?? {});
  const r = flattenObject(received ?? {});
  const allKeys = new Set([...Object.keys(s), ...Object.keys(r)]);
  const entries: DiffEntry[] = [];

  for (const key of allKeys) {
    const inSent     = key in s;
    const inReceived = key in r;
    const sv = s[key];
    const rv = r[key];

    if (!inSent) {
      entries.push({ key, status: "added",   sentValue: undefined, receivedValue: rv });
    } else if (!inReceived) {
      entries.push({ key, status: "removed", sentValue: sv, receivedValue: undefined });
    } else if (JSON.stringify(sv) !== JSON.stringify(rv)) {
      entries.push({ key, status: "changed", sentValue: sv, receivedValue: rv });
    } else {
      entries.push({ key, status: "unchanged", sentValue: sv, receivedValue: rv });
    }
  }

  // Order: changed first, then added/removed, then unchanged
  return entries.sort((a, b) => {
    const order = { changed: 0, added: 1, removed: 2, unchanged: 3 };
    return order[a.status] - order[b.status];
  });
}

function flattenObject(obj: unknown, prefix = ""): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") {
    return prefix ? { [prefix]: obj } : {};
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as object)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

export default router;
