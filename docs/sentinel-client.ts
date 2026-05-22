/**
 * Agent-Sentinel client — zero-dependency, web-standard implementation.
 *
 * Works in any environment that exposes the Fetch API:
 *   browsers · Node ≥ 18 · Deno · Bun · Cloudflare Workers · service workers
 *
 * No Node built-in imports. No npm packages required.
 * Drop this file into your project and import directly.
 *
 * Infrastructure facts:
 *   • API latency      — 12 ms P99 (off-thread ML-DSA-87 worker pool)
 *   • Worker threads   — 4 dedicated signing threads, never blocking the event loop
 *   • Daily quota      — 1,000 requests / 24 h per API key (Redis-backed, rolling window)
 *   • Per-minute cap   — 60 requests / min per agent, 1,000 / min global
 *   • Replay defense   — X-Sentinel-Request-ID nonce checked against Redis (24 h TTL)
 */

export interface SentinelConfig {
  /** Base URL of your Agent-Sentinel deployment — e.g. https://agent-sentinel.replit.app */
  baseUrl: string;
  /** Partner API key from the /onboarding or /settings page  (sk_sent_core_…) */
  apiKey: string;
  /** Stable identifier for this agent in the audit ledger */
  agentId: string;
}

export interface LogEntry {
  traceId: string;
  eventType: string;
  rationale?: string;
  payload?: Record<string, unknown>;
}

export interface LogResult {
  ok: boolean;
  /** Ledger entry ID on success */
  id?: string;
  /** true when the daily quota (1,000 req / 24 h) is exhausted */
  rateLimited?: boolean;
  /** Seconds until the rolling quota resets */
  retryAfterSeconds?: number;
  /** Human-readable error message */
  error?: string;
}

/**
 * Generate a collision-resistant nonce using the Web Crypto API.
 * Falls back to a best-effort random string when crypto is unavailable
 * (old browsers, restricted environments) so the call always succeeds.
 */
function makeNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback: timestamp + 9 random digits — not cryptographically perfect
  // but sufficient for basic replay resistance in constrained environments.
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

/**
 * Post one audit-log event to the immutable Sentinel ledger.
 *
 * Design guarantees:
 *   ✓ Never throws — all outcomes are returned as a typed LogResult.
 *   ✓ Reads Retry-After + X-RateLimit-Daily-Remaining on HTTP 429.
 *   ✓ Fail-open on network errors so a gateway blip never crashes the host app.
 *   ✓ Uses Web Crypto for the replay-prevention nonce — zero Node dependencies.
 */
export async function postLog(
  config: SentinelConfig,
  entry: LogEntry,
): Promise<LogResult> {
  const { baseUrl, apiKey, agentId } = config;

  try {
    const response = await fetch(`${baseUrl}/api/v1/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentinel-Key": apiKey,
        "X-Sentinel-Request-ID": makeNonce(),
      },
      body: JSON.stringify({ agentId, ...entry }),
    });

    // ── Daily quota exhausted ──────────────────────────────────────────────
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const dailyRemaining = response.headers.get("X-RateLimit-Daily-Remaining");
      return {
        ok: false,
        rateLimited: true,
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
        error:
          dailyRemaining === "0"
            ? "Daily quota of 1,000 requests per 24 h exhausted."
            : "Per-minute rate limit reached — back off and retry.",
      };
    }

    // ── Other HTTP errors ──────────────────────────────────────────────────
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      return {
        ok: false,
        error: (body["error"] as string | undefined) ?? `HTTP ${response.status}`,
      };
    }

    // ── Success ────────────────────────────────────────────────────────────
    const data = await response.json() as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    // Network error, DNS failure, JSON parse fault — fail open.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown network error",
    };
  }
}

/**
 * Wrap any async function with before/after audit logging.
 *
 * The wrapped function always executes even when the pre-log call fails
 * (fail-open). Two ledger entries are committed:
 *   1. <eventType>         — before fn() runs
 *   2. <eventType>:complete — after fn() resolves
 *
 * Usage:
 *   const summary = await governed(config, traceId, "SummarizeReport",
 *     "Summarize Q1 financials for board deck",
 *     () => llm.complete("Summarize Q1..."),
 *   );
 */
export async function governed<T>(
  config: SentinelConfig,
  traceId: string,
  eventType: string,
  rationale: string,
  fn: () => Promise<T>,
): Promise<T> {
  await postLog(config, {
    traceId,
    eventType,
    rationale,
    payload: { phase: "start" },
  });

  const result = await fn();

  await postLog(config, {
    traceId,
    eventType: `${eventType}:complete`,
    rationale,
    payload: { phase: "complete" },
  });

  return result;
}

// ── Quick-start example (remove before committing to production) ───────────
//
// const sentinel: SentinelConfig = {
//   baseUrl: "https://agent-sentinel.replit.app",
//   apiKey:  "sk_sent_core_YOUR_KEY_HERE",
//   agentId: "my-agent-v1",
// };
//
// const result = await postLog(sentinel, {
//   traceId:   globalThis.crypto.randomUUID(),
//   eventType: "DataFetch",
//   rationale: "Fetching Q1 sales report for analysis",
//   payload:   { source: "warehouse", rows: 4200 },
// });
//
// if (!result.ok) {
//   if (result.rateLimited) {
//     console.warn(`Rate limited — retry in ${result.retryAfterSeconds}s`);
//   } else {
//     console.error("Sentinel log failed:", result.error);
//     // Continue executing — Sentinel is fail-open by design.
//   }
// }
