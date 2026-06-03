/**
 * Sentinel Mesh Sidecar — HTTP Interceptor
 *
 * Five-step pipeline per request:
 *   1.   Fail-closed gate       — block if circuit breaker is OPEN / HALF_OPEN
 *   1.2  Cost firewall          — token-bucket rate limiter per node ID (429 on exhaustion)
 *   1.5  Node isolation gate    — block if the caller's node ID is blacklisted
 *   2.   Intent trace           — seed or continue the recursive trace context
 *   3.   Trust Decay gate       — block + trip breaker if depth > MAX_RECURSION_DEPTH
 *   4.   Mirror async + forward — publish governance frame; proxy to upstream
 */

import crypto from "crypto";
import http from "http";
import https from "https";
import { URL } from "url";
import type Redis from "ioredis";
import type { CircuitBreaker } from "./circuitBreaker.js";
import { checkNodeBlacklist, publishInfractionFrame } from "./blacklist.js";
import { TokenBucketLimiter } from "./rateLimiter.js";
import { logger } from "./logger.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const SENTINEL_EVENTS_CHANNEL = "sentinel:events";

/**
 * Maximum allowed agent-to-agent recursion depth before the circuit breaker
 * is tripped and the chain is forcibly unwound (Trust Decay prevention).
 * Configurable via MESH_MAX_DEPTH env var; hard default is 5.
 * Exported for unit tests.
 */
export const MAX_RECURSION_DEPTH = parseInt(
  process.env.MESH_MAX_DEPTH ?? "5",
  10,
);

/** Header callers use to identify their node in the mesh. */
const NODE_ID_HEADER = "x-sentinel-node-id";

/** This sidecar's own node identity (fallback when header is absent). */
const MESH_NODE_ID = process.env.MESH_NODE_ID ?? null;

/** Header carrying a caller-supplied root intent string. */
const INTENT_HEADER = "x-sentinel-root-intent";

/** Bidirectional trace header. Format: `root_hash=<64-hex>;depth=<N>` */
const TRACE_HEADER = "x-sentinel-trace";

/** LLM endpoint segments — for event classification only; all paths are intercepted. */
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
  rootHash:    string;
  depth:       number;
  headerValue: string;
  isNew:       boolean;
}

// ── Pure helpers (exported for unit tests) ─────────────────────────────────────

function classifyPath(urlPath: string | undefined): string {
  if (!urlPath) return "UNKNOWN";
  for (const segment of TOOL_CALL_PATHS) {
    if (urlPath.includes(segment)) return "LLM_TOOL_CALL";
  }
  return "GENERIC";
}

/**
 * Extract the root objective string from a parsed request body.
 * Exported for unit testing.
 * Priority: rationale → system → OpenAI system message → first message → JSON fallback.
 */
export function extractRootObjective(parsedBody: unknown): string {
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
 * Exported for unit testing.
 */
export function resolveTraceContext(
  headers: http.IncomingHttpHeaders,
  parsedBody: unknown,
): TraceContext {
  const existingTrace = headers[TRACE_HEADER];
  const rootIntentHdr = headers[INTENT_HEADER];

  const traceValue = Array.isArray(existingTrace) ? existingTrace[0] : existingTrace;
  if (typeof traceValue === "string") {
    const match = traceValue.match(/^root_hash=([0-9a-f]{64});depth=(\d+)$/);
    if (match) {
      const rootHash = match[1]!;
      const depth    = parseInt(match[2]!, 10) + 1;
      return { rootHash, depth, headerValue: `root_hash=${rootHash};depth=${depth}`, isNew: false };
    }
    logger.warn({ traceValue }, "mesh-proxy: malformed x-sentinel-trace header — reseeding");
  }

  const intentValue = Array.isArray(rootIntentHdr) ? rootIntentHdr[0] : rootIntentHdr;
  const objective   = typeof intentValue === "string" && intentValue.length > 0
    ? intentValue
    : extractRootObjective(parsedBody);

  const rootHash = crypto.createHash("sha256").update(objective, "utf8").digest("hex");
  return { rootHash, depth: 0, headerValue: `root_hash=${rootHash};depth=0`, isNew: true };
}

// ── Async helpers ──────────────────────────────────────────────────────────────

/** Promisify body collection so the main handler can use async/await cleanly. */
function collectBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data",  (chunk: Buffer) => chunks.push(chunk));
    req.on("end",   () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Mirror to sentinel:events async — fire-and-forget. */
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
      trace: { rootHash: trace.rootHash, depth: trace.depth, isNew: trace.isNew },
      ts:             new Date().toISOString(),
    };
    await redis.publish(SENTINEL_EVENTS_CHANNEL, JSON.stringify(frame));
    logger.debug(
      { path: req.url, eventType: frame.eventType, depth: trace.depth },
      "mesh-proxy: event mirrored to ledger",
    );
  } catch (err) {
    logger.error({ err }, "mesh-proxy: failed to mirror event — governance record may be incomplete");
  }
}

/** Write a structured error response. */
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

// ── Core async handler ─────────────────────────────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  upstream: URL,
  upstreamPort: number,
  forwardAgent: typeof http | typeof https,
  redis: Redis,
  breaker: CircuitBreaker,
  sentinelCoreUrl: string,
  limiter: TokenBucketLimiter,
): Promise<void> {

  // Resolve the calling node ID once — used by Step 1.2 (cost firewall) and
  // Step 1.5 (isolation gate).  Prefer the inbound header; fall back to the
  // sidecar's own MESH_NODE_ID for self-isolation support.
  const rawNodeId = req.headers[NODE_ID_HEADER];
  const nodeId    = (Array.isArray(rawNodeId) ? rawNodeId[0] : rawNodeId) ?? MESH_NODE_ID;

  // ── Step 1: Fail-closed gate ─────────────────────────────────────────────────
  if (breaker.isBlocking()) {
    logger.warn({ path: req.url, state: breaker.currentState },
      "mesh-proxy: request blocked — governance connection unavailable");
    writeError(res, 503, "GOVERNANCE_DISCONNECT", [
      "Sentinel mesh sidecar: governance connection lost.",
      `Circuit state: ${breaker.currentState}.`,
      "Agent tool calls are suspended until the Sentinel data plane reconnects (fail-closed policy).",
    ].join(" "), { circuitState: breaker.currentState });
    return;
  }

  // ── Step 1.2: Cost firewall — token-bucket rate limiter ──────────────────────
  if (nodeId && !limiter.consume(nodeId, 10)) {
    logger.warn(
      { nodeId },
      "mesh-proxy: token bucket exhausted — RATE_LIMIT_EXCEEDED",
    );
    writeError(res, 429, "RATE_LIMIT_EXCEEDED",
      "Node API spend velocity breached enterprise cost boundaries.",
      { nodeId });
    return;
  }

  // ── Step 1.5: Node isolation blacklist check ─────────────────────────────────
  if (nodeId) {
    try {
      const entry = await checkNodeBlacklist(redis, nodeId);
      if (entry) {
        logger.warn(
          { nodeId, violation: entry.violation, isolatedAt: entry.isolatedAt },
          "mesh-proxy: isolated node blocked — AGENT_NODE_ISOLATION_ENFORCED",
        );
        writeError(res, 403, "AGENT_NODE_ISOLATION_ENFORCED", [
          `Node '${nodeId}' is currently under Sovereign isolation.`,
          `Violation: ${entry.violation}.`,
          "All traffic from this node is suspended pending governance review.",
        ].join(" "), {
          nodeId,
          isolationMetadata: entry,
        });
        return;
      }
    } catch (err) {
      logger.error({ err, nodeId }, "mesh-proxy: blacklist Redis error — failing closed (SECURITY_DATA_PLANE_OFFLINE)");
      writeError(res, 503, "SECURITY_DATA_PLANE_OFFLINE",
        "Sentinel enforcement mechanism is unreachable. Integrity cannot be verified. Failing closed.");
      return;
    }
  }

  // ── Collect body ─────────────────────────────────────────────────────────────
  let bodyBuffer: Buffer;
  try {
    bodyBuffer = await collectBody(req);
  } catch (err) {
    logger.error({ err }, "mesh-proxy: failed to read request body");
    writeError(res, 400, "BAD_REQUEST", "Failed to read request body");
    return;
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(bodyBuffer.toString("utf8"));
  } catch {
    parsedBody = bodyBuffer.length > 0 ? "<binary>" : null;
  }

  // ── Step 2: Intent trace resolution ──────────────────────────────────────────
  const trace = resolveTraceContext(req.headers, parsedBody);
  logger.debug(
    { depth: trace.depth, rootHash: trace.rootHash, isNew: trace.isNew, path: req.url },
    "mesh-proxy: trace context resolved",
  );

  // ── Step 3: Trust Decay gate ──────────────────────────────────────────────────
  if (trace.depth > MAX_RECURSION_DEPTH) {
    logger.error(
      { depth: trace.depth, maxDepth: MAX_RECURSION_DEPTH, rootHash: trace.rootHash, path: req.url },
      "mesh-proxy: TRUST DECAY DETECTED — recursion depth exceeded, tripping circuit breaker",
    );

    breaker.trip();

    // Mirror the violation to the ledger AND publish an infraction frame so
    // the API server writes this node to the shared blacklist.
    void mirrorToLedger(req, parsedBody, trace, redis, sentinelCoreUrl);
    if (nodeId) {
      void publishInfractionFrame(redis, nodeId, {
        violation: "TRUST_DECAY",
        rootHash:  trace.rootHash,
        depth:     trace.depth,
        ts:        new Date().toISOString(),
      });
    }

    writeError(res, 508, "LOOP_DETECTED_TRUST_DECAY", [
      `Recursive intent depth ${trace.depth} exceeds the Sovereign maximum of ${MAX_RECURSION_DEPTH}.`,
      "Unmonitored agent-to-agent recursion detected.",
      "Circuit breaker tripped — all further traffic suspended pending governance review.",
    ].join(" "), {
      depth:        trace.depth,
      maxDepth:     MAX_RECURSION_DEPTH,
      rootHash:     trace.rootHash,
      circuitState: breaker.currentState,
    });
    return;
  }

  // ── Step 4a: Mirror async (fire-and-forget) ───────────────────────────────────
  void mirrorToLedger(req, parsedBody, trace, redis, sentinelCoreUrl);

  // ── Step 4b: Forward to upstream with trace header injected ──────────────────
  const outgoingHeaders: http.OutgoingHttpHeaders = {
    ...req.headers,
    host:           upstream.host,
    [TRACE_HEADER]: trace.headerValue,
    ...(req.headers[INTENT_HEADER] ? { [INTENT_HEADER]: req.headers[INTENT_HEADER] } : {}),
  };

  const fwdOptions: http.RequestOptions = {
    hostname: upstream.hostname,
    port:     upstreamPort,
    path:     req.url ?? "/",
    method:   req.method,
    headers:  outgoingHeaders,
  };

  const fwdReq = forwardAgent.request(fwdOptions, (fwdRes) => {
    logger.info({ path: req.url, status: fwdRes.statusCode, depth: trace.depth },
      "mesh-proxy: upstream response received");
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

  if (bodyBuffer.length > 0) fwdReq.write(bodyBuffer);
  fwdReq.end();
}

// ── Public factory ─────────────────────────────────────────────────────────────

/**
 * Create the HTTP interception server.
 * The server delegates every request to an async handler so all pipeline
 * steps (including the async blacklist check) can use clean await semantics.
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

  const limiter = new TokenBucketLimiter();

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, upstream, upstreamPort, forwardAgent, redis, breaker, sentinelCoreUrl, limiter);
  });

  server.on("error", (err: Error) => {
    logger.error({ err: err.message }, "mesh-proxy: server error");
  });

  return server;
}
