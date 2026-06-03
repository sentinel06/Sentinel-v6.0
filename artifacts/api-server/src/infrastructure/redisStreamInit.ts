/**
 * Sentinel API Server — Redis Stream Bootstrap
 *
 * Idempotently creates the consumer group for the persistent infraction stream
 * at server startup. Safe to call on every boot: the BUSYGROUP error means the
 * group already exists and is silently swallowed.
 *
 * Stream: sentinel:stream:events
 * Group:  sentinel:group:enforcers
 *
 * MKSTREAM ensures the stream key is created even if no messages have been
 * published yet, so the consumer can start polling immediately.
 */

import type { Redis } from "ioredis";
import { logger } from "../lib/logger";

const STREAM_NAME = "sentinel:stream:events";
const GROUP_NAME  = "sentinel:group:enforcers";

export async function initRedisStream(redis: Redis): Promise<void> {
  try {
    await redis.xgroup("CREATE", STREAM_NAME, GROUP_NAME, "$", "MKSTREAM");
    logger.info(
      { stream: STREAM_NAME, group: GROUP_NAME },
      "redis-stream: consumer group created",
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("BUSYGROUP")) {
      logger.info(
        { stream: STREAM_NAME, group: GROUP_NAME },
        "redis-stream: consumer group already exists — skipping",
      );
      return;
    }
    logger.error({ err, stream: STREAM_NAME, group: GROUP_NAME },
      "redis-stream: XGROUP CREATE failed");
    throw err;
  }
}
