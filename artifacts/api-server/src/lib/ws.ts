import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { logger } from "./logger";

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

  logger.info("WebSocket server initialized at /api/v1/ws");
}

export function broadcastLog(log: Record<string, unknown>): void {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({ type: "log", data: log });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
