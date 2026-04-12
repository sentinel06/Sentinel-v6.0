/**
 * Two-tier in-memory sliding window rate limiter.
 *
 * Why in-memory (not Redis)?
 * The API server runs as a single process in this environment. An in-memory
 * store is perfectly consistent at scale for single-process deployments and
 * avoids an external Redis dependency. If the service is ever horizontally
 * scaled, drop in ioredis and replace the Map with a Redis sorted-set.
 *
 * Tier 1 — Global: 1,000 requests per minute across all agents.
 *   Prevents any traffic spike from overwhelming PostgreSQL.
 *
 * Tier 2 — Per-agent: 60 requests per minute per agentId.
 *   Isolates a "chatty" runaway agent without affecting others.
 */

import type { Request, Response, NextFunction } from "express";

interface WindowEntry {
  timestamps: number[]; // epoch ms of each hit in the current window
}

const WINDOW_MS = 60_000; // 1 minute sliding window

// Global bucket
const globalBucket: WindowEntry = { timestamps: [] };

// Per-agent buckets — cleaned up lazily when checked
const agentBuckets = new Map<string, WindowEntry>();

const GLOBAL_LIMIT = 1_000;
const AGENT_LIMIT = 60;

function prune(bucket: WindowEntry, now: number): void {
  const cutoff = now - WINDOW_MS;
  // Timestamps are in insertion order, so we can slice from the front
  let i = 0;
  while (i < bucket.timestamps.length && bucket.timestamps[i] < cutoff) i++;
  if (i > 0) bucket.timestamps.splice(0, i);
}

function hit(bucket: WindowEntry, now: number): number {
  prune(bucket, now);
  bucket.timestamps.push(now);
  return bucket.timestamps.length;
}

function count(bucket: WindowEntry, now: number): number {
  prune(bucket, now);
  return bucket.timestamps.length;
}

/** Compute seconds until the oldest hit in the bucket falls out of the window */
function retryAfterSeconds(bucket: WindowEntry, now: number): number {
  if (bucket.timestamps.length === 0) return 0;
  const oldest = bucket.timestamps[0];
  return Math.ceil((oldest + WINDOW_MS - now) / 1_000);
}

/**
 * Express middleware factory for POST /v1/log rate limiting.
 *
 * Must be applied AFTER express.json() so req.body.agentId is available.
 * Returns 429 with Retry-After header and a structured error body.
 */
export function logRateLimiter() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const agentId: string = typeof req.body?.agentId === "string" ? req.body.agentId : "__unknown__";

    // ── Tier 1: global check ───────────────────────────────────────────────
    const globalCount = count(globalBucket, now);
    if (globalCount >= GLOBAL_LIMIT) {
      const retryAfter = retryAfterSeconds(globalBucket, now);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Global rate limit exceeded",
        detail: `Maximum ${GLOBAL_LIMIT} log writes per minute across all agents. Retry in ${retryAfter}s.`,
        retryAfterSeconds: retryAfter,
        tier: "global",
      });
      return;
    }

    // ── Tier 2: per-agent check ────────────────────────────────────────────
    if (!agentBuckets.has(agentId)) {
      agentBuckets.set(agentId, { timestamps: [] });
    }
    const agentBucket = agentBuckets.get(agentId)!;
    const agentCount = count(agentBucket, now);

    if (agentCount >= AGENT_LIMIT) {
      const retryAfter = retryAfterSeconds(agentBucket, now);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Per-agent rate limit exceeded",
        detail: `Agent "${agentId}" exceeded ${AGENT_LIMIT} log writes per minute. Retry in ${retryAfter}s.`,
        retryAfterSeconds: retryAfter,
        tier: "agent",
        agentId,
      });
      return;
    }

    // Record hits in both buckets and proceed
    hit(globalBucket, now);
    hit(agentBucket, now);

    // Expose remaining quota in response headers
    res.setHeader("X-RateLimit-Global-Remaining", String(GLOBAL_LIMIT - globalCount - 1));
    res.setHeader("X-RateLimit-Agent-Remaining", String(AGENT_LIMIT - agentCount - 1));
    res.setHeader("X-RateLimit-Window", "60s");

    // Lazy cleanup: remove agent buckets with no recent activity
    if (agentBuckets.size > 500) {
      for (const [id, bucket] of agentBuckets) {
        prune(bucket, now);
        if (bucket.timestamps.length === 0) agentBuckets.delete(id);
      }
    }

    next();
  };
}

/** Return current rate limit stats — used by the stats endpoint */
export function getRateLimitStats(): { globalRequestsLastMinute: number; trackedAgents: number } {
  const now = Date.now();
  prune(globalBucket, now);
  return {
    globalRequestsLastMinute: globalBucket.timestamps.length,
    trackedAgents: agentBuckets.size,
  };
}
