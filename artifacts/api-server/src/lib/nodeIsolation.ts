/**
 * Sentinel API Server — Node Isolation / Blacklist Writer
 *
 * Listens for infraction frames on sentinel:events and writes offending node
 * IDs to the shared Redis hash `sentinel:blacklist:nodes` with a 3600-second TTL.
 *
 * Handles two frame types:
 *   { type: "NODE_INFRACTION", data: { source_node_id, violation, ... } }
 *     — published by mesh-proxy sidecars on trust-decay detection
 *   { type: "kill_switch",     data: { agentId, reason, triggeredAt, ... } }
 *     — published by the gateway route on agent termination
 */

import type { Redis } from "ioredis";
import { logger } from "./logger";

export const BLACKLIST_KEY         = "sentinel:blacklist:nodes";
export const BLACKLIST_TTL_SECONDS = 3600;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BlacklistEntry {
  sourceNodeId: string;
  violation:    string;
  rootHash?:    string;
  depth?:       number;
  ts:           string;
  isolatedAt:   string;
}

// ── Write ──────────────────────────────────────────────────────────────────────

/**
 * Write a node to the isolation blacklist.
 * HSET stores the metadata; EXPIRE refreshes the TTL on every infraction so
 * that the most recently active nodes stay blacklisted the longest.
 */
export async function addToBlacklist(
  redis: Redis,
  nodeId: string,
  metadata: Omit<BlacklistEntry, "sourceNodeId" | "isolatedAt">,
): Promise<void> {
  const entry: BlacklistEntry = {
    sourceNodeId: nodeId,
    isolatedAt:   new Date().toISOString(),
    ...metadata,
  };

  await redis.hset(BLACKLIST_KEY, nodeId, JSON.stringify(entry));
  // Refresh the whole hash TTL — the last infraction sets the clock.
  await redis.expire(BLACKLIST_KEY, BLACKLIST_TTL_SECONDS);

  logger.warn(
    { nodeId, violation: entry.violation, depth: entry.depth },
    "node-isolation: node added to blacklist",
  );
}

// ── Subscriber handler ─────────────────────────────────────────────────────────

/**
 * Parse a raw sentinel:events message and, if it is an infraction frame,
 * write the offending node to the Redis blacklist.
 *
 * Designed to be called fire-and-forget from the ws.ts subscriber.
 */
export async function processIncomingFrame(
  redis: Redis,
  rawMessage: string,
): Promise<void> {
  let parsed: { type?: string; data?: Record<string, unknown> };
  try {
    parsed = JSON.parse(rawMessage) as typeof parsed;
  } catch {
    return; // malformed JSON — ignore
  }

  const { type, data } = parsed;
  if (!type || !data) return;

  // ── NODE_INFRACTION (mesh-proxy trust-decay / intent-violation) ────────────
  if (type === "NODE_INFRACTION") {
    const nodeId = data.source_node_id as string | undefined;
    if (!nodeId) {
      logger.warn({ data }, "node-isolation: NODE_INFRACTION frame missing source_node_id");
      return;
    }

    await addToBlacklist(redis, nodeId, {
      violation: (data.violation   as string | undefined) ?? "UNKNOWN",
      rootHash:  (data.rootHash    as string | undefined),
      depth:     (data.depth       as number | undefined),
      ts:        (data.ts          as string | undefined) ?? new Date().toISOString(),
    });
    return;
  }

  // ── kill_switch (gateway route agent termination) ─────────────────────────
  if (type === "kill_switch") {
    const nodeId = data.agentId as string | undefined;
    if (!nodeId) return;

    await addToBlacklist(redis, nodeId, {
      violation: "KILL_SWITCH",
      ts:        (data.triggeredAt as string | undefined) ?? new Date().toISOString(),
    });
    return;
  }
}
