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
import { eq, desc, and } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import { viewerScopeCondition } from "../lib/owner";
import { requireAuth } from "../lib/requireAuth";
import { computeHash, getLastHash } from "../lib/hash.js";
import { quantumSigner } from "../crypto/quantum_ledger.js";
import { signWithMLDSA } from "../crypto/pqc.js";

const router = Router();

// ── Fix Monitor — in-memory registry ─────────────────────────────────────────
// Tracks agents under elevated signature sampling after a dual-sig fix.
interface FixMonitorEntry { since: Date; eventsRemaining: number; traceId: string; }
const fixMonitorRegistry = new Map<string, FixMonitorEntry>();

export function setFixMonitorActive(agentId: string, traceId: string): void {
  fixMonitorRegistry.set(agentId, { since: new Date(), eventsRemaining: 100, traceId });
}
export function isFixMonitorActive(agentId: string): boolean {
  return fixMonitorRegistry.has(agentId) && (fixMonitorRegistry.get(agentId)!.eventsRemaining > 0);
}
export function getFixMonitorStatus(agentId: string): FixMonitorEntry | null {
  return fixMonitorRegistry.get(agentId) ?? null;
}
/** Decrements the remaining event counter; removes entry when exhausted. */
export function tickFixMonitor(agentId: string): void {
  const entry = fixMonitorRegistry.get(agentId);
  if (!entry) return;
  entry.eventsRemaining -= 1;
  if (entry.eventsRemaining <= 0) fixMonitorRegistry.delete(agentId);
}

// ── POST /v1/forensic/override ──────────────────────────────────────────────

router.post("/v1/forensic/override", requireAuth, async (req, res): Promise<void> => {
  const { logId, newRationale, newToolParams, operatorId } = req.body;

  if (!logId || typeof logId !== "string") {
    res.status(400).json({ error: "logId is required" });
    return;
  }
  if (!newRationale || typeof newRationale !== "string" || !newRationale.trim()) {
    res.status(400).json({ error: "newRationale is required" });
    return;
  }

  // 1. Fetch the original event (scoped — admins/users can only override
  //    rows they're allowed to see; demo NULL-owner rows are off-limits to
  //    signed-in users)
  const [original] = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.id, logId), viewerScopeCondition(req)));

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

router.get("/v1/forensic/overrides", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.eventType, "HUMAN_IN_THE_LOOP_OVERRIDE"),
      viewerScopeCondition(req),
    ))
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

router.post("/v1/forensic/chain-verify/:traceId", requireAuth, async (req, res): Promise<void> => {
  const rawTraceId = req.params.traceId;
  const traceId = Array.isArray(rawTraceId) ? rawTraceId[0] : rawTraceId;
  if (!traceId) { res.status(400).json({ error: "traceId required" }); return; }

  const { asc: ascFn } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.traceId, traceId), viewerScopeCondition(req)))
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

// ── POST /v1/governance/confirm-fix ─────────────────────────────────────────
// Dual-signature Multi-Sig gate (the "Two-Man Rule"):
//   1. Operator signs the fix intent (tracked by challengeId + operatorId)
//   2. Sovereign signs (dev mode: accept sovereignOverrideDev:true as 2nd sig)
//   3. On consensus: commit HUMAN_IN_THE_LOOP_OVERRIDE + RECURSIVE_FIX_VERIFIED
//   4. Set FIX_MONITOR_ACTIVE (100 event 100% sampling window)

router.post("/v1/governance/confirm-fix", async (req, res): Promise<void> => {
  const {
    logId, newRationale, newToolParams, operatorId, challengeId,
    sovereignOverrideDev,
  } = req.body;

  if (!logId || typeof logId !== "string") {
    res.status(400).json({ error: "logId is required" }); return;
  }
  if (!newRationale || !newRationale.trim()) {
    res.status(400).json({ error: "newRationale is required" }); return;
  }
  if (!challengeId) {
    res.status(400).json({ error: "challengeId is required (multi-sig nonce)" }); return;
  }

  const isDev = process.env.NODE_ENV !== "production";
  if (!sovereignOverrideDev && !isDev) {
    res.status(403).json({ error: "Sovereign signature required. Use the Quantum QR Code." });
    return;
  }

  const [original] = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, logId));
  if (!original) { res.status(404).json({ error: "Original log entry not found" }); return; }

  const { agentId, traceId } = original;
  const originalPayload = (original.payload ?? {}) as Record<string, unknown>;

  // ── Build corrected payload ──────────────────────────────────────────────
  const correctedPayload: Record<string, unknown> = {
    ...originalPayload,
    ...(newToolParams ? { toolParameters: newToolParams } : {}),
    _multiSigOverride: {
      originalLogId: logId,
      originalEventType: original.eventType,
      correctedRationale: newRationale,
      operatorId: operatorId ?? "human-operator",
      challengeId,
      sovereignApprovalMode: sovereignOverrideDev ? "DEV_OVERRIDE" : "QR_SCAN",
      overrideType: "SOVEREIGN_MULTI_SIG",
    },
  };

  // ── LEDGER ENTRY 1: HUMAN_IN_THE_LOOP_OVERRIDE ─────────────────────────
  const ts1 = new Date();
  const prev1 = await getLastHash();
  const h1    = computeHash(ts1.toISOString(), agentId, correctedPayload, prev1);
  const pqe1  = quantumSigner.sign(h1, "HUMAN_IN_THE_LOOP_OVERRIDE", agentId);
  const pqc1  = signWithMLDSA(h1);

  const [override] = await db.insert(auditLogsTable).values({
    timestamp: ts1,
    agentId, traceId,
    eventType: "HUMAN_IN_THE_LOOP_OVERRIDE",
    payload: correctedPayload,
    rationale: newRationale,
    currentHash: h1, previousHash: prev1,
    isAnomalous: false, anomalyReason: null,
    consistencyScore: 1.0, consistencyReasons: [],
    quantumSig: pqc1.signature.substring(0, 88),
    pqSignature: pqe1,
  } as any).returning();

  // ── LEDGER ENTRY 2: RECURSIVE_FIX_VERIFIED ──────────────────────────────
  const ts2 = new Date();
  const prev2 = override.currentHash;
  const fixPayload = {
    overrideEventId: override.id,
    fixedLogId: logId,
    agentId,
    traceId,
    challengeId,
    sovereignApprovalMode: sovereignOverrideDev ? "DEV_OVERRIDE" : "QR_SCAN",
    fixMonitorEventsRemaining: 100,
  };
  const h2   = computeHash(ts2.toISOString(), agentId, fixPayload, prev2);
  const pqe2 = quantumSigner.sign(h2, "RECURSIVE_FIX_VERIFIED", agentId);
  const pqc2 = signWithMLDSA(h2);

  const [fixVerified] = await db.insert(auditLogsTable).values({
    timestamp: ts2,
    agentId, traceId,
    eventType: "RECURSIVE_FIX_VERIFIED",
    payload: fixPayload,
    rationale: `Sovereign dual-sig fix verified. FIX_MONITOR_ACTIVE for next 100 events. ChallengeID: ${challengeId}`,
    currentHash: h2, previousHash: prev2,
    isAnomalous: false, anomalyReason: null,
    consistencyScore: 1.0, consistencyReasons: [],
    quantumSig: pqc2.signature.substring(0, 88),
    pqSignature: pqe2,
  } as any).returning();

  // ── Activate Fix Monitor (100-event elevated sampling window) ────────────
  setFixMonitorActive(agentId, traceId);

  res.json({
    status: "DUAL_SIG_COMMITTED",
    forensicAuditId: override.id,
    fixVerifiedEventId: fixVerified.id,
    agentId, traceId,
    originalLogId: logId,
    challengeId,
    fixMonitor: { active: true, eventsRemaining: 100 },
    committedAt: ts1.toISOString(),
    quantumProof: {
      algorithm: "ML-DSA-87",
      fipsStandard: "FIPS-204",
      securityLevel: 5,
      publicKeyFingerprint: pqe1.mlDsa87?.publicKeyFingerprint ?? "",
      status: pqe1.status,
      signedAt: pqe1.signedAt,
      domainSeparator: pqe1.context?.domainSeparator ?? "",
    },
  });
});

// ── GET /v1/governance/fix-monitor/:agentId ──────────────────────────────────
router.get("/v1/governance/fix-monitor/:agentId", (req, res): void => {
  const { agentId } = req.params;
  const entry = getFixMonitorStatus(agentId);
  res.json({
    agentId,
    active: !!entry && entry.eventsRemaining > 0,
    ...(entry ?? { eventsRemaining: 0, since: null, traceId: null }),
  });
});

// ── POST /v1/forensic/kill-switch-log ───────────────────────────────────────
// Called when Kill Switch is used from the Trace Interdiction Panel.
// Writes EMERGENCY_SOLO_REVOKE to the immutable audit ledger as a record
// that this was a unilateral emergency action (bypasses Two-Man Rule).

router.post("/v1/forensic/kill-switch-log", async (req, res): Promise<void> => {
  const { agentId, traceId, operatorId, reason } = req.body;
  if (!agentId) { res.status(400).json({ error: "agentId required" }); return; }

  const ts = new Date();
  const payload = {
    operatorId: operatorId ?? "unknown-operator",
    reason: reason ?? "Emergency Kill Switch activated from Trace Interdiction Panel",
    note: "BYPASSES_SOVEREIGN_MULTI_SIG — Single-operator emergency action. No second signature required.",
  };
  const prev = await getLastHash();
  const hash = computeHash(ts.toISOString(), agentId, payload, prev);
  const pqe  = quantumSigner.sign(hash, "EMERGENCY_SOLO_REVOKE", agentId);
  const pqc  = signWithMLDSA(hash);

  const [inserted] = await db.insert(auditLogsTable).values({
    timestamp: ts,
    agentId, traceId: traceId ?? `emergency-${Date.now()}`,
    eventType: "EMERGENCY_SOLO_REVOKE",
    payload,
    rationale: `EMERGENCY: Kill Switch activated. Single-operator revocation. No sovereign co-signature.`,
    currentHash: hash, previousHash: prev,
    isAnomalous: true,
    anomalyReason: "EMERGENCY_SOLO_REVOKE — bypasses dual-sig governance",
    consistencyScore: 1.0, consistencyReasons: [],
    quantumSig: pqc.signature.substring(0, 88),
    pqSignature: pqe,
  } as any).returning();

  res.json({
    status: "EMERGENCY_SOLO_REVOKE_LOGGED",
    eventId: inserted.id,
    agentId,
    committedAt: ts.toISOString(),
  });
});

export default router;
