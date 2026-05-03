import http from "http";
import { warmupDb } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocket } from "./lib/ws";
import { startIntegrityScheduler } from "./lib/integrity";
import { startPulseScheduler } from "./services/pulse";
import { startSovereignPulseEngine } from "./services/pulse_engine";

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
  setupWebSocket(server);
  startIntegrityScheduler();
  startPulseScheduler();
  startSovereignPulseEngine();

  server.listen(port, () => {
    logger.info({ port }, "Agent-Sentinel server listening");
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "bootstrap failed");
  process.exit(1);
});
