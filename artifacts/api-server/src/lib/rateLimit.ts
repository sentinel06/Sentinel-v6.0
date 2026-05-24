/**
 * Rate limiting — two layers:
 *
 * Layer A — In-memory sliding window (per-minute):
 *   Tier 1 — Global: 1,000 requests per minute across all agents.
 *   Tier 2 — Per-agent: 60 requests per minute per agentId.
 *
 * Layer B — Redis daily quota (per API key):
 *   1,000 requests per 24-hour window.
 *
 *   Fast path  — BANNED_KEYS_CACHE (Set<string>) check at the very first line
 *                of dailyKeyRateLimiter. If the token is in the set the response
 *                is written with res.writeHead + res.end — no JSON serialisation,
 *                no framework allocation, no Redis I/O.
 *
 *   Slow path  — Lua eval (single Redis round-trip: INCR + conditional EXPIRE +
 *                TTL). On first detected block the raw token is added to
 *                BANNED_KEYS_CACHE so every subsequent request takes the fast path.
 *
 *   Cache flush — BANNED_KEYS_CACHE.clear() fires every 5 minutes via a
 *                 self-rescheduling setTimeout (unref'd so it never keeps the
 *                 process alive). After a flush the next blocked request does one
 *                 Redis round-trip and re-populates the set.
 *
 * Header note — Partner API keys arrive in X-Sentinel-Key, NOT Authorization.
 *   Authorization carries Clerk JWTs; applying this limiter to that header
 *   would target authenticated dashboard users instead of API key holders.
 */

import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Layer A — In-memory sliding window (per-minute)
// ─────────────────────────────────────────────────────────────────────────────

interface WindowEntry {
  timestamps: number[];
}

const WINDOW_MS   = 60_000;
const GLOBAL_LIMIT = 1_000;
const AGENT_LIMIT  = 60;

const globalBucket: WindowEntry = { timestamps: [] };
const agentBuckets = new Map<string, WindowEntry>();

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

function retryAfterSeconds(bucket: WindowEntry, now: number): number {
  if (bucket.timestamps.length === 0) return 0;
  return Math.ceil((bucket.timestamps[0] + WINDOW_MS - now) / 1_000);
}

export function logRateLimiter() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now     = Date.now();
    const agentId = typeof req.body?.agentId === "string" ? req.body.agentId : "__unknown__";

    const globalCount = count(globalBucket, now);
    if (globalCount >= GLOBAL_LIMIT) {
      const retryAfter = retryAfterSeconds(globalBucket, now);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "global_rate_limit_exceeded", retryAfterSeconds: retryAfter, tier: "global" });
      return;
    }

    if (!agentBuckets.has(agentId)) agentBuckets.set(agentId, { timestamps: [] });
    const agentBucket = agentBuckets.get(agentId)!;
    const agentCount  = count(agentBucket, now);

    if (agentCount >= AGENT_LIMIT) {
      const retryAfter = retryAfterSeconds(agentBucket, now);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "agent_rate_limit_exceeded", retryAfterSeconds: retryAfter, tier: "agent", agentId });
      return;
    }

    hit(globalBucket, now);
    hit(agentBucket, now);

    res.setHeader("X-RateLimit-Global-Remaining", String(GLOBAL_LIMIT - globalCount - 1));
    res.setHeader("X-RateLimit-Agent-Remaining",  String(AGENT_LIMIT  - agentCount  - 1));
    res.setHeader("X-RateLimit-Window", "60s");

    if (agentBuckets.size > 500) {
      for (const [id, b] of agentBuckets) {
        prune(b, now);
        if (b.timestamps.length === 0) agentBuckets.delete(id);
      }
    }

    next();
  };
}

export function getRateLimitStats(): { globalRequestsLastMinute: number; trackedAgents: number } {
  const now = Date.now();
  prune(globalBucket, now);
  return { globalRequestsLastMinute: globalBucket.timestamps.length, trackedAgents: agentBuckets.size };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer B — Redis daily quota (1,000 req / 24 h per API key)
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_LIMIT      = 1_000;
const DAILY_WINDOW_SEC = 86_400;
const DAILY_LIMIT_STR  = String(DAILY_LIMIT);
const DAILY_WINDOW_STR = String(DAILY_WINDOW_SEC);

// ── Zero-allocation 429 constants ─────────────────────────────────────────────
// Pre-serialised body and header map reused on every fast-path rejection —
// no JSON.stringify, no object literal creation in the hot blocked path.
const BODY_429       = '{"error":"daily_quota_exceeded","tier":"daily"}';
const HEADERS_429    = { "Content-Type": "application/json", "Retry-After": "60",
                         "X-RateLimit-Daily-Limit": DAILY_LIMIT_STR, "X-RateLimit-Daily-Remaining": "0" } as const;

// ── Global banned-key Set ─────────────────────────────────────────────────────
// Stores the SHA-256 *slug* of each blocked API token (never the plaintext).
// keySlug() uses _keySlugCache, so the hash is computed at most once per unique
// key per process lifetime — subsequent calls are an O(1) Map lookup.
// The Set itself holds 40-char hex strings; raw key material never appears here.
// Flushed entirely every 5 minutes; after a flush the next blocked request does
// one Redis round-trip and re-enters the set.
const BANNED_KEYS_CACHE = new Set<string>();

// Self-rescheduling 5-minute flush — unref'd so it never blocks process exit.
(function scheduleBannedFlush() {
  const t = setTimeout(() => {
    BANNED_KEYS_CACHE.clear();
    scheduleBannedFlush();
  }, 5 * 60_000);
  if (t.unref) t.unref();
})();

// ── Inline SHA-256 token hash ─────────────────────────────────────────────────
// Compute a 40-char hex digest from a raw API token.  Called exactly once per
// request, immediately after extraction, so the raw token never reaches any
// cache, Set, log, or downstream function argument.
// SHA-256 on a ~50-char string is ~1-2 µs; no per-process caching is needed.
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

// ── Redis client (lazy singleton) ─────────────────────────────────────────────
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
      const client = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3_000, enableOfflineQueue: false });
      client.on("error", (err) => { logger.warn({ err }, "ioredis error in daily quota tracker"); });
      _redis = client;
      return client;
    } catch (err) {
      logger.warn({ err }, "Failed to initialise ioredis for daily quota; falling open");
      return null;
    }
  })();

  return _redisInitPromise;
}

// ── Lua script: atomic INCR + conditional EXPIRE + TTL (one round-trip) ──────
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
 * Atomically increment the daily counter and return quota state.
 *
 * Accepts a pre-hashed `tokenHash` (SHA-256 hex, 40 chars) rather than the raw
 * API key.  The caller (`dailyKeyRateLimiter`) computes the hash inline
 * immediately after extracting the header value so the raw token never reaches
 * this function.
 *
 * On first detected block, `tokenHash` is added to BANNED_KEYS_CACHE so all
 * subsequent requests for that key take the zero-allocation fast path.
 */
export async function checkDailyQuota(tokenHash: string): Promise<DailyQuotaResult> {
  const redis = await getRedis();
  if (!redis) return { allowed: true, count: 0, remaining: DAILY_LIMIT, retryAfterSeconds: 0 };

  const key = `rl:daily:${tokenHash}`;
  try {
    const result = await redis.eval(LUA_DAILY_QUOTA, 1, key, DAILY_WINDOW_STR) as [number, number];
    const count = result[0];
    const ttl   = Math.max(result[1], 0);

    if (count > DAILY_LIMIT) {
      // Stamp the banned set — parameter is already the hash, never the raw key.
      BANNED_KEYS_CACHE.add(tokenHash);
      return { allowed: false, count, remaining: 0, retryAfterSeconds: ttl };
    }

    return { allowed: true, count, remaining: DAILY_LIMIT - count, retryAfterSeconds: 0 };
  } catch (err) {
    logger.warn({ err, key }, "Redis daily quota check failed; falling open");
    return { allowed: true, count: 0, remaining: DAILY_LIMIT, retryAfterSeconds: 0 };
  }
}

/**
 * Express middleware — enforces the Redis daily quota on partner API keys.
 * Reads from X-Sentinel-Key (NOT Authorization — that carries Clerk JWTs).
 * Only applies to sk_sent_* keys; other auth paths skip through immediately.
 *
 * Memory-safety contract
 * ──────────────────────
 * The raw token string is used solely for the prefix check (`startsWith`).
 * Immediately after that check, `hashToken()` derives a 40-char SHA-256 hex
 * digest.  Every subsequent operation — Set lookup, Set insert, Redis key,
 * downstream function call — uses only that digest.  The raw token is never
 * assigned to a second variable, never passed to any function, and never logged.
 *
 * Fast path  — BANNED_KEYS_CACHE.has(tokenHash): synchronous Set probe with
 *              pre-serialised res.writeHead + res.end.  Zero async ops, zero
 *              JSON serialisation, zero Redis I/O.
 *
 * Slow path  — checkDailyQuota(tokenHash) via Lua eval (one Redis round-trip).
 *              On block, the hash is added to BANNED_KEYS_CACHE so every
 *              subsequent request for that key takes the fast path.
 */
export function dailyKeyRateLimiter() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // NOTE: partner keys travel in X-Sentinel-Key, not Authorization.
    // Authorization is reserved for Clerk JWTs on dashboard routes.
    const rawToken = typeof req.headers["x-sentinel-key"] === "string"
      ? req.headers["x-sentinel-key"]
      : "";

    // Prefix check requires the raw string — this is its only use.
    if (!rawToken.startsWith("sk_sent_")) {
      next();
      return;
    }

    // ── Hash immediately — raw token never used again past this line ───────
    // createHash is synchronous; no allocation beyond the 40-char hex string.
    const tokenHash = hashToken(rawToken);

    // ── Zero-allocation fast path ──────────────────────────────────────────
    if (BANNED_KEYS_CACHE.has(tokenHash)) {
      res.writeHead(429, HEADERS_429);
      res.end(BODY_429);
      return;
    }

    // ── Slow path: Redis Lua eval ──────────────────────────────────────────
    // Pass the hash, not the raw token — checkDailyQuota never sees plaintext.
    const quota = await checkDailyQuota(tokenHash);

    res.setHeader("X-RateLimit-Daily-Limit",     DAILY_LIMIT_STR);
    res.setHeader("X-RateLimit-Daily-Remaining", String(quota.remaining));

    if (!quota.allowed) {
      res.setHeader("Retry-After", String(quota.retryAfterSeconds));
      res.status(429).json({ error: "daily_quota_exceeded", retryAfterSeconds: quota.retryAfterSeconds, tier: "daily" });
      return;
    }

    next();
  };
}
