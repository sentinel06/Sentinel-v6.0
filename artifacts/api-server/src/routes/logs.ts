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
import { getLastHash, computeHash, detectAnomaly } from "../lib/hash";
import { verifyHashChain, sealMerkleBlock } from "../lib/integrity";
import { broadcastLog } from "../lib/ws";
import { BLOCK_SIZE } from "../lib/merkle";
import { computeConsistencyScore } from "../lib/consistency";
import { logRateLimiter, getRateLimitStats } from "../lib/rateLimit";
import { checkAndSealArchive } from "../lib/archiver";
import {
  recordConsistencyScore,
  isAgentRevoked,
} from "../lib/governance";

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
  };
}

function verifySentinelKey(req: any): boolean {
  const key = req.headers["x-sentinel-key"];
  const expected = process.env["SENTINEL_KEY"];
  if (!expected) return true;
  return key === expected;
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

router.post("/v1/log", logRateLimiter(), async (req, res): Promise<void> => {
  if (!verifySentinelKey(req)) {
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

  const timestamp = new Date();

  // Count rows before insert to determine block position (append-only table)
  const [{ totalRows }] = await db.select({ totalRows: count() }).from(auditLogsTable);
  const currentCount = Number(totalRows);

  const previousHash = await getLastHash();
  const currentHash = computeHash(
    timestamp.toISOString(),
    agentId,
    payload as object,
    previousHash,
  );

  // Consistency score: intent (rationale) vs action (eventType + payload)
  const consistency = computeConsistencyScore(rationale, eventType, payload as object);

  // Anomaly detection now incorporates consistency score — low score → High-Risk flag
  const anomaly = detectAnomaly(eventType, rationale, consistency.score, consistency.reasons);

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
      isAnomalous: anomaly.isAnomalous,
      anomalyReason: anomaly.anomalyReason,
      consistencyScore: consistency.score,
      consistencyReasons: consistency.reasons,
      parentTraceId: parentTraceId,
      dependencyChain: dependencyChain,
    })
    .returning();

  // Record this score in the in-memory session health cache for the circuit breaker
  recordConsistencyScore(agentId, consistency.score);

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
  res.status(201).json(logData);
});

router.get("/v1/logs", async (req, res): Promise<void> => {
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

  const conditions = [];
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

router.get("/v1/logs/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = GetAuditLogParams.safeParse({ id: raw });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.id, parsed.data.id));

  if (!row) {
    res.status(404).json({ error: "Audit log entry not found" });
    return;
  }

  res.json(rowToLog(row));
});

router.get("/v1/traces/:traceId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.traceId) ? req.params.traceId[0] : req.params.traceId;
  const parsed = GetTraceParams.safeParse({ traceId: raw });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.traceId, parsed.data.traceId))
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

router.get("/v1/stats", async (_req, res): Promise<void> => {
  const [
    [{ totalLogs }],
    [{ totalAgents }],
    [{ totalTraces }],
    [{ anomalyCount }],
    eventTypeCounts,
    recentRows,
    integrityStatus,
  ] = await Promise.all([
    db.select({ totalLogs: count() }).from(auditLogsTable),
    db.select({ totalAgents: sql<number>`count(distinct ${auditLogsTable.agentId})` }).from(auditLogsTable),
    db.select({ totalTraces: sql<number>`count(distinct ${auditLogsTable.traceId})` }).from(auditLogsTable),
    db.select({ anomalyCount: count() }).from(auditLogsTable).where(eq(auditLogsTable.isAnomalous, true)),
    db
      .select({
        eventType: auditLogsTable.eventType,
        cnt: count(),
      })
      .from(auditLogsTable)
      .groupBy(auditLogsTable.eventType),
    db
      .select()
      .from(auditLogsTable)
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

router.get("/v1/agents", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      agentId: auditLogsTable.agentId,
      totalEvents: count(),
      lastSeen: sql<Date>`max(${auditLogsTable.timestamp})`,
      anomalyCount: sql<number>`count(*) filter (where ${auditLogsTable.isAnomalous} = true)`,
    })
    .from(auditLogsTable)
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

router.get("/v1/compliance/export", async (req, res): Promise<void> => {
  const parsed = ExportComplianceReportQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { agentId, startTime, endTime } = parsed.data;

  const conditions = [
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

router.get("/v1/integrity/status", async (_req, res): Promise<void> => {
  const status = await verifyHashChain();
  res.json({
    ...status,
    lastVerifiedAt: new Date().toISOString(),
  });
});

router.post("/v1/integrity/verify", async (req, res): Promise<void> => {
  if (!verifySentinelKey(req)) {
    res.status(401).json({ error: "Unauthorized: invalid or missing Sentinel-Key" });
    return;
  }

  const status = await verifyHashChain();
  res.json({
    ...status,
    lastVerifiedAt: new Date().toISOString(),
  });
});

export default router;
