/**
 * Sentinel Mesh Sidecar — Token-Bucket Cost Firewall
 *
 * Per-node-ID token bucket that enforces an API spend velocity ceiling.
 * Tokens refill at REFILL_RATE per second up to CAPACITY; each request
 * consumes a caller-specified weight.  The check is fully synchronous so
 * it runs before any I/O in the interceptor pipeline (Step 1.2).
 *
 * Refill is computed lazily on each call using performance.now() deltas —
 * no background timer, zero I/O.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** Maximum token capacity per node bucket. */
export const TOKEN_BUCKET_CAPACITY    = 100;

/** Tokens replenished per second (continuous, fractional). */
export const TOKEN_BUCKET_REFILL_RATE = 10;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Bucket {
  tokens:     number;
  lastRefill: number; // performance.now() timestamp in ms
}

// ── TokenBucketLimiter ─────────────────────────────────────────────────────────

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Attempt to consume `tokensRequested` tokens from the bucket owned by
   * `nodeId`.  Returns `true` if the request is allowed (tokens deducted),
   * `false` if the bucket is exhausted (caller should return 429).
   *
   * A new bucket starts at full CAPACITY so the very first request is
   * always admitted (assuming tokensRequested ≤ CAPACITY).
   */
  consume(nodeId: string, tokensRequested: number): boolean {
    const now = performance.now();

    let bucket = this.buckets.get(nodeId);
    if (!bucket) {
      bucket = { tokens: TOKEN_BUCKET_CAPACITY, lastRefill: now };
      this.buckets.set(nodeId, bucket);
    }

    // Replenish tokens proportional to elapsed time since the last consume.
    const elapsedSeconds = (now - bucket.lastRefill) / 1_000;
    const replenished    = elapsedSeconds * TOKEN_BUCKET_REFILL_RATE;

    bucket.tokens     = Math.min(TOKEN_BUCKET_CAPACITY, bucket.tokens + replenished);
    bucket.lastRefill = now;

    if (bucket.tokens >= tokensRequested) {
      bucket.tokens -= tokensRequested;
      return true;
    }

    return false;
  }
}
