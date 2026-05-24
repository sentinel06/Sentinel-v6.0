/**
 * Rate limiting — two layers:
 *
 * Layer A — In-memory sliding window (per-minute):
 *   Tier 1 — Global: 1,000 requests per minute across all agents.
 *   Tier 2 — Per-agent: 60 requests per minute per agentId.
 *
 * Layer B — Redis daily quota (per API key):
 *   1,000 requests per 24-hour window, tracked in Redis via a single-round-trip
 *   Lua eval (INCR + conditional EXPIRE + TTL — fully atomic, no pipeline gaps).
 *   Uses REDIS_URL env var (ioredis). Falls open if Redis is unreachable
 *   so a Redis outage never blocks legitimate ingestion.
 *
 * Performance notes
 * -----------------
 * • keySlug() caches the SHA-256 hash in a process-lifetime Map so the crypto
 *   work runs at most once per unique API key (not once per request).
 * • LUA_DAILY_QUOTA executes INCR + conditional EXPIRE + TTL in a single
 *   server-side Lua call — one network round-trip regardless of outcome,
 *   including the 429 path (no separate TTL fetch needed).
 * • 429 response bodies are lean static objects — no template literals,
 *   no deep cloning, no extra allocations in the hot rejection path.
 */

import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Layer A — In-memory sliding window (per-minute)
// ─────────────────────────────────────────────────────────────────────────────

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
    const agentId: string =
      typeof req.body?.agentId === "string" ? req.body.agentId : "__unknown__";

    // ── Tier 1: global check ───────────────────────────────────────────────
    const globalCount = count(globalBucket, now);
    if (globalCount >= GLOBAL_LIMIT) {
      const retryAfter = retryAfterSeconds(globalBucket, now);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "global_rate_limit_exceeded",
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
        error: "agent_rate_limit_exceeded",
        retryAfterSeconds: retryAfter,
        tier: "agent",
        agentId,
      });
      return;
    }

    // Record hits in both buckets and proceed
    hit(globalBucket, now);
    hit(agentBucket, now);

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
export function getRateLimitStats(): {
  globalRequestsLastMinute: number;
  trackedAgents: number;
} {
  const now = Date.now();
  prune(globalBucket, now);
  return {
    globalRequestsLastMinute: globalBucket.timestamps.length,
    trackedAgents: agentBuckets.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer B — Redis-backed daily quota (1,000 req / 24 h per API key)
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_LIMIT = 1_000;
const DAILY_WINDOW_SEC = 86_400; // 24 hours
const DAILY_LIMIT_STR = String(DAILY_LIMIT);   // pre-allocated — avoids String() in hot path
const DAILY_WINDOW_STR = String(DAILY_WINDOW_SEC);

type RedisClient = import("ioredis").default;

let _redis: RedisClient | null = null;
let _redisInitPromise: Promise<RedisClient | null> | null = null;

async function getRedis(): Promise<RedisClient | null> {
  const url = process.env["REDIS_URL"];
  if (!url) return null;

  if (_redis) return _redis;
  if (_redisInitPromise) return _redisInitPromise;

  _redisInitPromise = (async (): Promise<RedisClient | null> => {
    try {
      const { default: Redis } = await import("ioredis");
      const client = new Redis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3_000,
        enableOfflineQueue: false,
      });
      client.on("error", (err) => {
        logger.warn({ err }, "ioredis error in daily quota tracker");
      });
      _redis = client;
      return client;
    } catch (err) {
      logger.warn({ err }, "Failed to initialise ioredis for daily quota; falling open");
      return null;
    }
  })();

  return _redisInitPromise;
}

// ── Hash cache — SHA-256 computed at most once per unique API key ─────────────
// Process-lifetime Map; API keys are long-lived so this stays small.
const _keySlugCache = new Map<string, string>();

function keySlug(apiKey: string): string {
  let slug = _keySlugCache.get(apiKey);
  if (slug === undefined) {
    slug = createHash("sha256").update(apiKey).digest("hex").slice(0, 40);
    _keySlugCache.set(apiKey, slug);
  }
  return slug;
}

// ── Lua script: atomic INCR + conditional EXPIRE + TTL in one round-trip ─────
// Returns a two-element array: [count, ttl].
// • INCR increments (or creates) the counter.
// • EXPIRE is only called on first hit (count == 1) to set the 24-hour window.
// • TTL is always returned so the 429 path has the retry delay without an
//   extra network call.
const LUA_DAILY_QUOTA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('TTL', KEYS[1])}
`;

interface DailyQuotaResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Atomically increment the daily counter for `apiKey` and return quota state.
 * Single Redis round-trip via Lua eval for both the allow and deny paths.
 * Falls open (allowed = true) when Redis is unreachable.
 */
export async function checkDailyQuota(apiKey: string): Promise<DailyQuotaResult> {
  const redis = await getRedis();
  if (!redis) {
    return { allowed: true, count: 0, remaining: DAILY_LIMIT, retryAfterSeconds: 0 };
  }

  const key = `rl:daily:${keySlug(apiKey)}`;
  try {
    // Single round-trip: returns [count, ttl] from Lua
    const result = await redis.eval(
      LUA_DAILY_QUOTA, 1, key, DAILY_WINDOW_STR,
    ) as [number, number];

    const count = result[0];
    const ttl   = result[1];

    if (count > DAILY_LIMIT) {
      return { allowed: false, count, remaining: 0, retryAfterSeconds: Math.max(ttl, 0) };
    }

    return { allowed: true, count, remaining: DAILY_LIMIT - count, retryAfterSeconds: 0 };
  } catch (err) {
    logger.warn({ err, key }, "Redis daily quota check failed; falling open");
    return { allowed: true, count: 0, remaining: DAILY_LIMIT, retryAfterSeconds: 0 };
  }
}

/**
 * Express middleware — enforces the Redis daily quota on partner API keys.
 * Must run after express.json() (logRateLimiter already ensures this).
 * Only applies to `sk_sent_*` keys; other auth paths (admin key, dev mode) are skipped.
 */
export function dailyKeyRateLimiter() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey =
      typeof req.headers["x-sentinel-key"] === "string"
        ? req.headers["x-sentinel-key"]
        : null;

    if (!apiKey || !apiKey.startsWith("sk_sent_")) {
      next();
      return;
    }

    const quota = await checkDailyQuota(apiKey);

    // Set headers before any branch — lean, pre-allocated strings where possible
    res.setHeader("X-RateLimit-Daily-Limit", DAILY_LIMIT_STR);
    res.setHeader("X-RateLimit-Daily-Remaining", String(quota.remaining));

    if (!quota.allowed) {
      res.setHeader("Retry-After", String(quota.retryAfterSeconds));
      // Lean static 429 body — no template literals, no extra allocations
      res.status(429).json({
        error: "daily_quota_exceeded",
        retryAfterSeconds: quota.retryAfterSeconds,
        tier: "daily",
      });
      return;
    }

    next();
  };
}
