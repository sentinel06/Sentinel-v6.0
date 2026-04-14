/**
 * System Pulse Routes
 *
 * GET  /v1/pulse/latest   — Return the last N pulse entries (default 20)
 * POST /v1/pulse/trigger  — Manually fire a pulse (instant, any window)
 */

import { Router, type IRouter } from "express";
import { db, pulseLogsTable } from "@workspace/db";
import { desc, limit as limitOp } from "drizzle-orm";
import { firePulse } from "../services/pulse.js";

const router: IRouter = Router();

// ── GET /v1/pulse/latest ──────────────────────────────────────────────────

router.get("/v1/pulse/latest", async (req, res): Promise<void> => {
  try {
    const n = Math.min(Number(req.query["limit"] ?? 20), 100);

    const rows = await db
      .select()
      .from(pulseLogsTable)
      .orderBy(desc(pulseLogsTable.firedAt))
      .limit(n);

    res.json({
      count: rows.length,
      pulses: rows.map((r) => ({
        id:             r.id,
        firedAt:        r.firedAt.toISOString(),
        trustVelocity:  r.trustVelocity,
        totalEvents:    r.totalEvents,
        verifiedEvents: r.verifiedEvents,
        anomalyCount:   r.anomalyCount,
        status:         r.status,
        message:        r.message,
        tweetUrl:       r.tweetUrl,
        tweetId:        r.tweetId,
        tweetError:     r.tweetError,
        windowHours:    r.windowHours,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pulse logs", detail: String(err) });
  }
});

// ── POST /v1/pulse/trigger ────────────────────────────────────────────────

router.post("/v1/pulse/trigger", async (req, res): Promise<void> => {
  try {
    const windowHours = Number(req.body?.windowHours ?? 6);
    const result = await firePulse(windowHours);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: "Pulse failed", detail: String(err) });
  }
});

export default router;
