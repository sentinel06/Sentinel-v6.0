/**
 * ████████████████████████████████████████████████████
 *   AGENT-SENTINEL SDK  ·  TypeScript / Node.js
 *   EU AI Act Art. 12/14 Traceability Wrapper
 * ████████████████████████████████████████████████████
 *
 * Drop-in wrapper for LLM agent calls.
 * Every action is pre-authorized and every result is
 * immutably logged with SHA-256 hash chaining.
 *
 * QUICK START
 * ───────────
 *   import { SentinelClient } from "./sdk/sentinel";
 *
 *   const sentinel = new SentinelClient({
 *     baseUrl: "https://your-sentinel.replit.app/api/v1",
 *     agentId: "my-gpt-agent",
 *   });
 *
 *   // Wrap any LLM call with governance:
 *   const result = await sentinel.governed(
 *     "financial_transfer",
 *     "Transfer Q1 budget to vendor account",
 *     () => myLLM.run("transfer $5000 to acct-9847"),
 *   );
 *
 * INSTALL
 * ───────
 *   No extra dependencies — uses the built-in fetch API (Node 18+).
 *   For Node < 18, add:  npm install node-fetch
 *   and import fetch from "node-fetch".
 */

export interface SentinelConfig {
  /** Full base URL of your Sentinel API, e.g. https://my-app.replit.app/api/v1 */
  baseUrl: string;
  /** Unique identifier for this agent instance */
  agentId: string;
  /** Trace ID — auto-generated per session if omitted */
  traceId?: string;
  /** Parent trace ID for multi-agent chain tracking */
  parentTraceId?: string;
  /** Optional timeout in ms for all requests (default: 30_000) */
  timeoutMs?: number;
}

export interface AuthorizeResult {
  status: "AUTHORIZED" | "PENDING_APPROVAL" | "AUTO_BLOCKED" | "BLOCKED" | "HONEYPOT_BREACH";
  requestId: string;
  sessionHealthScore?: number;
  clusterHealthScore?: number;
  reason?: string;
  isHighRisk?: boolean;
}

export interface LogResult {
  id: string;
  traceId: string;
  currentHash: string;
  consistencyScore: number;
  isAnomalous: boolean;
  anomalyReason?: string;
}

export interface GovernedOptions {
  /** Optional rationale override passed to the log (defaults to intent) */
  rationale?: string;
  /** Called when the authorization is PENDING human approval */
  onPending?: (requestId: string) => void | Promise<void>;
  /** Called when auto-blocked by the circuit breaker */
  onBlocked?: (reason: string) => void | Promise<void>;
}

export class SentinelClient {
  private readonly baseUrl: string;
  private readonly agentId: string;
  private readonly traceId: string;
  private readonly parentTraceId?: string;
  private readonly timeoutMs: number;

  constructor(config: SentinelConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.agentId = config.agentId;
    this.traceId = config.traceId ?? SentinelClient.uuid();
    this.parentTraceId = config.parentTraceId;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  // ── Core API calls ────────────────────────────────────────────────────────

  /**
   * Request authorization before executing a high-risk action.
   * If PENDING, polls until the human operator approves/denies.
   */
  async authorize(
    actionType: string,
    intent: string,
    proposedAction: string,
  ): Promise<AuthorizeResult> {
    const res = await this.post("/authorize", {
      agentId: this.agentId,
      traceId: this.traceId,
      parentTraceId: this.parentTraceId,
      intent,
      proposedAction,
      actionType,
    });

    if (res.status === "PENDING_APPROVAL" && res.requestId) {
      // Long-poll until resolved (max ~5 minutes)
      return this.pollUntilResolved(res.requestId);
    }

    return res as AuthorizeResult;
  }

  /**
   * Immutably log an event to the Sentinel ledger.
   */
  async log(
    eventType: string,
    payload: Record<string, unknown>,
    rationale?: string,
  ): Promise<LogResult> {
    return this.post("/log", {
      agentId: this.agentId,
      traceId: this.traceId,
      parentTraceId: this.parentTraceId,
      eventType,
      payload,
      rationale,
    });
  }

  // ── High-Level Wrapper ────────────────────────────────────────────────────

  /**
   * governed() — the main drop-in wrapper for LLM calls.
   *
   * Automatically:
   *   1. Calls /v1/authorize with actionType + intent
   *   2. If authorized → runs fn()
   *   3. Logs the result (or error) to the immutable ledger
   *   4. Returns the result
   *
   * Example:
   *   const summary = await sentinel.governed(
   *     "read",
   *     "Summarize Q1 financial data",
   *     () => gpt4.complete("Summarize the attached Q1 report"),
   *   );
   */
  async governed<T>(
    actionType: string,
    intent: string,
    fn: () => T | Promise<T>,
    options: GovernedOptions = {},
  ): Promise<T> {
    const proposedAction = `${actionType}: ${intent}`;

    // Step 1 — Authorization gate
    const auth = await this.authorize(actionType, intent, proposedAction);

    if (auth.status === "PENDING_APPROVAL") {
      if (options.onPending) await options.onPending(auth.requestId);
      throw new SentinelBlockedError("PENDING_APPROVAL", "Authorization is pending human approval", auth.requestId);
    }

    if (auth.status === "AUTO_BLOCKED" || auth.status === "BLOCKED" || auth.status === "HONEYPOT_BREACH") {
      const reason = auth.reason ?? "Blocked by Sentinel circuit breaker";
      if (options.onBlocked) await options.onBlocked(reason);
      throw new SentinelBlockedError(auth.status, reason, auth.requestId);
    }

    // Step 2 — Execute
    let result: T;
    let errorOccurred: Error | null = null;

    try {
      result = await fn();
    } catch (err) {
      errorOccurred = err instanceof Error ? err : new Error(String(err));
      // Log the error before re-throwing
      await this.log("Error", {
        actionType,
        intent,
        error: errorOccurred.message,
        authRequestId: auth.requestId,
      }, options.rationale ?? intent).catch(() => {});
      throw errorOccurred;
    }

    // Step 3 — Log result
    const logPayload: Record<string, unknown> = {
      actionType,
      authRequestId: auth.requestId,
      sessionHealthScore: auth.sessionHealthScore,
      clusterHealthScore: auth.clusterHealthScore,
    };

    if (typeof result === "string") {
      logPayload.resultPreview = result.substring(0, 500);
    } else if (result !== null && typeof result === "object") {
      logPayload.resultKeys = Object.keys(result as object);
    }

    await this.log("Action", logPayload, options.rationale ?? intent);

    return result!;
  }

  /**
   * Simulate an action without writing to the ledger.
   * Useful for dry-runs and pre-flight checks.
   */
  async simulate(
    eventType: string,
    payload: Record<string, unknown>,
    rationale: string,
  ): Promise<{ consistencyScore: number; anomalyReason?: string; reasons: string[] }> {
    return this.post("/simulate", {
      agentId: this.agentId,
      traceId: this.traceId,
      eventType,
      payload,
      rationale,
    });
  }

  // ── Child client for chained agents ──────────────────────────────────────

  /**
   * Create a child SentinelClient that carries this client's traceId
   * as parentTraceId — for building multi-agent topology chains.
   *
   * Example:
   *   const planner = new SentinelClient({ baseUrl, agentId: "planner" });
   *   const writer = planner.spawnChild("writer");
   *   // writer's logs appear as children of planner in the Topology view
   */
  spawnChild(childAgentId: string, childTraceId?: string): SentinelClient {
    return new SentinelClient({
      baseUrl: this.baseUrl,
      agentId: childAgentId,
      traceId: childTraceId ?? SentinelClient.uuid(),
      parentTraceId: this.traceId,
      timeoutMs: this.timeoutMs,
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async post(path: string, body: unknown): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok && res.status !== 202 && res.status !== 403) {
        throw new SentinelError(`Sentinel API error ${res.status}: ${JSON.stringify(data)}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  private async pollUntilResolved(requestId: string, maxWaitMs = 300_000): Promise<AuthorizeResult> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${this.baseUrl}/authorize/${requestId}/status`);
      const data = await res.json();
      if (data.status && data.status !== "PENDING") {
        return data as AuthorizeResult;
      }
      await SentinelClient.sleep(1000);
    }
    throw new SentinelError("Authorization timed out waiting for human approval");
  }

  private static uuid(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older Node
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

// ── Custom Errors ─────────────────────────────────────────────────────────

export class SentinelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentinelError";
  }
}

export class SentinelBlockedError extends SentinelError {
  constructor(
    public readonly blockReason: string,
    message: string,
    public readonly requestId: string,
  ) {
    super(message);
    this.name = "SentinelBlockedError";
  }
}

// ── Default export ────────────────────────────────────────────────────────

export default SentinelClient;
