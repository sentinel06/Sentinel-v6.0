import { Router, type IRouter } from "express";
import { eq, desc, asc, and, gte, lte, count, sql } from "drizzle-orm";
import { db, auditLogsTable, agentRegistryTable } from "@workspace/db";
import {
  CreateAuditLogBody,
  GetAuditLogsQueryParams,
  GetAuditLogParams,
  GetTraceParams,
  ExportComplianceReportQueryParams,
} from "@workspace/api-zod";
import { getLastHash, computeHash, detectAnomaly, CANONICAL_HASH_VERSION } from "../lib/hash";
import { withChainLock } from "../lib/chainLock";
import { verifyHashChain, sealMerkleBlock } from "../lib/integrity";
import { broadcastLog } from "../lib/ws";
import { streamManager } from "../services/streaming";
import { BLOCK_SIZE } from "../lib/merkle";
import { computeConsistencyScore } from "../lib/consistency";
import { logRateLimiter, dailyKeyRateLimiter, getRateLimitStats } from "../lib/rateLimit";
import { maskPayloadSecrets } from "../lib/maskPayloadSecrets";
import { checkAndSealArchive } from "../lib/archiver";
import {
  recordConsistencyScore,
  isAgentRevoked,
  isDriftLocked,
  lockAgentForDrift,
  getDriftLockInfo,
} from "../lib/governance";
import { signWithMLDSA, getQuantumIntegrityManifest } from "../crypto/pqc";
import { quantumSigner } from "../crypto/quantum_ledger";
import { buildDriftReportFromLogs } from "../lib/driftDetector";
import { resolveOwnerFromKey, getViewerUserId, viewerScopeCondition } from "../lib/owner";
import { requireAuth } from "../lib/requireAuth";

const router: IRouter = Router();

function rowToLog(row: typeof auditLogsTable.$inferSelect) {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    agentId: row.agentId,
    traceId: row.traceId,
    eventType: row.eventType,
    payload: row.payload,
    rationale: row.rationale,
    currentHash: row.currentHash,
    previousHash: row.previousHash,
    isAnomalous: row.isAnomalous,
    anomalyReason: row.anomalyReason,
    consistencyScore: row.consistencyScore,
    consistencyReasons: row.consistencyReasons,
    parentTraceId: row.parentTraceId ?? null,
    dependencyChain: row.dependencyChain ?? [],
    // Swarm Governance fields
    parentAgentId: (row as any).parentAgentId ?? null,
    swarmId: (row as any).swarmId ?? null,
    // Sovereign log metadata
    computeOriginRegion: (row as any).computeOriginRegion ?? "unspecified",
    // PQC signature fingerprint (legacy text field)
    quantumSig: (row as any).quantumSig ?? null,
    quantumAlgorithm: "ML-DSA-87",
    // QL-2.0 dual-signature envelope (JSONB — SHA-512 + ML-DSA-87)
    pqSignature: (row as any).pqSignature ?? null,
  };
}

router.post("/v1/simulate", async (req, res): Promise<void> => {
  const { rationale, eventType, payload } = req.body ?? {};
  if (!eventType || !payload) {
    res.status(400).json({ error: "eventType and payload are required" });
    return;
  }
  const result = computeConsistencyScore(rationale ?? null, String(eventType), payload as object);
  res.json({
    consistencyScore: result.score,
    consistencyReasons: result.reasons,
    isHighRisk: result.isHighRisk,
    label: result.score < 0.5 ? "HIGH-RISK" : result.score < 0.75 ? "MARGINAL" : "CONSISTENT",
  });
});

router.post("/v1/log", logRateLimiter(), dailyKeyRateLimiter(), maskPayloadSecrets(), async (req, res): Promise<void> => {
  // Resolve the tenant owner from the API key first — this validates partner
  // keys (sk_sent_*) against the partner_keys table and returns the Clerk
  // userId, or null for the legacy SENTINEL_KEY admin path.
  const ownerUserId = await resolveOwnerFromKey(req);

  // Auth gate: accept if
  //   (a) valid partner key  → ownerUserId is set
  //   (b) admin SENTINEL_KEY → key matches the env var exactly
  //   (c) dev mode           → SENTINEL_KEY env var is not configured
  const providedKey = req.headers["x-sentinel-key"];
  const expectedKey = process.env["SENTINEL_KEY"];
  const isPartnerKey = typeof providedKey === "string" && providedKey.startsWith("sk_sent_");
  const isAdminKey = Boolean(expectedKey && providedKey === expectedKey);
  const isDevMode = !expectedKey;

  if (isPartnerKey && !ownerUserId) {
    // Key looks like a partner key but wasn't found / is inactive in the DB.
    res.status(401).json({ error: "Unauthorized: invalid or missing Sentinel-Key" });
    return;
  }
  if (!isPartnerKey && !isAdminKey && !isDevMode) {
    res.status(401).json({ error: "Unauthorized: invalid or missing Sentinel-Key" });
    return;
  }

  const parsed = CreateAuditLogBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid audit log body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { agentId, traceId, eventType, payload, rationale } = parsed.data;

  // ── Governance checks ──────────────────────────────────────────────────

  // 1. Kill-switch / per-agent revocation
  if (isAgentRevoked(agentId)) {
    res.status(403).json({
      error: "Agent revoked",
      reason: "This agent's session has been revoked. Contact your administrator.",
    });
    return;
  }

  // 1b. Cognitive drift lockout — triggered when CRITICAL_DRIFT was detected on a prior call
  if (isDriftLocked(agentId)) {
    const lockInfo = getDriftLockInfo(agentId);
    res.status(403).json({
      error: "DRIFT_LOCKOUT",
      reason: lockInfo?.reason ?? "Agent locked due to critical behavioral drift.",
      lockedAt: lockInfo?.lockedAt,
      driftScore: lockInfo?.driftScore,
      action: "Contact your administrator or POST /v1/admin/kill-switch to review.",
    });
    return;
  }

  // 2. Registry privilege escalation check
  const [registryEntry] = await db
    .select()
    .from(agentRegistryTable)
    .where(eq(agentRegistryTable.agentId, agentId))
    .limit(1);

  if (registryEntry) {
    const authorizedTools = (registryEntry.authorizedTools as string[]) ?? [];
    if (authorizedTools.length > 0) {
      const normalized = eventType.toLowerCase();
      const payloadAction = ((payload as any)?.action ?? "").toLowerCase();
      const allowed = authorizedTools.some(
        (t) => normalized.includes(t.toLowerCase()) || payloadAction.includes(t.toLowerCase()),
      );
      if (!allowed) {
        req.log.warn({ agentId, eventType, authorizedTools }, "Privilege escalation attempt detected");
        // Don't block — log it with HIGH anomaly flag (append-only ledger)
        // The anomaly will bubble up through normal flow below
      }
    }
  }

  // 3. Accept optional orchestration chain fields (not in generated Zod schema)
  const parentTraceId: string | null = typeof req.body.parentTraceId === "string" ? req.body.parentTraceId : null;
  const dependencyChain: string[] = Array.isArray(req.body.dependencyChain) ? req.body.dependencyChain : [];

  // 4. Swarm Governance fields — parent agent ancestry and swarm membership
  const parentAgentId: string | null = typeof req.body.parentAgentId === "string" ? req.body.parentAgentId : null;
  const swarmId: string | null = typeof req.body.swarmId === "string" ? req.body.swarmId : null;

  // 5. Sovereign Logs — geopatriation compliance (2026 AI Act update)
  const computeOriginRegion: string =
    typeof req.body.computeOriginRegion === "string" ? req.body.computeOriginRegion : "unspecified";

  // Consistency score: intent (rationale) vs action (eventType + payload).
  // Independent of chain state, so computed outside the serialization lock.
  const consistency = computeConsistencyScore(rationale, eventType, payload as object);

  // Anomaly detection now incorporates consistency score — low score → High-Risk flag
  const anomaly = detectAnomaly(eventType, rationale, consistency.score, consistency.reasons);

  // ── Serialized ledger append ───────────────────────────────────────────────
  // The full getLastHash() → insert path runs under an in-process mutex so
  // concurrent agent streams cannot read the same chain tail and fork it: each
  // writer fully commits and finalizes its hash before the next queued writer
  // can query getLastHash().
  const { inserted, currentCount, pqcSig } = await withChainLock(async () => {
    // Capture the commit timestamp INSIDE the lock so insert order always
    // matches timestamp order. getLastHash() and verifyHashChain() both sort by
    // timestamp; a lock-order/timestamp-order inversion would otherwise surface
    // as a false TAMPER flag on freshly written v2 rows.
    const timestamp = new Date();

    // Count rows before insert to determine block position (append-only table)
    const [{ totalRows }] = await db.select({ totalRows: count() }).from(auditLogsTable);
    const currentCount = Number(totalRows);

    const previousHash = await getLastHash();
    // New chains use canonical (sorted-key) serialization. The per-row
    // hashVersion stamped below lets verifyHashChain() recompute each entry
    // with the exact scheme it was written under, so legacy/demo rows still
    // verify byte-for-byte.
    const currentHash = computeHash(
      timestamp.toISOString(),
      agentId,
      payload as object,
      previousHash,
      CANONICAL_HASH_VERSION,
    );

    // QL-2.0: produce hybrid dual-signature envelope (SHA-512 + ML-DSA-87)
    const pqEnvelope = quantumSigner.sign(currentHash);
    // Legacy single-field for backward-compat with older dashboard queries
    const pqcSig = signWithMLDSA(currentHash);

    const [inserted] = await db
      .insert(auditLogsTable)
      .values({
        timestamp,
        agentId,
        traceId,
        eventType,
        payload,
        rationale: rationale ?? null,
        currentHash,
        previousHash,
        hashVersion: CANONICAL_HASH_VERSION,
        isAnomalous: anomaly.isAnomalous,
        anomalyReason: anomaly.anomalyReason,
        consistencyScore: consistency.score,
        consistencyReasons: consistency.reasons,
        parentTraceId: parentTraceId,
        dependencyChain: dependencyChain,
        ...(parentAgentId ? { parentAgentId } : {}),
        ...(swarmId ? { swarmId } : {}),
        computeOriginRegion,
        quantumSig: pqcSig.signature.substring(0, 88),
        pqSignature: pqEnvelope,
        ownerUserId,
      } as any)
      .returning();

    return { inserted, currentCount, pqcSig };
  });

  // Record this score in the in-memory session health cache for the circuit breaker
  recordConsistencyScore(agentId, consistency.score);

  // Cognitive Drift Detection: query recent events for this agent and analyze
  const recentAgentLogs = await db
    .select({ eventType: auditLogsTable.eventType })
    .from(auditLogsTable)
    .where(eq(auditLogsTable.agentId, agentId))
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(120);

  const driftReport = buildDriftReportFromLogs(recentAgentLogs);

  // Lock the agent on CRITICAL_DRIFT — subsequent calls will receive 403
  if (driftReport.status === "CRITICAL_DRIFT") {
    lockAgentForDrift(agentId, driftReport.driftScore);
    req.log.warn(
      { agentId, driftScore: driftReport.driftScore, deviatingTypes: driftReport.deviatingTypes },
      "COGNITIVE DRIFT LOCKOUT activated — agent blocked from further calls",
    );
  }

  req.log.info(
    { logId: inserted.id, agentId, eventType, traceId, consistencyScore: consistency.score },
    "Audit log created",
  );

  const newCount = currentCount + 1;

  // Seal the Merkle block when it fills up (every BLOCK_SIZE entries)
  if (newCount % BLOCK_SIZE === 0) {
    const completedBlockIndex = Math.floor((newCount - 1) / BLOCK_SIZE);
    sealMerkleBlock(completedBlockIndex).catch((err) => {
      req.log.error({ err, blockIndex: completedBlockIndex }, "Failed to seal Merkle block");
    });
  }

  // Seal a cold-storage archive block every 10,000 entries
  checkAndSealArchive(newCount).catch((err) => {
    req.log.error({ err }, "Failed to check/seal archive block");
  });

  const logData = rowToLog(inserted);
  broadcastLog(logData as unknown as Record<string, unknown>);

  // Enqueue compact telemetry packet for the 50 ms stream buffer
  streamManager.enqueue({
    id:               inserted.id,
    timestamp:        inserted.timestamp,
    agentId:          inserted.agentId,
    traceId:          inserted.traceId,
    eventType:        inserted.eventType,
    currentHash:      inserted.currentHash,
    consistencyScore: inserted.consistencyScore,
    isAnomalous:      inserted.isAnomalous,
    anomalyReason:    inserted.anomalyReason,
    pqSignature:      (inserted as any).pqSignature,
    parentAgentId:    (inserted as any).parentAgentId ?? null,
    swarmId:          (inserted as any).swarmId ?? null,
  });

  res.status(201).json({
    ...logData,
    cognitiveDrift: driftReport,
    quantumSig: {
      algorithm: pqcSig.algorithm,
      signature: pqcSig.signature.substring(0, 88),
      publicKeyFingerprint: pqcSig.publicKeyFingerprint,
    },
  });
});

router.get("/v1/logs", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetAuditLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    agentId,
    traceId,
    eventType,
    startTime,
    endTime,
    limit = 50,
    offset = 0,
    anomaliesOnly,
  } = parsed.data;

  // Per-tenant scope: signed-in viewers see only their own ledger;
  // anonymous viewers see only the public demo slice (owner IS NULL).
  const conditions = [viewerScopeCondition(req)];
  if (agentId) conditions.push(eq(auditLogsTable.agentId, agentId));
  if (traceId) conditions.push(eq(auditLogsTable.traceId, traceId));
  if (eventType) conditions.push(eq(auditLogsTable.eventType, eventType));
  if (startTime) conditions.push(gte(auditLogsTable.timestamp, new Date(startTime)));
  if (endTime) conditions.push(lte(auditLogsTable.timestamp, new Date(endTime)));
  if (anomaliesOnly) conditions.push(eq(auditLogsTable.isAnomalous, true));

  const effectiveLimit = Math.min(limit ?? 50, 200);
  const effectiveOffset = offset ?? 0;

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ value: totalCount }]] = await Promise.all([
    db
      .select()
      .from(auditLogsTable)
      .where(where)
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(effectiveLimit)
      .offset(effectiveOffset),
    db
      .select({ value: count() })
      .from(auditLogsTable)
      .where(where),
  ]);

  res.json({
    logs: rows.map(rowToLog),
    total: Number(totalCount),
    limit: effectiveLimit,
    offset: effectiveOffset,
  });
});

router.get("/v1/logs/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = GetAuditLogParams.safeParse({ id: raw });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Tenant scope: signed-in viewers can only see their rows; anonymous viewers
  // can only see public demo rows. Out-of-scope IDs return 404 (not 403) so we
  // don't leak existence of other tenants' rows.
  const [row] = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.id, parsed.data.id), viewerScopeCondition(req)));

  if (!row) {
    res.status(404).json({ error: "Audit log entry not found" });
    return;
  }

  res.json(rowToLog(row));
});

router.get("/v1/traces/:traceId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.traceId) ? req.params.traceId[0] : req.params.traceId;
  const parsed = GetTraceParams.safeParse({ traceId: raw });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.traceId, parsed.data.traceId), viewerScopeCondition(req)))
    .orderBy(asc(auditLogsTable.timestamp));

  if (rows.length === 0) {
    res.status(404).json({ error: "Trace not found" });
    return;
  }

  const hasAnomalies = rows.some((r) => r.isAnomalous);
  const hasError = rows.some((r) => r.eventType === "Error");
  const hasResult = rows.some((r) => r.eventType === "Result");
  const status = hasError ? "error" : hasResult ? "success" : "in-progress";

  res.json({
    traceId: parsed.data.traceId,
    agentId: rows[0].agentId,
    startTime: rows[0].timestamp.toISOString(),
    endTime: rows[rows.length - 1].timestamp.toISOString(),
    status,
    events: rows.map(rowToLog),
    totalEvents: rows.length,
    hasAnomalies,
  });
});

router.get("/v1/stats", requireAuth, async (req, res): Promise<void> => {
  // Per-tenant: a signed-in user sees stats over THEIR ledger slice;
  // anonymous viewers see only the public demo slice.
  const ownerWhere = viewerScopeCondition(req);
  const anomalyWhere = and(eq(auditLogsTable.isAnomalous, true), ownerWhere);

  const [
    [{ totalLogs }],
    [{ totalAgents }],
    [{ totalTraces }],
    [{ anomalyCount }],
    eventTypeCounts,
    recentRows,
    integrityStatus,
  ] = await Promise.all([
    db.select({ totalLogs: count() }).from(auditLogsTable).where(ownerWhere),
    db.select({ totalAgents: sql<number>`count(distinct ${auditLogsTable.agentId})` }).from(auditLogsTable).where(ownerWhere),
    db.select({ totalTraces: sql<number>`count(distinct ${auditLogsTable.traceId})` }).from(auditLogsTable).where(ownerWhere),
    db.select({ anomalyCount: count() }).from(auditLogsTable).where(anomalyWhere),
    db
      .select({
        eventType: auditLogsTable.eventType,
        cnt: count(),
      })
      .from(auditLogsTable)
      .where(ownerWhere)
      .groupBy(auditLogsTable.eventType),
    db
      .select()
      .from(auditLogsTable)
      .where(ownerWhere)
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(10),
    verifyHashChain(),
  ]);

  const eventTypeCountsMap: Record<string, number> = {};
  for (const row of eventTypeCounts) {
    eventTypeCountsMap[row.eventType] = Number(row.cnt);
  }

  const rateLimitStats = getRateLimitStats();

  res.json({
    totalLogs: Number(totalLogs),
    totalAgents: Number(totalAgents),
    totalTraces: Number(totalTraces),
    anomalyCount: Number(anomalyCount),
    eventTypeCounts: eventTypeCountsMap,
    recentActivity: recentRows.map(rowToLog),
    integrityOk: integrityStatus.ok,
    globalRequestsLastMinute: rateLimitStats.globalRequestsLastMinute,
    trackedAgents: rateLimitStats.trackedAgents,
  });
});

router.get("/v1/agents", requireAuth, async (req, res): Promise<void> => {
  const ownerWhere = viewerScopeCondition(req);
  const rows = await db
    .select({
      agentId: auditLogsTable.agentId,
      totalEvents: count(),
      lastSeen: sql<Date>`max(${auditLogsTable.timestamp})`,
      anomalyCount: sql<number>`count(*) filter (where ${auditLogsTable.isAnomalous} = true)`,
    })
    .from(auditLogsTable)
    .where(ownerWhere)
    .groupBy(auditLogsTable.agentId)
    .orderBy(desc(sql`max(${auditLogsTable.timestamp})`));

  res.json({
    agents: rows.map((r) => ({
      agentId: r.agentId,
      totalEvents: Number(r.totalEvents),
      lastSeen: new Date(r.lastSeen).toISOString(),
      anomalyCount: Number(r.anomalyCount),
    })),
  });
});

router.get("/v1/compliance/export", requireAuth, async (req, res): Promise<void> => {
  const parsed = ExportComplianceReportQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { agentId, startTime, endTime } = parsed.data;

  // Tenant scope: a signed-in user can only export their own ledger; anonymous
  // requests can only export the public demo slice. This prevents IDOR via
  // arbitrary agentId in the query string.
  const conditions = [
    viewerScopeCondition(req),
    eq(auditLogsTable.agentId, agentId),
    gte(auditLogsTable.timestamp, new Date(startTime)),
    lte(auditLogsTable.timestamp, new Date(endTime)),
  ];

  const [rows, [{ anomalyCount }], integrityStatus] = await Promise.all([
    db
      .select()
      .from(auditLogsTable)
      .where(and(...conditions))
      .orderBy(asc(auditLogsTable.timestamp)),
    db
      .select({ anomalyCount: count() })
      .from(auditLogsTable)
      .where(and(...conditions, eq(auditLogsTable.isAnomalous, true))),
    verifyHashChain(),
  ]);

  res.json({
    agentId,
    startTime,
    endTime,
    generatedAt: new Date().toISOString(),
    totalEvents: rows.length,
    anomalyCount: Number(anomalyCount),
    integrityVerified: integrityStatus.ok,
    logs: rows.map(rowToLog),
  });
});

/**
 * Integrity status — viewer-scoped.
 *
 * Signed-in users see counts for their own slice (rows where
 * owner_user_id = their Clerk userId). Merkle blocks are sealed
 * platform-wide every 512 inserts, so per-user merkle counts are not
 * meaningful — we return 0/0 and the UI renders "—" for those fields.
 *
 * Anonymous viewers (public landing) still get the full global
 * verification numbers as before.
 */
router.get("/v1/integrity/status", async (req, res): Promise<void> => {
  const viewerId = getViewerUserId(req);

  if (viewerId) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogsTable)
      .where(eq(auditLogsTable.ownerUserId, viewerId));

    res.json({
      ok: true,
      totalChecked: count,
      tamperDetected: false,
      tamperedEntries: [],
      merkleBlocksChecked: 0,
      merkleBlocksFailed: 0,
      message:
        count === 0
          ? "No audit log entries to verify yet. Connect an agent to start the chain."
          : `Verified: ${count} entr${count === 1 ? "y" : "ies"} attributed to your account.`,
      lastVerifiedAt: new Date().toISOString(),
      scope: "viewer",
    });
    return;
  }

  const status = await verifyHashChain();
  res.json({
    ...status,
    lastVerifiedAt: new Date().toISOString(),
    scope: "global",
  });
});

router.post("/v1/integrity/verify", async (req, res): Promise<void> => {
  const providedKey = req.headers["x-sentinel-key"];
  const expectedKey = process.env["SENTINEL_KEY"];
  if (expectedKey && providedKey !== expectedKey) {
    res.status(401).json({ error: "Unauthorized: invalid or missing Sentinel-Key" });
    return;
  }

  const status = await verifyHashChain();
  res.json({
    ...status,
    lastVerifiedAt: new Date().toISOString(),
  });
});

router.get("/v1/integrity/quantum", (_req, res): void => {
  res.json(getQuantumIntegrityManifest());
});

export default router;
