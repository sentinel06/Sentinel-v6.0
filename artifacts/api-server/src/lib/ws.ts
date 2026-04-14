import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { logger } from "./logger";
import { onGovernanceEvent } from "./governance";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: "/api/v1/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    clients.add(ws);
    logger.info({ ip: req.socket.remoteAddress, clientCount: clients.size }, "WebSocket client connected");

    ws.on("close", () => {
      clients.delete(ws);
      logger.info({ clientCount: clients.size }, "WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket error");
      clients.delete(ws);
    });

    ws.send(JSON.stringify({ type: "connected", message: "Agent-Sentinel live stream active" }));
  });

  // Relay all governance events (auth requests, kill-switch) to dashboard
  onGovernanceEvent(({ type, payload }) => {
    broadcast(type, payload);
  });

  logger.info("WebSocket server initialized at /api/v1/ws");
}

function broadcast(type: string, data: object): void {
  if (!wss || clients.size === 0) return;
  const message = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function broadcastLog(log: Record<string, unknown>): void {
  broadcast("log", log);
}

export function broadcastGovernanceEvent(type: string, payload: object): void {
  broadcast(type, payload);
}

/**
 * Broadcast a batch of compact stream telemetry packets.
 * Called by StreamManager after the 50 ms collection window closes.
 */
export function broadcastStreamBatch(packets: unknown[]): void {
  broadcast("stream_batch", { packets });
}
