/**
 * Public System Status Routes
 *
 * GET  /v1/status           — Latest sovereign pulse snapshot
 * GET  /v1/status/history   — Last 10 sovereign pulse snapshots
 * POST /v1/status/verify    — Verify the QL-2.0 self-signature of a pulse entry
 * POST /v1/status/pulse     — Manually trigger a sovereign pulse (operator only)
 */

import { Router, type IRouter } from "express";
import { db, systemPulsesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { pulseEngine } from "../services/pulse_engine.js";
import { quantumSigner } from "../crypto/quantum_ledger.js";
import type { HybridSignatureEnvelope } from "../crypto/quantum_ledger.js";

const router: IRouter = Router();

// ── Shared serialiser ─────────────────────────────────────────────────────

function serialise(r: typeof systemPulsesTable.$inferSelect) {
  const env = r.pulseSignature as HybridSignatureEnvelope | null;
  return {
    id:                   r.id,
    createdAt:            r.createdAt.toISOString(),
    globalIntegrityIndex: r.globalIntegrityIndex,
    totalEvents:          r.totalEvents,
    verifiedEvents:       r.verifiedEvents,
    activeSwarms:         r.activeSwarms,
    revokedSwarms:        r.revokedSwarms,
    quantumThroughputBits: r.quantumThroughputBits,
    status:               r.status,
    faultReason:          r.faultReason,
    pulsePayload:         r.pulsePayload,
    windowHours:          r.windowHours,
    signature: env ? {
      version:             env.version,
      sha512Prefix:        env.sha512?.slice(0, 16) + "…",
      algorithm:           env.mlDsa87?.algorithm,
      publicKeyFingerprint: env.mlDsa87?.publicKeyFingerprint,
      fipsStandard:        env.mlDsa87?.fipsStandard,
      securityLevel:       env.mlDsa87?.securityLevel,
      signedAt:            env.signedAt,
      context:             env.context,
    } : null,
  };
}

// ── GET /v1/status ────────────────────────────────────────────────────────

router.get("/v1/status", async (_req, res): Promise<void> => {
  try {
    const [latest] = await db
      .select()
      .from(systemPulsesTable)
      .orderBy(desc(systemPulsesTable.createdAt))
      .limit(1);

    if (!latest) {
      res.json({ status: "BOOTSTRAPPING", message: "No pulse data yet — first pulse fires ~45 s after boot" });
      return;
    }

    res.json(serialise(latest));
  } catch (err) {
    res.status(500).json({ error: "Status query failed", detail: String(err) });
  }
});

// ── GET /v1/status/history ────────────────────────────────────────────────

router.get("/v1/status/history", async (req, res): Promise<void> => {
  try {
    const n = Math.min(Number(req.query["limit"] ?? 10), 50);
    const rows = await db
      .select()
      .from(systemPulsesTable)
      .orderBy(desc(systemPulsesTable.createdAt))
      .limit(n);

    res.json({ count: rows.length, pulses: rows.map(serialise) });
  } catch (err) {
    res.status(500).json({ error: "History query failed", detail: String(err) });
  }
});

// ── POST /v1/status/verify ────────────────────────────────────────────────

router.post("/v1/status/verify", async (req, res): Promise<void> => {
  try {
    const { id } = req.body ?? {};

    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    const [row] = await db
      .select()
      .from(systemPulsesTable)
      .where(eq(systemPulsesTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Pulse not found" });
      return;
    }

    const envelope = row.pulseSignature as HybridSignatureEnvelope | null;

    if (!envelope) {
      res.status(422).json({ error: "Pulse has no signature envelope" });
      return;
    }

    const { status: verifyStatus, envelope: verified } = quantumSigner.verifyRawEnvelope(
      row.pulsePayload,
      envelope,
    );

    res.json({
      pulseId:              row.id,
      verifyStatus,
      algorithm:            "ML-DSA-87",
      fipsStandard:         "FIPS-204",
      securityLevel:        5,
      sha512Verified:       verifyStatus !== "UNVERIFIED",
      mlDsa87Verified:      verifyStatus === "QUANTUM-SECURE",
      publicKeyFingerprint: verified?.mlDsa87?.publicKeyFingerprint ?? null,
      signedAt:             verified?.signedAt ?? null,
      context:              verified?.context ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Verification failed", detail: String(err) });
  }
});

// ── POST /v1/status/pulse ─────────────────────────────────────────────────

router.post("/v1/status/pulse", async (req, res): Promise<void> => {
  try {
    const windowHours = Number(req.body?.windowHours ?? 6);
    const result = await pulseEngine.execute(windowHours);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: "Pulse execution failed", detail: String(err) });
  }
});

export default router;
