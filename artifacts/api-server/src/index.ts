import http from "http";
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

const server = http.createServer(app);
setupWebSocket(server);
startIntegrityScheduler();
startPulseScheduler();
startSovereignPulseEngine();

server.listen(port, () => {
  logger.info({ port }, "Agent-Sentinel server listening");
});
