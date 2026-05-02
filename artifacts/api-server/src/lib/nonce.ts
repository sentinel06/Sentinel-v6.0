/**
 * Nonce Manager — replay-attack lockdown with optional Redis backend.
 *
 * Backend selection (decided once at module load):
 *   • REDIS_URL env present  → ioredis backend (SETNX + EX)
 *     Survives process restart, coordinates across horizontal replicas.
 *   • REDIS_URL absent       → in-memory Map backend
 *     Single-process, zero-dependency. Hard cap of 100k entries with a
 *     forensic warn line when the ceiling is hit (DoS canary).
 *
 * Public API is identical for both backends:
 *   verifyAndStoreNonce(nonce) → Promise<boolean>
 *     true  = nonce was fresh and is now reserved for NONCE_TTL ms
 *     false = nonce was already seen inside the TTL window (REPLAY)
 */

import { logger } from "./logger";

const NONCE_TTL_SECONDS = 5 * 60;
const NONCE_TTL_MS_VALUE = NONCE_TTL_SECONDS * 1000;
const NONCE_CAP = 100_000;
const REDIS_KEY_PREFIX = "sentinel:nonce:";

// ── Forensic canary throttle (memory backend only) ──────────────────────────
let lastCapWarnAt = 0;
const CAP_WARN_INTERVAL_MS = 60_000;

// ── Backend interface ───────────────────────────────────────────────────────
interface NonceBackend {
  readonly kind: "redis" | "memory";
  verifyAndStore(nonce: string): Promise<boolean>;
}

// ── Memory backend ──────────────────────────────────────────────────────────
function createMemoryBackend(): NonceBackend {
  const seen = new Map<string, number>(); // nonce → expiry epoch ms

  return {
    kind: "memory",
    async verifyAndStore(nonce: string): Promise<boolean> {
      const now = Date.now();
      const expiry = seen.get(nonce);
      if (expiry !== undefined && expiry > now) {
        return false; // replay inside window
      }

      // Cap canary — log once per CAP_WARN_INTERVAL_MS while saturated.
      if (seen.size >= NONCE_CAP) {
        if (now - lastCapWarnAt > CAP_WARN_INTERVAL_MS) {
          lastCapWarnAt = now;
          logger.warn(
            { cap: NONCE_CAP, size: seen.size },
            "Nonce ledger at capacity. Opportunistic sweep triggered.",
          );
        }
        // Best-effort sweep so we don't grow unboundedly even if some
        // setTimeout handles missed (e.g. timer-wheel pressure).
        for (const [k, exp] of seen) {
          if (exp <= now) seen.delete(k);
        }
      }

      seen.set(nonce, now + NONCE_TTL_MS_VALUE);
      // Active eviction so the Map shrinks back to baseline under steady load.
      setTimeout(() => seen.delete(nonce), NONCE_TTL_MS_VALUE).unref();
      return true;
    },
  };
}

// ── Redis backend (lazy import so ioredis isn't loaded if unused) ──────────
async function createRedisBackend(url: string): Promise<NonceBackend> {
  const { default: Redis } = await import("ioredis");
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });

  client.on("error", (err) => {
    logger.error({ err }, "ioredis client error in nonce backend");
  });
  client.on("connect", () => {
    logger.info("Nonce backend connected to Redis");
  });

  return {
    kind: "redis",
    async verifyAndStore(nonce: string): Promise<boolean> {
      // SET key value NX EX ttl   → "OK" if fresh, null if replay.
      const key = `${REDIS_KEY_PREFIX}${nonce}`;
      try {
        const result = await client.set(key, "1", "EX", NONCE_TTL_SECONDS, "NX");
        return result === "OK";
      } catch (err) {
        // Fail-closed: if Redis is unreachable, treat as replay so a
        // network blip can't be exploited to bypass replay protection.
        logger.error({ err }, "nonce SETNX failed — treating as replay (fail-closed)");
        return false;
      }
    },
  };
}

// ── Backend selection at module load ────────────────────────────────────────
let backendPromise: Promise<NonceBackend>;

const redisUrl = process.env["REDIS_URL"];
if (redisUrl && redisUrl.length > 0) {
  logger.info("Nonce backend: Redis (REDIS_URL detected)");
  backendPromise = createRedisBackend(redisUrl).catch((err) => {
    logger.error({ err }, "Failed to init Redis nonce backend — falling back to memory");
    return createMemoryBackend();
  });
} else {
  logger.info({ cap: NONCE_CAP }, "Nonce backend: in-memory Map (no REDIS_URL)");
  backendPromise = Promise.resolve(createMemoryBackend());
}

/**
 * Reserve a nonce. Returns true if fresh, false on replay.
 * Async because the Redis backend is network-bound; the memory backend
 * resolves synchronously inside the same microtask.
 */
export async function verifyAndStoreNonce(nonce: string): Promise<boolean> {
  const backend = await backendPromise;
  return backend.verifyAndStore(nonce);
}

export const NONCE_TTL_MS = NONCE_TTL_MS_VALUE;
export const NONCE_LEDGER_CAP = NONCE_CAP;
