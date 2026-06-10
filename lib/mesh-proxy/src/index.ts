/**
 * Sentinel Mesh Sidecar — entry point
 *
 * Environment variables:
 *   REDIS_URL          — Redis connection string (required for governance)
 *                        Default: redis://localhost:6379
 *   SENTINEL_CORE_URL  — Base URL of the central Sentinel API server
 *                        Default: http://localhost:8080
 *   MESH_UPSTREAM_URL  — The real LLM provider URL this proxy fronts (required)
 *                        e.g. https://api.openai.com
 *   MESH_PROXY_PORT    — Local port this sidecar listens on (default: 9091)
 *
 * The sidecar starts in OPEN (fail-closed) state and only allows traffic
 * through once the Redis governance connection is confirmed healthy.
 */

import { logger } from "./logger.js";
import { CircuitBreaker } from "./circuitBreaker.js";
import { createRedisPublisher } from "./redis.js";
import { createInterceptorServer } from "./interceptor.js";

const REDIS_URL         = process.env.REDIS_URL         ?? "redis://localhost:6379";
const SENTINEL_CORE_URL = process.env.SENTINEL_CORE_URL ?? "http://localhost:8080";
const MESH_UPSTREAM_URL = process.env.MESH_UPSTREAM_URL;
const MESH_PROXY_PORT   = parseInt(process.env.MESH_PROXY_PORT ?? "9091", 10);

if (!MESH_UPSTREAM_URL) {
  logger.error(
    "MESH_UPSTREAM_URL is not set. Set it to the LLM provider URL this sidecar should front.",
  );
  process.exit(1);
}

// ── Initialise subsystems ─────────────────────────────────────────────────────

logger.info(
  { port: MESH_PROXY_PORT, upstream: MESH_UPSTREAM_URL, sentinel: SENTINEL_CORE_URL },
  "MaroShield mesh-proxy starting — circuit breaker initialised OPEN (fail-closed until Redis ready)",
);

// Breaker starts CLOSED; createRedisPublisher will trip() it immediately if
// Redis isn't reachable and close() it once the connection is confirmed ready.
const breaker = new CircuitBreaker();

// Start OPEN until Redis confirms it is ready — enforce fail-closed from boot.
breaker.trip();

const redis = createRedisPublisher(REDIS_URL, breaker);

const server = createInterceptorServer(
  MESH_UPSTREAM_URL,
  redis,
  breaker,
  SENTINEL_CORE_URL,
);

// Log circuit breaker state changes for visibility
breaker.on("open",      () => logger.warn("⚠  Sidecar fail-closed: all agent calls BLOCKED"));
breaker.on("half_open", () => logger.warn("⟳  Governance probing: calls still BLOCKED"));
breaker.on("closed",    () => logger.info("✓  Sidecar operational: agent calls ALLOWED"));

// ── Start listening ───────────────────────────────────────────────────────────

server.listen(MESH_PROXY_PORT, () => {
  logger.info(
    { port: MESH_PROXY_PORT },
    "MaroShield mesh-proxy listening",
  );
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info({ signal }, "mesh-proxy: shutdown signal received");
  server.close(() => {
    logger.info("mesh-proxy: HTTP server closed");
    redis.disconnect(false);
    process.exit(0);
  });

  // Force-kill if the server doesn't close within 5 s
  setTimeout(() => {
    logger.error("mesh-proxy: forced shutdown after timeout");
    process.exit(1);
  }, 5_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
