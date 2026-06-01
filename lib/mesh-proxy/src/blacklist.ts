/**
 * Sentinel Mesh Sidecar — Node Blacklist Primitives
 *
 * Shared between the interceptor (read side) and the trust-decay gate (write side).
 * The API server's nodeIsolation module is the canonical writer; this module
 * provides the sidecar-local read path and the infraction-frame publisher.
 */

import type Redis from "ioredis";
import { logger } from "./logger.js";

export const BLACKLIST_KEY = "sentinel:blacklist:nodes";
const SENTINEL_EVENTS_CHANNEL = "sentinel:events";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BlacklistEntry {
  sourceNodeId: string;
  violation:    string;
  rootHash?:    string;
  depth?:       number;
  ts:           string;
  isolatedAt:   string;
}

// ── Read side (sidecar interceptor) ───────────────────────────────────────────

/**
 * Check whether a node ID is currently in the isolation blacklist.
 * Returns the metadata entry if blacklisted, null if clear.
 *
 * On Redis error, returns null (fail-open) — the circuit breaker governs
 * Redis-loss scenarios; the blacklist check should never be the primary gate.
 */
export async function checkNodeBlacklist(
  redis: Redis,
  nodeId: string,
): Promise<BlacklistEntry | null> {
  const raw = await redis.hget(BLACKLIST_KEY, nodeId);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as BlacklistEntry;
  } catch {
    // Unparseable entries are treated as blocking — malformed data in a
    // security-critical hash is suspicious enough to act on.
    logger.warn({ nodeId }, "mesh-proxy: blacklist entry unparseable — treating as isolated");
    return {
      sourceNodeId: nodeId,
      violation:    "UNKNOWN",
      ts:           "",
      isolatedAt:   "",
    };
  }
}

// ── Write side (trust-decay gate → API server) ────────────────────────────────

/**
 * Publish a NODE_INFRACTION frame to sentinel:events so the API server's
 * subscriber can write the offending node to the shared Redis blacklist hash.
 * Fire-and-forget — errors are logged but never surface to the caller.
 *
 * Frame format (consumed by api-server's nodeIsolation.processIncomingFrame):
 * { type: "NODE_INFRACTION", data: { source_node_id, violation, rootHash?, depth?, ts } }
 */
export async function publishInfractionFrame(
  redis: Redis,
  nodeId: string,
  metadata: Pick<BlacklistEntry, "violation" | "rootHash" | "depth" | "ts">,
): Promise<void> {
  const frame = JSON.stringify({
    type: "NODE_INFRACTION",
    data: {
      source_node_id: nodeId,
      violation:      metadata.violation,
      rootHash:       metadata.rootHash,
      depth:          metadata.depth,
      ts:             metadata.ts,
    },
  });

  await redis.publish(SENTINEL_EVENTS_CHANNEL, frame);
  logger.info(
    { nodeId, violation: metadata.violation },
    "mesh-proxy: infraction frame published — blacklist write delegated to API server",
  );
}
