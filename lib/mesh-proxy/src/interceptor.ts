import http from "http";
import https from "https";
import { URL } from "url";
import type Redis from "ioredis";
import type { CircuitBreaker } from "./circuitBreaker.js";
import { logger } from "./logger.js";

const SENTINEL_EVENTS_CHANNEL = "sentinel:events";

/**
 * Known LLM tool-calling endpoint path segments.
 * Payloads on these paths are always mirrored to the ledger.
 * All other paths are also mirrored — this list is used only for richer
 * event classification in the mirrored frame.
 */
const TOOL_CALL_PATHS = [
  "/v1/chat/completions",   // OpenAI / Azure / local LLM
  "/v1/messages",           // Anthropic
  "/v1/completions",        // legacy OpenAI
  "/v1beta/models",         // Gemini
  "/api/v1/chat",           // Ollama
];

function classifyPath(urlPath: string | undefined): string {
  if (!urlPath) return "UNKNOWN";
  for (const segment of TOOL_CALL_PATHS) {
    if (urlPath.includes(segment)) return "LLM_TOOL_CALL";
  }
  return "GENERIC";
}

/**
 * Mirror the intercepted request asynchronously to the sentinel:events
 * Redis channel for centralized ledger validation.
 * Fire-and-forget — errors are logged but never surface to the caller.
 */
async function mirrorToLedger(
  req: http.IncomingMessage,
  body: Buffer,
  redis: Redis,
  sentinelCoreUrl: string,
): Promise<void> {
  try {
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body.toString("utf8"));
    } catch {
      parsedBody = body.length > 0 ? "<binary>" : null;
    }

    const frame = {
      source:         "MESH_SIDECAR",
      eventType:      classifyPath(req.url),
      path:           req.url,
      method:         req.method,
      payload:        parsedBody,
      sentinelCoreUrl,
      ts:             new Date().toISOString(),
    };

    await redis.publish(SENTINEL_EVENTS_CHANNEL, JSON.stringify(frame));
    logger.debug({ path: req.url, eventType: frame.eventType }, "mesh-proxy: event mirrored to ledger");
  } catch (err) {
    logger.error({ err }, "mesh-proxy: failed to mirror event — governance record may be incomplete");
  }
}

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

/**
 * Create the HTTP interception server.
 *
 * Every inbound request is processed in three steps:
 *   1. Fail-closed gate  — reject immediately if the circuit breaker is OPEN / HALF_OPEN.
 *   2. Mirror async      — publish a governance frame to sentinel:events (non-blocking).
 *   3. Forward + relay   — proxy the request to upstream and stream the response back.
 *
 * The mirroring (step 2) is deliberately asynchronous: it never delays the
 * upstream response. If Redis is healthy the event lands before the LLM
 * responds; if Redis is degraded the circuit breaker (step 1) will have
 * already blocked the call.
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
    // ── Step 1: Fail-closed gate ─────────────────────────────────────────────
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

    // ── Collect body ─────────────────────────────────────────────────────────
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      const bodyBuffer = Buffer.concat(chunks);

      // ── Step 2: Mirror async (fire-and-forget) ───────────────────────────
      void mirrorToLedger(req, bodyBuffer, redis, sentinelCoreUrl);

      // ── Step 3: Forward to upstream ──────────────────────────────────────
      const fwdOptions: http.RequestOptions = {
        hostname: upstream.hostname,
        port:     upstreamPort,
        path:     req.url ?? "/",
        method:   req.method,
        headers:  {
          ...req.headers,
          host: upstream.host,
        },
      };

      const fwdReq = forwardAgent.request(fwdOptions, (fwdRes) => {
        logger.info(
          { path: req.url, status: fwdRes.statusCode },
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

      // Write body then end the forward request
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
