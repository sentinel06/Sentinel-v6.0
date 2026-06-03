/**
 * Sentinel API Server — Infraction Stream Consumer
 *
 * Long-polling XREADGROUP worker that drains `sentinel:stream:events` and
 * writes NODE_INFRACTION frames to the shared Redis blacklist hash.
 *
 * Delivery guarantee: at-least-once.
 *   — Messages are XACK'd only AFTER a successful `addToBlacklist` write.
 *   — On processing failure the message remains in the PEL and will be
 *     redelivered on the next XAUTOCLAIM cycle (future work) or after a
 *     consumer restart.
 *
 * Uses two dedicated Redis connections:
 *   readConn  — exclusively owns the blocking XREADGROUP call.
 *   writeConn — performs HSET / EXPIRE / XACK without contention.
 */

import Redis from "ioredis";
import { logger } from "../lib/logger";
import { processIncomingFrame } from "../lib/nodeIsolation";

const STREAM_NAME   = "sentinel:stream:events";
const GROUP_NAME    = "sentinel:group:enforcers";
const CONSUMER_NAME = "worker_node_01";
const BLOCK_MS      = 2000;
const BATCH_COUNT   = 10;

const REDIS_OPTS = {
  maxRetriesPerRequest: null as unknown as number,
  enableOfflineQueue: true,
  lazyConnect: false,
} as const;

let running = false;

export function startInfractionConsumer(): void {
  const url = process.env["REDIS_URL"];
  if (!url) {
    logger.warn("infraction-consumer: REDIS_URL not set — stream consumer disabled");
    return;
  }

  if (running) {
    logger.warn("infraction-consumer: already running — ignoring duplicate start");
    return;
  }
  running = true;

  const readConn  = new Redis(url, REDIS_OPTS);
  const writeConn = new Redis(url, REDIS_OPTS);

  readConn.on("error",  (err) => logger.error({ err }, "infraction-consumer: read connection error"));
  writeConn.on("error", (err) => logger.error({ err }, "infraction-consumer: write connection error"));

  void runLoop(readConn, writeConn);
}

export function stopInfractionConsumer(): void {
  running = false;
}

type XReadGroupResult = Array<[streamName: string, entries: Array<[id: string, fields: string[]]>]>;

async function runLoop(readConn: Redis, writeConn: Redis): Promise<void> {
  logger.info(
    { stream: STREAM_NAME, group: GROUP_NAME, consumer: CONSUMER_NAME },
    "infraction-consumer: long-poll loop started",
  );

  while (running) {
    try {
      const results = await (readConn as unknown as {
        xreadgroup(...args: (string | number)[]): Promise<XReadGroupResult | null>;
      }).xreadgroup(
        "GROUP",   GROUP_NAME,
        CONSUMER_NAME,
        "BLOCK",   BLOCK_MS,
        "COUNT",   BATCH_COUNT,
        "STREAMS", STREAM_NAME,
        ">",
      );

      if (!results) continue;

      for (const [, entries] of results) {
        for (const [messageId, fields] of entries) {
          await processMessage(writeConn, messageId, fields);
        }
      }
    } catch (err) {
      logger.error({ err }, "infraction-consumer: XREADGROUP error — retrying in 5 s");
      await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    }
  }

  logger.info("infraction-consumer: loop exited");
}

async function processMessage(
  writeConn: Redis,
  messageId: string,
  fields: string[],
): Promise<void> {
  try {
    const payloadIdx = fields.indexOf("payload");
    if (payloadIdx === -1 || payloadIdx + 1 >= fields.length) {
      logger.warn({ messageId }, "infraction-consumer: message missing 'payload' field — acking and skipping");
      await writeConn.xack(STREAM_NAME, GROUP_NAME, messageId);
      return;
    }

    const rawPayload = fields[payloadIdx + 1]!;

    await processIncomingFrame(writeConn, rawPayload);

    await writeConn.xack(STREAM_NAME, GROUP_NAME, messageId);

    logger.debug({ messageId }, "infraction-consumer: message processed and acknowledged");
  } catch (err) {
    logger.error(
      { err, messageId },
      "infraction-consumer: processing failed — message left in PEL for redelivery",
    );
  }
}
