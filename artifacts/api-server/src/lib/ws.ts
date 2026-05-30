import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { logger } from "./logger";
import { onGovernanceEvent } from "./governance";
import Redis from "ioredis";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

const REDIS_CHANNEL = "sentinel:events";

// Redis pub/sub clients — only initialised when REDIS_URL is present.
// Two separate connections are required: ioredis puts a subscriber into a
// dedicated mode where it can no longer publish.
let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;

function initRedis(): void {
  const url = process.env["REDIS_URL"];
  if (!url) return;

  const opts = {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    lazyConnect: false,
  } as const;

  try {
    redisPublisher  = new Redis(url, opts);
    redisSubscriber = new Redis(url, opts);

    redisPublisher.on("error",  (err) => logger.error({ err }, "Redis publisher error"));
    redisSubscriber.on("error", (err) => logger.error({ err }, "Redis subscriber error"));

    // Each container subscribes; when a message arrives it fans out to the
    // WebSocket clients that are locally connected to this process.
    redisSubscriber.subscribe(REDIS_CHANNEL, (err) => {
      if (err) {
        logger.error({ err }, "Redis subscribe failed — falling back to in-process broadcast");
        redisPublisher  = null;
        redisSubscriber = null;
        return;
      }
      logger.info({ channel: REDIS_CHANNEL }, "Redis WebSocket fan-out active");
    });

    redisSubscriber.on("message", (_channel: string, message: string) => {
      try {
        const { type, data } = JSON.parse(message) as { type: string; data: object };
        localBroadcast(type, data);
      } catch {
        // Ignore malformed frames
      }
    });
  } catch (err) {
    logger.error({ err }, "Redis init failed — falling back to in-process broadcast");
    redisPublisher  = null;
    redisSubscriber = null;
  }
}

// ── Local broadcast ─────────────────────────────────────────────────────────
// Sends to every WebSocket client connected to THIS process.
// Called either directly (no Redis) or by the subscriber callback (with Redis).

function localBroadcast(type: string, data: object): void {
  if (!wss || clients.size === 0) return;
  const message = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// ── Distributed broadcast ────────────────────────────────────────────────────
// If Redis is available, publish to the shared channel so every scaled-out
// container receives the frame and fans it out to its own local clients.
// Falls back to localBroadcast when Redis is absent or if publish fails.

function broadcast(type: string, data: object): void {
  if (redisPublisher) {
    redisPublisher
      .publish(REDIS_CHANNEL, JSON.stringify({ type, data }))
      .catch((err: unknown) => {
        logger.error({ err }, "Redis publish failed — falling back to local broadcast");
        localBroadcast(type, data);
      });
    // The subscriber on this same container will also receive the published
    // message and call localBroadcast, so we do NOT call it a second time here.
  } else {
    localBroadcast(type, data);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: "/api/v1/ws" });

  // Initialise Redis fan-out once the server is ready.
  initRedis();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    clients.add(ws);
    logger.info(
      { ip: req.socket.remoteAddress, clientCount: clients.size },
      "WebSocket client connected",
    );

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

  // Relay all governance events (auth requests, kill-switch) to dashboard.
  onGovernanceEvent(({ type, payload }) => {
    broadcast(type, payload);
  });

  logger.info("WebSocket server initialised at /api/v1/ws");
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

/**
 * Broadcast a Project Genesis Gateway event to all connected Swarm Map clients.
 * eventType is one of: GATEWAY_SPARK | GATEWAY_MUTATION | GATEWAY_DISSOLUTION
 */
export function broadcastGatewayEvent(eventType: string, payload: object): void {
  broadcast(eventType, payload);
}
