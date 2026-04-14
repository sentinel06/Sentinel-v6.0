/**
 * Forensic Intent Suite — Active Interdiction API
 *
 * POST /v1/forensic/override
 *   Re-signs a corrected agent instruction with the ML-DSA-87 master key and
 *   commits it to the immutable ledger as HUMAN_IN_THE_LOOP_OVERRIDE.
 *   Every override receives its own unique Forensic Audit ID.
 *
 * GET /v1/forensic/overrides
 *   Returns all HUMAN_IN_THE_LOOP_OVERRIDE entries.
 *
 * POST /v1/forensic/chain-verify/:traceId
 *   Returns the per-step SHA-512 chain verification for a given trace.
 */

import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import { computeHash, getLastHash } from "../lib/hash.js";
import { quantumSigner } from "../crypto/quantum_ledger.js";
import { signWithMLDSA } from "../crypto/pqc.js";

const router = Router();

// ── POST /v1/forensic/override ──────────────────────────────────────────────

router.post("/v1/forensic/override", async (req, res): Promise<void> => {
  const { logId, newRationale, newToolParams, operatorId } = req.body;

  if (!logId || typeof logId !== "string") {
    res.status(400).json({ error: "logId is required" });
    return;
  }
  if (!newRationale || typeof newRationale !== "string" || !newRationale.trim()) {
    res.status(400).json({ error: "newRationale is required" });
    return;
  }

  // 1. Fetch the original event
  const [original] = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.id, logId));

  if (!original) {
    res.status(404).json({ error: "Original log entry not found" });
    return;
  }

  const timestamp = new Date();
  const agentId   = original.agentId;
  const traceId   = original.traceId;

  // 2. Build the corrected payload — merges tool params if provided
  const originalPayload = (original.payload ?? {}) as Record<string, unknown>;
  const correctedPayload: Record<string, unknown> = {
    ...originalPayload,
    ...(newToolParams ? { toolParameters: newToolParams } : {}),
    _override: {
      originalLogId:  logId,
      originalEventType: original.eventType,
      correctedRationale: newRationale,
      operatorId: operatorId ?? "human-operator",
      overrideType: "ACTIVE_INTERDICTION",
    },
  };

  // 3. Compute hash — chained to current ledger tail
  const previousHash = await getLastHash();
  const currentHash  = computeHash(
    timestamp.toISOString(),
    agentId,
    correctedPayload,
    previousHash,
  );

  // 4. QL-2.0 dual-signature: SHA-512 + ML-DSA-87
  //    Signed under context HUMAN_IN_THE_LOOP_OVERRIDE for full domain separation
  const pqEnvelope = quantumSigner.sign(
    currentHash,
    "HUMAN_IN_THE_LOOP_OVERRIDE",
    agentId,
  );
  const pqcSig = signWithMLDSA(currentHash);

  // 5. Insert the override event into the immutable ledger
  const [inserted] = await db
    .insert(auditLogsTable)
    .values({
      timestamp,
      agentId,
      traceId,
      eventType: "HUMAN_IN_THE_LOOP_OVERRIDE",
      payload: correctedPayload,
      rationale: newRationale,
      currentHash,
      previousHash,
      isAnomalous: false,
      anomalyReason: null,
      consistencyScore: 1.0,        // human-verified — score set to 1.0
      consistencyReasons: [],
      quantumSig: pqcSig.signature.substring(0, 88),
      pqSignature: pqEnvelope,
    } as any)
    .returning();

  res.json({
    forensicAuditId:      inserted.id,
    status:               "COMMITTED",
    eventType:            "HUMAN_IN_THE_LOOP_OVERRIDE",
    agentId,
    traceId,
    originalLogId:        logId,
    currentHash:          inserted.currentHash,
    committedAt:          inserted.timestamp.toISOString(),
    quantumProof: {
      algorithm:            "ML-DSA-87",
      fipsStandard:         "FIPS-204",
      securityLevel:        5,
      publicKeyFingerprint: pqEnvelope.mlDsa87?.publicKeyFingerprint ?? "",
      status:               pqEnvelope.status,
      signedAt:             pqEnvelope.signedAt,
      domainSeparator:      pqEnvelope.context?.domainSeparator ?? "",
    },
  });
});

// ── GET /v1/forensic/overrides ──────────────────────────────────────────────

router.get("/v1/forensic/overrides", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.eventType, "HUMAN_IN_THE_LOOP_OVERRIDE"))
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(50);

  res.json({
    count: rows.length,
    overrides: rows.map(r => ({
      forensicAuditId: r.id,
      agentId:         r.agentId,
      traceId:         r.traceId,
      committedAt:     r.timestamp.toISOString(),
      currentHash:     r.currentHash,
      rationale:       r.rationale,
      signatureFingerprint: (r.pqSignature as any)?.mlDsa87?.publicKeyFingerprint ?? "",
    })),
  });
});

// ── POST /v1/forensic/chain-verify/:traceId ─────────────────────────────────
// Returns per-step hash-chain integrity for a trace

router.post("/v1/forensic/chain-verify/:traceId", async (req, res): Promise<void> => {
  const traceId = req.params.traceId;
  if (!traceId) { res.status(400).json({ error: "traceId required" }); return; }

  const { asc: ascFn } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.traceId, traceId))
    .orderBy(ascFn(auditLogsTable.timestamp));

  const steps = rows.map((row, i) => {
    const prev = rows[i - 1];
    const chainOk = i === 0 || prev?.currentHash === row.previousHash;
    return {
      index:       i,
      id:          row.id,
      eventType:   row.eventType,
      currentHash: row.currentHash,
      previousHash: row.previousHash,
      expectedPreviousHash: prev?.currentHash ?? null,
      chainIntact: chainOk,
      timestamp:   row.timestamp.toISOString(),
    };
  });

  const brokenLinks = steps.filter(s => !s.chainIntact);

  res.json({
    traceId,
    totalSteps:   steps.length,
    brokenLinks:  brokenLinks.length,
    chainIntact:  brokenLinks.length === 0,
    steps,
  });
});

export default router;
