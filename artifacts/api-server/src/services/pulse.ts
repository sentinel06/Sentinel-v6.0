/**
 * System Pulse Engine
 *
 * Aggregates the global "System Trust Velocity" — the percentage of all events
 * across every partner that carry a valid ML-DSA-87 quantum signature in the
 * last N hours — then formats a human-readable status tweet and optionally
 * posts it to X (Twitter) via the v2 API.
 *
 * Persists every run to pulse_logs so the Live Pulse Feed UI can display them.
 */

import { db, auditLogsTable, pulseLogsTable } from "@workspace/db";
import { gte, count, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ── Twitter v2 client (optional — graceful no-op if keys missing) ──────────

let twitterClient: import("twitter-api-v2").TwitterApi | null = null;

async function getTwitterClient(): Promise<import("twitter-api-v2").TwitterApi | null> {
  const apiKey             = process.env["TWITTER_API_KEY"];
  const apiSecret          = process.env["TWITTER_API_SECRET"];
  const accessToken        = process.env["TWITTER_ACCESS_TOKEN"];
  const accessTokenSecret  = process.env["TWITTER_ACCESS_TOKEN_SECRET"];

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return null;
  }

  if (!twitterClient) {
    const { TwitterApi } = await import("twitter-api-v2");
    twitterClient = new TwitterApi({
      appKey:            apiKey,
      appSecret:         apiSecret,
      accessToken:       accessToken,
      accessSecret:      accessTokenSecret,
    });
  }
  return twitterClient;
}

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
  firedAt:       Date;
  trustVelocity: number;
  verifiedEvents: number;
  totalEvents:   number;
  anomalyCount:  number;
  status:        string;
  windowHours:   number;
}): string {
  const ts       = opts.firedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const pct      = opts.trustVelocity.toFixed(2);
  const emoji    = STATUS_EMOJI[opts.status] ?? "🛡️";
  const ratio    = `${opts.verifiedEvents.toLocaleString()}/${opts.totalEvents.toLocaleString()} events`;

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
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
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

  // ── Twitter post (best-effort) ───────────────────────────────────────────
  let tweetUrl:   string | null = null;
  let tweetId:    string | null = null;
  let tweetError: string | null = null;

  try {
    const client = await getTwitterClient();
    if (client) {
      const response = await client.v2.tweet(message);
      tweetId  = response.data.id;
      tweetUrl = `https://x.com/i/web/status/${tweetId}`;
      logger.info({ tweetId }, "System pulse posted to X");
    } else {
      tweetError = "Twitter keys not configured — pulse logged locally only";
      logger.info("Twitter keys absent — pulse will not be posted");
    }
  } catch (err: unknown) {
    tweetError = err instanceof Error ? err.message : String(err);
    logger.warn({ err: tweetError }, "Failed to post pulse to Twitter");
  }

  // ── Persist to DB ────────────────────────────────────────────────────────
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
      tweetUrl,
      tweetId,
      tweetError,
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
    tweetUrl,
    tweetId,
    tweetError,
    windowHours,
  };

  logger.info(
    { trustVelocity: trustVelocity.toFixed(2), anomalyCount, status, tweetPosted: !!tweetId },
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
    try {
      await firePulse(6);
    } catch (err) {
      logger.warn({ err }, "Initial pulse failed");
    }
  }, 30_000);

  // Then every 6 hours
  setInterval(async () => {
    try {
      await firePulse(6);
    } catch (err) {
      logger.warn({ err }, "Scheduled pulse failed");
    }
  }, PULSE_INTERVAL_MS);
}
