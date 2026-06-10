import http from "http";
import Redis from "ioredis";
import { warmupDb } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocket } from "./lib/ws";
import { startIntegrityScheduler } from "./lib/integrity";
import { startPulseScheduler } from "./services/pulse";
import { startSovereignPulseEngine } from "./services/pulse_engine";
import { initRedisStream } from "./infrastructure/redisStreamInit";
import { startInfractionConsumer } from "./workers/infractionConsumer";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function bootstrap(): Promise<void> {
  // Wake the DB pool before accepting traffic. On cold-start this can take
  // tens of seconds for serverless Postgres; bounded retry/backoff hides
  // the stutter from the first user request.
  const t0 = Date.now();
  try {
    await warmupDb();
    logger.info({ ms: Date.now() - t0 }, "DB pool warmed");
  } catch (err) {
    logger.error({ err, ms: Date.now() - t0 }, "DB warmup failed — starting anyway");
  }

  const server = http.createServer(app);
  // setupWebSocket creates its own Redis connections; it must run before any
  // other Redis work so its subscribe handshake isn't disrupted by concurrent
  // socket creation (ioredis with enableOfflineQueue:false is timing-sensitive
  // during the initial connecting window).
  setupWebSocket(server);
  startIntegrityScheduler();
  startPulseScheduler();
  startSovereignPulseEngine();

  // ── Phase 7: Persistent Redis Streams bootstrap ──────────────────────────
  // Runs after setupWebSocket so ws.ts subscriber connections are established
  // first. Uses lazyConnect:true + quit() so the setup socket is created and
  // torn down gracefully without touching ws.ts's socket state.
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl) {
    const setupRedis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
    try {
      await initRedisStream(setupRedis);
    } finally {
      void setupRedis.quit();
    }
    startInfractionConsumer();
  } else {
    logger.warn("REDIS_URL not set — Redis stream consumer disabled");
  }

  server.listen(port, () => {
    logger.info({ port }, "MaroShield server listening");
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "bootstrap failed");
  process.exit(1);
});
