import Redis from "ioredis";
import type { CircuitBreaker } from "./circuitBreaker.js";
import { logger } from "./logger.js";

/**
 * Create the sidecar's Redis pub/sub publisher.
 *
 * The connection drives the circuit breaker state machine:
 *   ready       → breaker.close()
 *   error       → breaker.trip()
 *   close       → breaker.trip()
 *   reconnecting → breaker.halfOpen()
 *
 * Uses exponential back-off up to 10 s between reconnect attempts.
 * maxRetriesPerRequest: null keeps the client retrying indefinitely on
 * connection loss (required for pub/sub publishers).
 */
export function createRedisPublisher(
  url: string,
  breaker: CircuitBreaker,
): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (attempt: number) => {
      const delay = Math.min(attempt * 500, 10_000);
      logger.info({ attempt, delay }, "mesh-proxy: Redis retry scheduled");
      return delay;
    },
  });

  client.on("ready", () => {
    logger.info("mesh-proxy: Redis ready");
    breaker.close();
  });

  client.on("error", (err: Error) => {
    logger.error({ err: err.message }, "mesh-proxy: Redis error");
    breaker.trip();
  });

  client.on("close", () => {
    logger.warn("mesh-proxy: Redis connection closed");
    breaker.trip();
  });

  client.on("reconnecting", () => {
    logger.info("mesh-proxy: Redis reconnecting");
    breaker.halfOpen();
  });

  client.on("end", () => {
    logger.warn("mesh-proxy: Redis connection ended (no more retries)");
    breaker.trip();
  });

  return client;
}
