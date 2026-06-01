import crypto from "crypto";
import http from "http";
import https from "https";
import { URL } from "url";
import type Redis from "ioredis";
import type { CircuitBreaker } from "./circuitBreaker.js";
import { logger } from "./logger.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const SENTINEL_EVENTS_CHANNEL = "sentinel:events";

/**
 * Maximum allowed agent-to-agent recursion depth before the circuit breaker
 * is tripped and the chain is forcibly unwound (Trust Decay prevention).
 * Configurable via MESH_MAX_DEPTH env var; hard default is 5.
 */
const MAX_RECURSION_DEPTH = parseInt(
  process.env.MESH_MAX_DEPTH ?? "5",
  10,
);

/**
 * Inbound header carrying a caller-supplied root intent string.
 * When present it is used as the SHA-256 seed instead of parsing the body.
 */
const INTENT_HEADER = "x-sentinel-root-intent";

/**
 * Bidirectional trace header — read from inbound requests, written to outgoing
 * ones. Format: `root_hash=<64-hex>;depth=<N>`
 */
const TRACE_HEADER = "x-sentinel-trace";

/**
 * Known LLM tool-calling endpoint path segments — used for event classification
 * only; all paths are intercepted and mirrored regardless.
 */
const TOOL_CALL_PATHS = [
  "/v1/chat/completions", // OpenAI / Azure / local LLM
  "/v1/messages",         // Anthropic
  "/v1/completions",      // legacy OpenAI
  "/v1beta/models",       // Gemini
  "/api/v1/chat",         // Ollama
  "/api/v1/gateway",      // Sentinel gateway
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface TraceContext {
  rootHash: string;
  depth: number;
  /** Serialised value ready to inject as the X-Sentinel-Trace header. */
  headerValue: string;
  /** True when this proxy seeded the trace (no prior header found). */
  isNew: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function classifyPath(urlPath: string | undefined): string {
  if (!urlPath) return "UNKNOWN";
  for (const segment of TOOL_CALL_PATHS) {
    if (urlPath.includes(segment)) return "LLM_TOOL_CALL";
  }
  return "GENERIC";
}

/**
 * Extract the root objective string from a parsed request body.
 * Priority order:
 *   1. `rationale`         — Sentinel gateway / SDK payloads
 *   2. `system`            — Anthropic messages API
 *   3. `messages[0].content` (role=system) — OpenAI chat completions
 *   4. Full JSON stringification as fallback (still deterministic)
 */
function extractRootObjective(parsedBody: unknown): string {
  if (typeof parsedBody === "object" && parsedBody !== null) {
    const body = parsedBody as Record<string, unknown>;

    if (typeof body.rationale === "string" && body.rationale.length > 0) {
      return body.rationale;
    }

    if (typeof body.system === "string" && body.system.length > 0) {
      return body.system;
    }

    const messages = body.messages;
    if (Array.isArray(messages)) {
      for (const msg of messages as Array<Record<string, unknown>>) {
        if (msg.role === "system" && typeof msg.content === "string") {
          return msg.content;
        }
      }
      // Fall back to first message content if no system message found
      const first = messages[0] as Record<string, unknown> | undefined;
      if (first && typeof first.content === "string") {
        return first.content;
      }
    }
  }

  return JSON.stringify(parsedBody);
}

/**
 * Resolve the recursive trace context for this request.
 *
 * If `x-sentinel-trace` is already present, parse it and increment depth.
 * If `x-sentinel-root-intent` is present (but no trace yet), use it as seed.
 * Otherwise extract the root objective from the body and seed a new trace.
 */
function resolveTraceContext(
  headers: http.IncomingHttpHeaders,
  parsedBody: unknown,
): TraceContext {
  const existingTrace  = headers[TRACE_HEADER];
  const rootIntentHdr  = headers[INTENT_HEADER];

  // ── Continue an existing trace ─────────────────────────────────────────────
  const traceValue = Array.isArray(existingTrace) ? existingTrace[0] : existingTrace;
  if (typeof traceValue === "string") {
    const match = traceValue.match(/^root_hash=([0-9a-f]{64});depth=(\d+)$/);
    if (match) {
      const rootHash = match[1]!;
      const depth    = parseInt(match[2]!, 10) + 1;
      return {
        rootHash,
        depth,
        headerValue: `root_hash=${rootHash};depth=${depth}`,
        isNew: false,
      };
    }
    // Malformed trace — log and fall through to seed a new one
    logger.warn({ traceValue }, "mesh-proxy: malformed x-sentinel-trace header — reseeding");
  }

  // ── Seed a new trace ───────────────────────────────────────────────────────
  const intentValue = Array.isArray(rootIntentHdr) ? rootIntentHdr[0] : rootIntentHdr;
  const objective   = typeof intentValue === "string" && intentValue.length > 0
    ? intentValue
    : extractRootObjective(parsedBody);

  const rootHash = crypto.createHash("sha256").update(objective, "utf8").digest("hex");

  return {
    rootHash,
    depth:       0,
    headerValue: `root_hash=${rootHash};depth=0`,
    isNew:       true,
  };
}

// ── Ledger mirror ──────────────────────────────────────────────────────────────

/**
 * Publish a governance frame to sentinel:events asynchronously.
 * Fire-and-forget — errors are logged but never surface to the caller.
 */
async function mirrorToLedger(
  req: http.IncomingMessage,
  parsedBody: unknown,
  trace: TraceContext,
  redis: Redis,
  sentinelCoreUrl: string,
): Promise<void> {
  try {
    const frame = {
      source:         "MESH_SIDECAR",
      eventType:      classifyPath(req.url),
      path:           req.url,
      method:         req.method,
      payload:        parsedBody,
      sentinelCoreUrl,
      trace: {
        rootHash:  trace.rootHash,
        depth:     trace.depth,
        isNew:     trace.isNew,
      },
      ts: new Date().toISOString(),
    };

    await redis.publish(SENTINEL_EVENTS_CHANNEL, JSON.stringify(frame));
    logger.debug(
      { path: req.url, eventType: frame.eventType, depth: trace.depth, rootHash: trace.rootHash },
      "mesh-proxy: event mirrored to ledger",
    );
  } catch (err) {
    logger.error({ err }, "mesh-proxy: failed to mirror event — governance record may be incomplete");
  }
}

// ── Response writer ────────────────────────────────────────────────────────────

function writeError(
  res: http.ServerResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: code, message, ...extra }));
}

// ── Interceptor server ─────────────────────────────────────────────────────────

/**
 * Create the HTTP interception server.
 *
 * Every inbound request is processed in four steps:
 *   1. Fail-closed gate         — reject immediately if the circuit breaker is OPEN / HALF_OPEN.
 *   2. Intent trace resolution  — seed or continue the recursive trace context.
 *   3. Trust Decay gate         — if depth > MAX_RECURSION_DEPTH, trip the breaker and return 508.
 *   4. Mirror async + forward   — publish a governance frame, then proxy to upstream.
 *
 * The mirroring (step 4) is deliberately asynchronous: it never delays the
 * upstream response. Steps 1–3 add zero I/O latency.
 */
export function createInterceptorServer(
  upstreamUrl: string,
  redis: Redis,
  breaker: CircuitBreaker,
  sentinelCoreUrl: string,
): http.Server {
  const upstream     = new URL(upstreamUrl);
  const isHttps      = upstream.protocol === "https:";
  const forwardAgent = isHttps ? https : http;
  const upstreamPort = upstream.port
    ? parseInt(upstream.port, 10)
    : isHttps ? 443 : 80;

  const server = http.createServer((req, res) => {

    // ── Step 1: Fail-closed gate ───────────────────────────────────────────────
    if (breaker.isBlocking()) {
      logger.warn(
        { path: req.url, state: breaker.currentState },
        "mesh-proxy: request blocked — governance connection unavailable",
      );
      writeError(res, 503, "GOVERNANCE_DISCONNECT", [
        "Sentinel mesh sidecar: governance connection lost.",
        `Circuit state: ${breaker.currentState}.`,
        "Agent tool calls are suspended until the Sentinel data plane reconnects (fail-closed policy).",
      ].join(" "), { circuitState: breaker.currentState });
      return;
    }

    // ── Collect body ───────────────────────────────────────────────────────────
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      const bodyBuffer = Buffer.concat(chunks);

      // Parse once; reused by trace resolution and ledger mirror.
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyBuffer.toString("utf8"));
      } catch {
        parsedBody = bodyBuffer.length > 0 ? "<binary>" : null;
      }

      // ── Step 2: Resolve recursive trace context ────────────────────────────
      const trace = resolveTraceContext(req.headers, parsedBody);

      logger.debug(
        { depth: trace.depth, rootHash: trace.rootHash, isNew: trace.isNew, path: req.url },
        "mesh-proxy: trace context resolved",
      );

      // ── Step 3: Trust Decay gate ───────────────────────────────────────────
      if (trace.depth > MAX_RECURSION_DEPTH) {
        logger.error(
          {
            depth:           trace.depth,
            maxDepth:        MAX_RECURSION_DEPTH,
            rootHash:        trace.rootHash,
            path:            req.url,
          },
          "mesh-proxy: TRUST DECAY DETECTED — recursion depth exceeded, tripping circuit breaker",
        );

        // Trip the breaker: quarantine this agent chain immediately.
        breaker.trip();

        // Still mirror the violation to the ledger before blocking.
        void mirrorToLedger(req, parsedBody, trace, redis, sentinelCoreUrl);

        writeError(res, 508, "LOOP_DETECTED_TRUST_DECAY", [
          `Recursive intent depth ${trace.depth} exceeds the Sovereign maximum of ${MAX_RECURSION_DEPTH}.`,
          "Unmonitored agent-to-agent recursion detected.",
          "Circuit breaker tripped — all further traffic suspended pending governance review.",
        ].join(" "), {
          depth:    trace.depth,
          maxDepth: MAX_RECURSION_DEPTH,
          rootHash: trace.rootHash,
          circuitState: breaker.currentState,
        });
        return;
      }

      // ── Step 4a: Mirror async (fire-and-forget) ────────────────────────────
      void mirrorToLedger(req, parsedBody, trace, redis, sentinelCoreUrl);

      // ── Step 4b: Forward to upstream with trace header injected ───────────
      const outgoingHeaders: http.OutgoingHttpHeaders = {
        ...req.headers,
        host:          upstream.host,
        [TRACE_HEADER]: trace.headerValue,
        // Preserve root-intent if caller supplied it; strip otherwise to avoid
        // leaking the raw objective string further down the chain.
        ...(req.headers[INTENT_HEADER]
          ? { [INTENT_HEADER]: req.headers[INTENT_HEADER] }
          : {}),
      };

      const fwdOptions: http.RequestOptions = {
        hostname: upstream.hostname,
        port:     upstreamPort,
        path:     req.url ?? "/",
        method:   req.method,
        headers:  outgoingHeaders,
      };

      const fwdReq = forwardAgent.request(fwdOptions, (fwdRes) => {
        logger.info(
          { path: req.url, status: fwdRes.statusCode, depth: trace.depth },
          "mesh-proxy: upstream response received",
        );
        if (!res.headersSent) {
          res.writeHead(fwdRes.statusCode ?? 200, fwdRes.headers);
        }
        fwdRes.pipe(res, { end: true });
      });

      fwdReq.on("error", (err: Error) => {
        logger.error({ err: err.message, path: req.url }, "mesh-proxy: upstream request failed");
        writeError(res, 502, "UPSTREAM_ERROR",
          `Sidecar could not reach upstream (${upstream.host}): ${err.message}`);
      });

      if (bodyBuffer.length > 0) {
        fwdReq.write(bodyBuffer);
      }
      fwdReq.end();
    });

    req.on("error", (err: Error) => {
      logger.error({ err: err.message }, "mesh-proxy: inbound request error");
      writeError(res, 400, "BAD_REQUEST", err.message);
    });
  });

  server.on("error", (err: Error) => {
    logger.error({ err: err.message }, "mesh-proxy: server error");
  });

  return server;
}
