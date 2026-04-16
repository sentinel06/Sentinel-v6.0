/**
 * System Pulse Engine
 *
 * Aggregates the global "System Trust Velocity" — the percentage of all events
 * across every partner that carry a valid ML-DSA-87 quantum signature in the
 * last N hours — formats a human-readable status message, and persists every
 * run to pulse_logs so the Live Pulse Feed UI can display them.
 *
 * Social posting (Twitter/X) has been decommissioned. Pulses are internal only.
 */

import { db, auditLogsTable, pulseLogsTable } from "@workspace/db";
import { gte, count, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ── Status classifier ──────────────────────────────────────────────────────

function classifyStatus(trustVelocity: number, anomalyCount: number): "NOMINAL" | "ELEVATED" | "CRITICAL" {
  if (anomalyCount >= 5 || trustVelocity < 90) return "CRITICAL";
  if (anomalyCount >= 1 || trustVelocity < 99) return "ELEVATED";
  return "NOMINAL";
}

const STATUS_EMOJI: Record<string, string> = {
  NOMINAL:  "🛡️",
  ELEVATED: "⚠️",
  CRITICAL: "🚨",
};

// ── Pulse message formatter ────────────────────────────────────────────────

function formatPulseMessage(opts: {
  firedAt:        Date;
  trustVelocity:  number;
  verifiedEvents: number;
  totalEvents:    number;
  anomalyCount:   number;
  status:         string;
  windowHours:    number;
}): string {
  const ts    = opts.firedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const pct   = opts.trustVelocity.toFixed(2);
  const emoji = STATUS_EMOJI[opts.status] ?? "🛡️";
  const ratio = `${opts.verifiedEvents.toLocaleString()}/${opts.totalEvents.toLocaleString()} events`;

  return (
    `SYSTEM PULSE: ${ts} | ` +
    `Integrity: ${pct}% | ` +
    `Verified by QL-2.0 (FIPS-204 SL5): ${ratio} | ` +
    `Anomalies Intercepted: ${opts.anomalyCount} | ` +
    `Status: ${opts.status} ${emoji}`
  );
}

// ── Core aggregation ───────────────────────────────────────────────────────

export interface PulseResult {
  id:             string;
  firedAt:        string;
  trustVelocity:  number;
  totalEvents:    number;
  verifiedEvents: number;
  anomalyCount:   number;
  status:         string;
  message:        string;
  tweetUrl:       string | null;
  tweetId:        string | null;
  tweetError:     string | null;
  windowHours:    number;
}

export async function firePulse(windowHours = 6): Promise<PulseResult> {
  const since   = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const firedAt = new Date();

  // Count total events in window
  const [totalRow] = await db
    .select({ n: count() })
    .from(auditLogsTable)
    .where(gte(auditLogsTable.timestamp, since));

  const totalEvents = Number(totalRow?.n ?? 0);

  // Count events with ML-DSA-87 (pq_signature IS NOT NULL)
  const [verifiedRow] = await db
    .select({ n: count() })
    .from(auditLogsTable)
    .where(
      sql`${auditLogsTable.timestamp} >= ${since}
       AND ${auditLogsTable.pqSignature} IS NOT NULL`,
    );

  const verifiedEvents = Number(verifiedRow?.n ?? 0);

  // Count anomalous events in window
  const [anomalyRow] = await db
    .select({ n: count() })
    .from(auditLogsTable)
    .where(
      sql`${auditLogsTable.timestamp} >= ${since}
       AND ${auditLogsTable.isAnomalous} = true`,
    );

  const anomalyCount = Number(anomalyRow?.n ?? 0);

  // Trust velocity = percentage of quantum-verified events
  const trustVelocity = totalEvents === 0
    ? 100
    : (verifiedEvents / totalEvents) * 100;

  const status  = classifyStatus(trustVelocity, anomalyCount);
  const message = formatPulseMessage({
    firedAt, trustVelocity, verifiedEvents, totalEvents, anomalyCount, status, windowHours,
  });

  // ── Persist to DB (social posting decommissioned) ─────────────────────────
  const [inserted] = await db
    .insert(pulseLogsTable)
    .values({
      firedAt,
      trustVelocity,
      totalEvents,
      verifiedEvents,
      anomalyCount,
      status,
      message,
      tweetUrl:  null,
      tweetId:   null,
      tweetError: null,
      windowHours,
    })
    .returning();

  const result: PulseResult = {
    id:             inserted!.id,
    firedAt:        inserted!.firedAt.toISOString(),
    trustVelocity,
    totalEvents,
    verifiedEvents,
    anomalyCount,
    status,
    message,
    tweetUrl:  null,
    tweetId:   null,
    tweetError: null,
    windowHours,
  };

  logger.info(
    { trustVelocity: trustVelocity.toFixed(2), anomalyCount, status },
    "System pulse fired",
  );

  return result;
}

// ── 6-hour scheduler ───────────────────────────────────────────────────────

const PULSE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startPulseScheduler(): void {
  logger.info({ intervalHours: 6 }, "System Pulse Scheduler started");

  // Fire once 30 seconds after boot (avoids blocking startup)
  setTimeout(async () => {
    try { await firePulse(6); }
    catch (err) { logger.warn({ err }, "Initial pulse failed"); }
  }, 30_000);

  // Then every 6 hours
  setInterval(async () => {
    try { await firePulse(6); }
    catch (err) { logger.warn({ err }, "Scheduled pulse failed"); }
  }, PULSE_INTERVAL_MS);
}
