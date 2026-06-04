/**
 * StreamManager — High-Velocity Live Stream Engine
 *
 * Taps into every signed AuditLog event and emits a compact telemetry
 * packet to all connected WebSocket clients.
 *
 * Packet format (network-optimized):
 *   t  — ISO timestamp
 *   a  — agentId
 *   e  — eventType
 *   d  — driftScore % (0–100, derived from consistencyScore)
 *   h  — hashFragment (first 8 hex chars of currentHash)
 *   q  — quantumVerified (ML-DSA-87 signature present)
 *   p  — parentAgentId (ancestry tag — null for root)
 *   x  — isAnomalous
 *   r  — isRevocation / honey-token breach
 *   s  — swarmId (null if unswapped)
 *
 * Buffering: events are collected in 50 ms windows before flushing, which
 * prevents UI flicker when high-concurrency swarm bursts saturate the ledger.
 */

import { broadcastStreamBatch } from "../lib/ws.js";
import { scheduleSwarmMapPublish } from "./statePublisher.js";

// ── Compact Stream Packet ──────────────────────────────────────────────────────
export interface StreamPacket {
  /** ISO timestamp */
  t: string;
  /** agentId */
  a: string;
  /** eventType */
  e: string;
  /** driftScore % (0–100) */
  d: number;
  /** currentHash fragment (8 chars) */
  h: string;
  /** ML-DSA-87 signature verified */
  q: boolean;
  /** parentAgentId — null for root agents */
  p: string | null;
  /** anomaly flag */
  x: boolean;
  /** revocation or honey-token breach */
  r: boolean;
  /** swarmId */
  s: string | null;
  /** traceId — used by client to open Trace Explorer */
  tid: string;
  /** log row id — used by client to deep-link to event */
  lid: string;
}

// ── Revocation / breach event types ─────────────────────────────────────────
const BREACH_TYPES = new Set([
  "HONEY_TOKEN_BREACH",
  "HONEY_TOKEN_TRIGGERED",
  "REVOCATION",
  "KILL_SWITCH",
  "HUMAN_IN_THE_LOOP_OVERRIDE",
  "DRIFT_LOCKOUT",
  "CIRCUIT_BREAKER_OPEN",
]);

// ── StreamManager ─────────────────────────────────────────────────────────────
class StreamManager {
  private buffer: StreamPacket[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly windowMs: number;

  constructor(windowMs = 50) {
    this.windowMs = windowMs;
  }

  /**
   * Enqueue a raw audit log object (as returned from the DB insert).
   * The log is stripped down to the compact packet and queued for the next flush.
   */
  enqueue(log: {
    id: string;
    timestamp: Date | string;
    agentId: string;
    traceId: string;
    eventType: string;
    currentHash: string;
    consistencyScore?: number | null;
    isAnomalous?: boolean;
    anomalyReason?: string | null;
    pqSignature?: unknown;
    parentAgentId?: string | null;
    swarmId?: string | null;
  }): void {
    const driftScore = Math.round((1 - (log.consistencyScore ?? 1.0)) * 100);
    const packet: StreamPacket = {
      t:   log.timestamp instanceof Date
             ? log.timestamp.toISOString()
             : log.timestamp,
      a:   log.agentId,
      e:   log.eventType,
      d:   Math.max(0, Math.min(100, driftScore)),
      h:   (log.currentHash ?? "").substring(0, 8),
      q:   !!log.pqSignature,
      p:   log.parentAgentId ?? null,
      x:   log.isAnomalous ?? false,
      r:   BREACH_TYPES.has(log.eventType) || (log.anomalyReason?.includes("honey") ?? false),
      s:   log.swarmId ?? null,
      tid: log.traceId,
      lid: log.id,
    };

    this.buffer.push(packet);

    // Arm the flush timer if not already running
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.windowMs);
    }
  }

  private flush(): void {
    if (this.buffer.length > 0) {
      broadcastStreamBatch([...this.buffer]);
      this.buffer = [];
      // Push updated swarm state to all connected clients so they don't poll
      scheduleSwarmMapPublish();
    }
    this.flushTimer = null;
  }

  /** Force-flush immediately (e.g. on graceful shutdown) */
  forceFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

export const streamManager = new StreamManager(50);
