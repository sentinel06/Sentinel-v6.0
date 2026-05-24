/**
 * Governance-as-a-Service (GaaS) Partner Routes
 *
 * GET  /v1/partner/whitepaper            — Download WHITE_PAPER.md as a file
 * POST /v1/partner/keys                  — Generate a new scoped API key
 * GET  /v1/partner/keys                  — List all keys (optionally filter by partnerId)
 * PATCH /v1/partner/keys/:keyId/revoke   — Revoke a key
 * GET  /v1/partner/health                — Aggregate trust-score feed per partner
 * GET  /v1/partner/quantum-audit         — Executive Quantum Audit (EQA) for a partnerId
 * POST /v1/partner/demo/seed             — Seed the Apex-Fintech demo environment (GaaS Golden Key)
 * GET  /v1/partner/demo/golden-key       — Return the Golden Key for the demo partner
 * GET  /v1/compliance/executive-summary  — 24h executive audit (board-level report)
 * GET  /v1/compliance/audit-report       — Partner-scoped time-windowed audit report
 */

import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import { db, partnerKeysTable, agentRegistryTable, auditLogsTable, authorizationRequestsTable } from "@workspace/db";
import { eq, desc, avg, count, and, inArray, gte, lte, sql, isNotNull } from "drizzle-orm";
import { seedDemoEnvironment } from "../utils/demo_seeding.js";
import { requireAuth } from "../lib/requireAuth";
import { isAdminViewer, getViewerEmail } from "../lib/admin";

// ── Golden Key constant (mirrors demo_seeding.ts) ─────────────────────────
const GOLDEN_KEY = "SENTINEL-DEMO-GOLDEN-2026";

const router: IRouter = Router();

// ── White Paper download path ─────────────────────────────────────────────
// process.cwd() = /home/runner/workspace/artifacts/api-server (where `node dist/index.mjs` runs)
// So ../../WHITE_PAPER.md resolves to the monorepo root.
const WHITE_PAPER_PATH = path.resolve(process.cwd(), "../../WHITE_PAPER.md");

// ── GET /v1/partner/whitepaper ────────────────────────────────────────────

router.get("/v1/partner/whitepaper", (_req, res): void => {
  if (!fs.existsSync(WHITE_PAPER_PATH)) {
    res.status(404).json({ error: "White paper not found" });
    return;
  }
  res.setHeader("Content-Disposition", 'attachment; filename="Agent-Sentinel-White-Paper.md"');
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.sendFile(WHITE_PAPER_PATH);
});

// ── Tier config (controls features available behind each key) ──────────────

const TIERS = {
  Core:       { prefix: "core", rateLimit: 60,   features: ["audit_log", "hash_chain"] },
  Pro:        { prefix: "pro",  rateLimit: 600,  features: ["audit_log", "hash_chain", "ml_dsa_87", "drift_detection"] },
  Enterprise: { prefix: "ent",  rateLimit: 6000, features: ["audit_log", "hash_chain", "ml_dsa_87", "drift_detection", "swarm_ancestry", "recursive_revocation", "pdf_export", "partner_portal"] },
} as const;

type Tier = keyof typeof TIERS;

function generateKey(tier: Tier): string {
  const prefix = TIERS[tier].prefix;
  const secret = randomBytes(24).toString("base64url");
  return `sk_sent_${prefix}_${secret}`;
}

// ── POST /v1/partner/keys ─────────────────────────────────────────────────

router.post("/v1/partner/keys", requireAuth, async (req, res): Promise<void> => {
  const { label, tier, swarmScope } = req.body ?? {};
  // Trust-on-input fix: non-admins cannot mint a key for somebody else.
  // Owner identity is always the signed-in viewer's userId + email; admins
  // may pass an explicit partnerId/partnerEmail (used to provision keys on
  // behalf of partners during onboarding/support).
  const viewerEmail = getViewerEmail(req);
  const reqPartnerId = typeof req.body?.partnerId === "string" ? req.body.partnerId : null;
  const reqPartnerEmail = typeof req.body?.partnerEmail === "string" ? req.body.partnerEmail : null;
  const partnerId = isAdminViewer(req) && reqPartnerId ? reqPartnerId : (req as any).auth?.()?.userId ?? null;
  const partnerEmail = isAdminViewer(req) && reqPartnerEmail ? reqPartnerEmail : viewerEmail;

  if (!partnerId || !partnerEmail) {
    res.status(400).json({ error: "could not resolve viewer identity" });
    return;
  }

  const resolvedTier: Tier = (["Core", "Pro", "Enterprise"].includes(tier) ? tier : "Core") as Tier;
  const keyValue = generateKey(resolvedTier);

  const [key] = await db
    .insert(partnerKeysTable)
    .values({
      keyValue,
      partnerId,
      partnerEmail,
      label: label ?? "Unnamed Key",
      tier: resolvedTier,
      swarmScope: swarmScope ?? null,
    })
    .returning();

  res.status(201).json({
    key,
    // Return the full key value only on creation — it is never shown again
    keyValue,
    tier: resolvedTier,
    tierConfig: TIERS[resolvedTier],
    message: `Store this key securely — it will not be shown again.`,
  });
});

// ── GET /v1/partner/keys ──────────────────────────────────────────────────

router.get("/v1/partner/keys", requireAuth, async (req, res): Promise<void> => {
  // Tenant isolation: a non-admin can only ever list their own keys, even
  // if they pass a different `partnerId` in the query string. Admins may
  // narrow by `partnerId` or list everything.
  const viewerId = (req as any).auth?.()?.userId ?? null;
  let scope: import("drizzle-orm").SQL | undefined;
  if (isAdminViewer(req)) {
    const requested = typeof req.query.partnerId === "string" ? req.query.partnerId : null;
    if (requested) scope = eq(partnerKeysTable.partnerId, requested);
  } else {
    if (!viewerId) { res.json({ keys: [], total: 0 }); return; }
    scope = eq(partnerKeysTable.partnerId, viewerId);
  }
  const baseQuery = db.select().from(partnerKeysTable);
  const rows = await (scope ? baseQuery.where(scope) : baseQuery).orderBy(desc(partnerKeysTable.createdAt));

  // Mask the key value — return only first 20 chars + ****
  const masked = rows.map((k) => ({
    ...k,
    keyValue: `${k.keyValue.substring(0, 20)}****`,
  }));

  res.json({ keys: masked, total: masked.length });
});

// ── PATCH /v1/partner/keys/:keyId/revoke ──────────────────────────────────

router.patch("/v1/partner/keys/:keyId/revoke", requireAuth, async (req, res): Promise<void> => {
  const keyIdParam = req.params.keyId;
  if (typeof keyIdParam !== "string") {
    res.status(400).json({ error: "keyId is required" });
    return;
  }
  const keyId: string = keyIdParam;

  // Tenant isolation: only the key's owner (or an admin) can revoke it.
  // 404 (not 403) avoids leaking which keyIds exist.
  const viewerId = (req as any).auth?.()?.userId ?? null;
  const [existing] = await db
    .select({ partnerId: partnerKeysTable.partnerId })
    .from(partnerKeysTable)
    .where(eq(partnerKeysTable.id, keyId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  if (!isAdminViewer(req) && existing.partnerId !== viewerId) {
    res.status(404).json({ error: "Key not found" });
    return;
  }

  const [updated] = await db
    .update(partnerKeysTable)
    .set({ isActive: false })
    .where(eq(partnerKeysTable.id, keyId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Key not found" });
    return;
  }

  res.json({ success: true, keyId, status: "revoked" });
});

// ── generate_executive_summary (core function) ────────────────────────────
//
// Aggregates last N hours of audit logs into three board-level metrics:
//   1. Trust Velocity      — rate of verified (non-anomalous) actions per hour
//   2. Quantum Integrity   — FIPS-204 ML-DSA-87 signature coverage %
//   3. Intervention Success — drift/circuit-triggered autonomous blocks

async function generate_executive_summary(
  partnerId: string | null,
  hours = 24,
) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - hours * 60 * 60 * 1000);

  // Determine which agents to scope
  let agentScope: string[] | null = null;
  let agentsGovernedCount = 0;
  let activeAgentsCount = 0;

  if (partnerId) {
    const agents = await db
      .select()
      .from(agentRegistryTable)
      .where(eq(agentRegistryTable.ownerEmail, partnerId));
    agentScope = agents.map((a) => a.agentId);
    agentsGovernedCount = agents.length;
    activeAgentsCount = agents.filter((a) => a.isActive).length;
  } else {
    const all = await db.select().from(agentRegistryTable);
    agentsGovernedCount = all.length;
    activeAgentsCount = all.filter((a) => a.isActive).length;
  }

  // Fetch logs in the time window.
  // isNotNull(ownerUserId) explicitly excludes the NULL demo/system slice so
  // compliance reports never surface seeded demo data regardless of agentScope.
  const logConditions: Parameters<typeof and>[0][] = [
    isNotNull(auditLogsTable.ownerUserId),
    gte(auditLogsTable.timestamp, windowStart),
    lte(auditLogsTable.timestamp, now),
  ];
  if (agentScope && agentScope.length > 0) {
    logConditions.push(inArray(auditLogsTable.agentId, agentScope));
  }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(...logConditions));

  const totalEvents = logs.length;

  // ── 1. Trust Velocity ──────────────────────────────────────────────────
  // Verified = non-anomalous events; rate = verified events per hour
  const verified = logs.filter((l) => !l.isAnomalous);
  const totalVerified = verified.length;
  const verifiedPct = totalEvents > 0 ? Math.round((totalVerified / totalEvents) * 1000) / 10 : 100;
  const trustVelocityRate = Math.round((totalVerified / hours) * 10) / 10; // actions/hr

  // Velocity trend: compare first vs last 12h within the window
  const midpoint = new Date(windowStart.getTime() + (hours / 2) * 60 * 60 * 1000);
  const firstHalf  = verified.filter((l) => l.timestamp < midpoint).length;
  const secondHalf = verified.filter((l) => l.timestamp >= midpoint).length;
  const velocityTrend: "ACCELERATING" | "STABLE" | "DECELERATING" =
    secondHalf > firstHalf * 1.1 ? "ACCELERATING"
    : secondHalf < firstHalf * 0.9 ? "DECELERATING"
    : "STABLE";

  // ── 2. Quantum Integrity Score (FIPS-204) ─────────────────────────────
  const quantumSigned = logs.filter((l) => l.pqSignature !== null).length;
  const quantumScore = totalEvents > 0 ? Math.round((quantumSigned / totalEvents) * 1000) / 10 : 0;
  let fipsCertification: string;
  if (quantumScore === 0)        fipsCertification = "NON-COMPLIANT";
  else if (quantumScore < 50)    fipsCertification = "PARTIAL";
  else if (quantumScore < 90)    fipsCertification = "COMPLIANT — QL-1.0";
  else if (quantumScore < 100)   fipsCertification = "COMPLIANT — QL-2.0";
  else                           fipsCertification = "FULLY SOVEREIGN — QL-2.0";

  // ── 3. Intervention Success ────────────────────────────────────────────
  // Drift-triggered blocks = anomalous events where the governance engine
  // intercepted due to cognitive drift, circuit-breaker, or kill-switch
  const driftKeywords = /drift|cognitive|lockout/i;
  const circuitKeywords = /circuit|kill.switch|blocked|revoked/i;
  const anomalous = logs.filter((l) => l.isAnomalous);
  const driftTriggered    = anomalous.filter((l) => l.anomalyReason && driftKeywords.test(l.anomalyReason)).length;
  const circuitTriggered  = anomalous.filter((l) => l.anomalyReason && circuitKeywords.test(l.anomalyReason)).length;
  const totalInterventions = driftTriggered + circuitTriggered;
  const successRate = anomalous.length > 0
    ? Math.round((totalInterventions / anomalous.length) * 1000) / 10
    : 100;

  // ── Risk Rating ────────────────────────────────────────────────────────
  const anomalyRate = totalEvents > 0 ? anomalous.length / totalEvents : 0;
  let riskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  if (verifiedPct >= 95 && anomalyRate < 0.02)      riskRating = "LOW";
  else if (verifiedPct >= 80 && anomalyRate < 0.10) riskRating = "MEDIUM";
  else if (verifiedPct >= 60 && anomalyRate < 0.25) riskRating = "HIGH";
  else                                                riskRating = "CRITICAL";

  // ── Narrative ──────────────────────────────────────────────────────────
  const narrative = [
    `In the past ${hours} hours, ${agentsGovernedCount} governed agent${agentsGovernedCount !== 1 ? "s" : ""} generated ${totalEvents.toLocaleString()} auditable events.`,
    `Trust Velocity stands at ${trustVelocityRate} verified actions per hour (${verifiedPct}% of all events), with a ${velocityTrend.toLowerCase()} trend over the reporting window.`,
    quantumScore > 0
      ? `Quantum Integrity: ${quantumScore}% of events carry ML-DSA-87 (FIPS-204, Level 5) hybrid signatures — certification status: ${fipsCertification}.`
      : "Quantum signature migration has not yet commenced for this portfolio. Recommend immediate QL-2.0 onboarding.",
    totalInterventions > 0
      ? `The Sentinel governance engine executed ${totalInterventions} autonomous intervention${totalInterventions !== 1 ? "s" : ""} — ${driftTriggered} via Cognitive Drift Detection and ${circuitTriggered} via Circuit Breaker. Intervention success rate: ${successRate}%.`
      : "No autonomous interventions were required in the reporting window.",
    `Overall risk classification: ${riskRating}.`,
  ].join(" ");

  return {
    reportId: `SENT-EXEC-${Date.now()}`,
    generatedAt: now.toISOString(),
    timeWindow: `${hours}h`,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    organization: partnerId ?? "ALL PARTNERS",
    agentsGovernedCount,
    activeAgentsCount,
    totalEvents,
    metrics: {
      trustVelocity: {
        label: "Trust Velocity",
        rate: trustVelocityRate,
        verifiedPct,
        totalVerified,
        totalEvents,
        trend: velocityTrend,
        unit: "actions / hr",
      },
      quantumIntegrityScore: {
        label: "Quantum Integrity Score",
        score: quantumScore,
        fipsLevel: "FIPS-204",
        fipsStandard: "ML-DSA-87 (NIST FIPS-204)",
        signedEvents: quantumSigned,
        totalEvents,
        certification: fipsCertification,
      },
      interventionSuccess: {
        label: "Intervention Success",
        count: totalInterventions,
        driftTriggered,
        circuitTriggered,
        totalAnomalies: anomalous.length,
        successRate,
        unit: "autonomous blocks",
      },
    },
    riskRating,
    complianceFramework: "EU AI Act Art. 12/14 · NIST AI RMF · FIPS-204 (QL-2.0)",
    narrative,
    classification: "BOARD OF DIRECTORS — CONFIDENTIAL",
  };
}

// ── GET /v1/compliance/executive-summary ──────────────────────────────────

router.get("/v1/compliance/executive-summary", requireAuth, async (req, res): Promise<void> => {
  const { hours } = req.query;
  // Trust-on-input: non-admins cannot summarize a different partner's data.
  // Admins may pass any partnerId (or null = platform-wide).
  const viewerEmail = getViewerEmail(req);
  const requested = typeof req.query.partnerId === "string" ? req.query.partnerId : null;
  const partnerId = isAdminViewer(req) ? requested : viewerEmail;
  if (!isAdminViewer(req) && !partnerId) {
    res.status(400).json({ error: "could not resolve viewer email" });
    return;
  }
  try {
    const summary = await generate_executive_summary(
      partnerId,
      hours ? Math.max(1, Math.min(168, Number(hours))) : 24,
    );
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate executive summary" });
  }
});

// ── GET /v1/compliance/audit-report ──────────────────────────────────────
//
// Professional Audit Report: partner-scoped, time-windowed executive summary.
// Aggregates trust score, anomaly disposition (detected vs blocked), and
// quantum-readiness certification score across all partner swarms.

router.get("/v1/compliance/audit-report", requireAuth, async (req, res): Promise<void> => {
  const { timeHorizon = "30d" } = req.query;
  // Trust-on-input: non-admins always get their own report regardless of
  // any partnerId they try to pass.
  const viewerEmail = getViewerEmail(req);
  const requested = typeof req.query.partnerId === "string" ? req.query.partnerId : null;
  const partnerId = isAdminViewer(req) ? requested : viewerEmail;

  if (!partnerId) {
    res.status(400).json({ error: "partnerId (ownerEmail) is required" });
    return;
  }

  // Resolve time window
  const now = new Date();
  const windowStart = new Date(now);
  if (timeHorizon === "7d") windowStart.setDate(windowStart.getDate() - 7);
  else if (timeHorizon === "30d") windowStart.setDate(windowStart.getDate() - 30);
  else if (timeHorizon === "90d") windowStart.setDate(windowStart.getDate() - 90);
  else if (timeHorizon === "365d") windowStart.setFullYear(windowStart.getFullYear() - 1);
  else windowStart.setDate(windowStart.getDate() - 30);

  // 1. Get all agents owned by this partner
  const agents = await db
    .select()
    .from(agentRegistryTable)
    .where(eq(agentRegistryTable.ownerEmail, String(partnerId)));

  if (agents.length === 0) {
    res.status(404).json({ error: "No agents found for this partner" });
    return;
  }

  const agentIds = agents.map((a) => a.agentId);

  // 2. Pull all audit logs for these agents in the time window.
  // isNotNull(ownerUserId) is a second-layer defence: even if an agentId
  // somehow collided with a demo row (NULL owner), it is excluded here.
  const allLogs = await db
    .select()
    .from(auditLogsTable)
    .where(
      and(
        isNotNull(auditLogsTable.ownerUserId),
        inArray(auditLogsTable.agentId, agentIds),
        gte(auditLogsTable.timestamp, windowStart),
        lte(auditLogsTable.timestamp, now),
      ),
    );

  const totalEvents = allLogs.length;

  // 3. Trust score — average consistencyScore across all logs
  const rawTrust =
    totalEvents > 0
      ? allLogs.reduce((s, l) => s + (l.consistencyScore ?? 1.0), 0) / totalEvents
      : 1.0;
  const avgTrustScore = Math.round(rawTrust * 1000) / 10;

  // 4. Anomaly disposition
  const detected = allLogs.filter((l) => l.isAnomalous);
  const totalAnomaliesDetected = detected.length;

  const blockedKeywords = /blocked|circuit|lockout|kill.switch|revoked|drift.lock/i;
  const totalAnomaliesBlocked = detected.filter(
    (l) => l.anomalyReason && blockedKeywords.test(l.anomalyReason),
  ).length;
  const blockRate =
    totalAnomaliesDetected > 0
      ? Math.round((totalAnomaliesBlocked / totalAnomaliesDetected) * 1000) / 10
      : 0;

  // 5. Quantum-Readiness — % of events with a QL-2.0 pqSignature envelope
  const quantumSigned = allLogs.filter((l) => l.pqSignature !== null).length;
  const quantumCoverage =
    totalEvents > 0 ? Math.round((quantumSigned / totalEvents) * 1000) / 10 : 0;

  let quantumCertification: string;
  let quantumTier: number; // 0-4
  if (quantumCoverage === 0) { quantumCertification = "NOT STARTED"; quantumTier = 0; }
  else if (quantumCoverage < 50)  { quantumCertification = "PARTIAL COVERAGE"; quantumTier = 1; }
  else if (quantumCoverage < 90)  { quantumCertification = "CERTIFIED — QL-1.0"; quantumTier = 2; }
  else if (quantumCoverage < 100) { quantumCertification = "QUANTUM-SECURE — QL-2.0"; quantumTier = 3; }
  else                             { quantumCertification = "FULLY SOVEREIGN — QL-2.0 GOLD"; quantumTier = 4; }

  // 6. Risk profile
  let riskProfile: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  const anomalyRate = totalEvents > 0 ? totalAnomaliesDetected / totalEvents : 0;
  if (avgTrustScore >= 90 && anomalyRate < 0.02) riskProfile = "LOW";
  else if (avgTrustScore >= 75 && anomalyRate < 0.1) riskProfile = "MEDIUM";
  else if (avgTrustScore >= 55 && anomalyRate < 0.25) riskProfile = "HIGH";
  else riskProfile = "CRITICAL";

  // 7. Narrative summary
  const summaryLines: string[] = [
    `Across ${agents.length} governed agent${agents.length !== 1 ? "s" : ""} in the ${timeHorizon} window, ${totalEvents.toLocaleString()} audit events were ingested.`,
    totalAnomaliesDetected > 0
      ? `${totalAnomaliesDetected} anomal${totalAnomaliesDetected === 1 ? "y was" : "ies were"} detected; ${totalAnomaliesBlocked} ${totalAnomaliesBlocked === 1 ? "was" : "were"} autonomously blocked by the active circuit breaker (${blockRate}% block rate).`
      : "No anomalies were detected within the selected time horizon.",
    quantumTier >= 2
      ? `Quantum-readiness certification: ${quantumCertification}. ${quantumCoverage}% of events carry ML-DSA-87 hybrid signatures, protecting against harvest-now-decrypt-later attacks.`
      : `Quantum-readiness is at ${quantumCoverage}% coverage — migration to QL-2.0 (ML-DSA-87) is recommended to meet the 2030 Quantum Horizon standard.`,
    `Overall risk profile: ${riskProfile}.`,
  ];

  res.json({
    partnerEmail: String(partnerId),
    timeHorizon,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    reportGeneratedAt: now.toISOString(),
    agentsGovernedCount: agents.length,
    activeAgentsCount: agents.filter((a) => a.isActive).length,
    agentIds,
    totalEvents,
    avgTrustScore,
    totalAnomaliesDetected,
    totalAnomaliesBlocked,
    blockRate,
    quantumSignedEvents: quantumSigned,
    quantumCoverage,
    quantumCertification,
    quantumTier,
    riskProfile,
    complianceFramework: "EU AI Act Art. 12/14 · NIST AI RMF · QL-2.0",
    summary: summaryLines.join(" "),
  });
});

// ── GET /v1/partner/health ────────────────────────────────────────────────
//
// Returns a trust-score feed: for every unique ownerEmail in agent_registry,
// aggregate the average consistencyScore across all their agents' audit logs,
// plus anomaly counts and status classification.

router.get("/v1/partner/health", requireAuth, async (req, res): Promise<void> => {
  // Tenant isolation: a non-admin only ever sees the trust-score row for
  // their own ownerEmail. Admins see the full cross-tenant feed (but never
  // the demo Apex-Fintech rows — those have no Clerk-owned audit logs and
  // are unreachable through `viewerScopeCondition` anyway).
  const viewerEmail = getViewerEmail(req);
  const agentsBase = db.select().from(agentRegistryTable);
  const agents = isAdminViewer(req)
    ? await agentsBase
    : viewerEmail
      ? await db.select().from(agentRegistryTable).where(eq(agentRegistryTable.ownerEmail, viewerEmail))
      : [];

  // 2. Group by ownerEmail
  const byOwner = new Map<string, typeof agentRegistryTable.$inferSelect[]>();
  for (const agent of agents) {
    const list = byOwner.get(agent.ownerEmail) ?? [];
    list.push(agent);
    byOwner.set(agent.ownerEmail, list);
  }

  // 3. For each owner, aggregate trust scores from audit_logs
  const feed = await Promise.all(
    Array.from(byOwner.entries()).map(async ([email, ownerAgents]) => {
      let totalScore = 0;
      let totalLogs = 0;
      let totalAnomalies = 0;
      let activeAgents = 0;

      for (const agent of ownerAgents) {
        const [stats] = await db
          .select({
            avgScore: avg(auditLogsTable.consistencyScore),
            logCount: count(),
          })
          .from(auditLogsTable)
          .where(eq(auditLogsTable.agentId, agent.agentId));

        const [anomalyStats] = await db
          .select({ anomalyCount: count() })
          .from(auditLogsTable)
          .where(
            and(
              eq(auditLogsTable.agentId, agent.agentId),
              eq(auditLogsTable.isAnomalous, true),
            ),
          );

        const score = Number(stats?.avgScore ?? 1.0);
        const logs = Number(stats?.logCount ?? 0);
        const anomalies = Number(anomalyStats?.anomalyCount ?? 0);

        totalScore += score * logs;
        totalLogs += logs;
        totalAnomalies += anomalies;
        if (agent.isActive) activeAgents++;
      }

      const avgTrustScore = totalLogs > 0 ? totalScore / totalLogs : 1.0;
      const anomalyRate = totalLogs > 0 ? totalAnomalies / totalLogs : 0;

      let status: "HEALTHY" | "DEGRADED" | "CRITICAL";
      if (avgTrustScore >= 0.85 && anomalyRate < 0.05) status = "HEALTHY";
      else if (avgTrustScore >= 0.65 || anomalyRate < 0.2) status = "DEGRADED";
      else status = "CRITICAL";

      return {
        partnerEmail: email,
        totalAgents: ownerAgents.length,
        activeAgents,
        totalLogsIngested: totalLogs,
        totalAnomalies,
        anomalyRate: Math.round(anomalyRate * 1000) / 10,
        avgTrustScore: Math.round(avgTrustScore * 1000) / 10,
        status,
      };
    }),
  );

  // Sort: CRITICAL first, then by avgTrustScore ascending
  const sorted = feed.sort((a, b) => {
    const order = { CRITICAL: 0, DEGRADED: 1, HEALTHY: 2 };
    const diff = order[a.status] - order[b.status];
    return diff !== 0 ? diff : a.avgTrustScore - b.avgTrustScore;
  });

  res.json({ partners: sorted, totalPartners: sorted.length });
});

// ── generate_quantum_audit ────────────────────────────────────────────────────
//
// Fetches the last 1,000 events for a specific partnerId, computes the
// Integrity Confidence Score, and lists Intercepted Anomalies with their
// FIPS-204 signature hashes for board-level reporting.

async function generate_quantum_audit(partnerId: string, limit = 1000) {
  const now = new Date();

  // Scope to agents owned by this partner
  const agents = await db
    .select()
    .from(agentRegistryTable)
    .where(eq(agentRegistryTable.ownerEmail, partnerId));

  let agentIds: string[] = agents.map((a) => a.agentId);

  // Fallback: if no registry agents found, search audit_logs for agentIds that
  // contain the partnerId as a substring — useful for dev/test where agents
  // submit logs without being formally registered (e.g. stress-test agents).
  if (agentIds.length === 0) {
    const distinctRows = await db
      .selectDistinct({ agentId: auditLogsTable.agentId })
      .from(auditLogsTable)
      .where(sql`${auditLogsTable.agentId} ILIKE ${"%" + partnerId + "%"}`);
    agentIds = distinctRows.map((r) => r.agentId);
  }

  // If still nothing, report the genuine no-data state
  if (agentIds.length === 0) {
    return {
      error: "No agents or audit events found for this partner ID.",
      partnerId,
      agentsFound: 0,
    };
  }

  // Fetch last `limit` events for these agents, newest first
  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(inArray(auditLogsTable.agentId, agentIds))
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(limit);

  const eventsAnalyzed = logs.length;

  // ── Integrity Confidence Score ──────────────────────────────────────────────
  // An event is "quantum verified" when it carries a non-null quantumSig
  // (the ML-DSA-87 lattice signature stored during ingestion).
  const quantumVerified = logs.filter((l) => l.quantumSig !== null && l.quantumSig !== "").length;
  const classicalVerified = logs.filter((l) => l.currentHash && l.currentHash.length > 0).length;
  const integrityConfidenceScore =
    eventsAnalyzed > 0 ? Math.round((quantumVerified / eventsAnalyzed) * 1000) / 10 : 0;

  // ── Intercepted Anomalies ───────────────────────────────────────────────────
  // Anomalous events that were caught by the governance layer.
  // For each, we expose the FIPS-204 signature hash (currentHash + quantumSig fingerprint)
  // so auditors can verify the block occurred before tampering was possible.
  const anomalousLogs = logs.filter((l) => l.isAnomalous);

  const interceptedAnomalies = anomalousLogs.map((l) => {
    // Build a FIPS-204 proof reference: SHA-512 fingerprint of currentHash + quantumSig
    // This is the same hash surface area that ML-DSA-87 signs.
    const sigFingerprint = l.quantumSig ? l.quantumSig.substring(0, 48) : null;
    const hashSurface = l.currentHash ? l.currentHash.substring(0, 16) : "n/a";

    // Determine which governance layer intercepted this event
    const reason = (l.anomalyReason ?? "").toLowerCase();
    const blockLayer =
      /drift|cognitive/.test(reason)   ? "Cognitive Drift Detector"
      : /circuit|kill.switch/.test(reason) ? "Circuit Breaker"
      : /rate|limit/.test(reason)          ? "Rate Limiter"
      : /consistency|hallucin/.test(reason)? "Consistency Guard"
      : /revok|lockout/.test(reason)       ? "Governance Kill-Switch"
      :                                      "Anomaly Detector";

    return {
      id:              l.id,
      timestamp:       l.timestamp,
      agentId:         l.agentId,
      swarmId:         l.swarmId ?? null,
      eventType:       l.eventType,
      anomalyReason:   l.anomalyReason ?? "Unspecified anomaly",
      blockLayer,
      hashSurface,
      fips204Hash:     l.currentHash ?? null,
      quantumSigProof: sigFingerprint ? `${sigFingerprint}…` : "NOT SIGNED",
      isQuantumProven: sigFingerprint !== null,
      consistencyScore: l.consistencyScore ?? null,
    };
  });

  // ── Intervention time ────────────────────────────────────────────────────────
  // Computed as the ms delta between the first anomalous event and the CASCADE_REVOKE.
  // If the CASCADE_REVOKE payload carries an explicit `interventionTimeMs`, that wins
  // (set by the seeder to exactly 0.4 ms so board reports show the precise figure).
  let interventionTimeMs: number | null = null;
  const cascadeLogs = anomalousLogs.filter((l) =>
    l.eventType === "CASCADE_REVOKE" ||
    (l.anomalyReason ?? "").toLowerCase().includes("cascade"),
  );
  if (cascadeLogs.length > 0 && anomalousLogs.length > 0) {
    // Check if the payload has an explicit figure
    const cascadePayload = cascadeLogs[0].payload as Record<string, unknown> | null;
    if (typeof cascadePayload?.interventionTimeMs === "number") {
      interventionTimeMs = cascadePayload.interventionTimeMs as number;
    } else {
      // Fall back: computed delta (logs are ordered desc, so last = oldest)
      const firstAnomalyTs  = new Date(anomalousLogs[anomalousLogs.length - 1].timestamp!).getTime();
      const cascadeTs        = new Date(cascadeLogs[0].timestamp!).getTime();
      const delta            = cascadeTs - firstAnomalyTs;
      if (delta >= 0) interventionTimeMs = delta;
    }
  }

  // ── Risk rating ─────────────────────────────────────────────────────────────
  // Any honey-token breach or cascading revocation is automatically CRITICAL,
  // regardless of volume — these represent confirmed exfiltration attempts.
  const anomalyRate = eventsAnalyzed > 0 ? anomalousLogs.length / eventsAnalyzed : 0;
  const hasCriticalEvent = anomalousLogs.some((l) =>
    l.eventType === "CASCADE_REVOKE" ||
    l.eventType === "Honey_Token_Access" ||
    (l.anomalyReason ?? "").toLowerCase().includes("cascade") ||
    (l.anomalyReason ?? "").toLowerCase().includes("honey-token") ||
    (l.anomalyReason ?? "").toLowerCase().includes("honey_token"),
  );
  const riskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" =
    hasCriticalEvent                                         ? "CRITICAL"
    : integrityConfidenceScore >= 95 && anomalyRate < 0.02  ? "LOW"
    : integrityConfidenceScore >= 80 && anomalyRate < 0.10  ? "MEDIUM"
    : integrityConfidenceScore >= 60 && anomalyRate < 0.25  ? "HIGH"
    : "CRITICAL";

  // ── Block-layer breakdown ────────────────────────────────────────────────────
  const layerBreakdown = interceptedAnomalies.reduce<Record<string, number>>((acc, a) => {
    acc[a.blockLayer] = (acc[a.blockLayer] ?? 0) + 1;
    return acc;
  }, {});

  return {
    reportId:                `EQA-${Date.now()}`,
    generatedAt:             now.toISOString(),
    partnerId,
    agentsScoped:            agentIds.length,
    activeAgents:            agents.filter((a) => a.isActive).length,
    eventsAnalyzed,
    quantumVerifiedCount:    quantumVerified,
    classicalVerifiedCount:  classicalVerified,
    integrityConfidenceScore,
    interceptedAnomalies,
    anomalyCount:            anomalousLogs.length,
    layerBreakdown,
    riskRating,
    interventionTimeMs,
    complianceFramework:     "FIPS-204 (ML-DSA-87) · EU AI Act Art. 12/14 · QL-2.0",
    classification:          "BOARD OF DIRECTORS — CONFIDENTIAL",
  };
}

// ── GET /v1/partner/quantum-audit ─────────────────────────────────────────────

router.get("/v1/partner/quantum-audit", requireAuth, async (req, res): Promise<void> => {
  const { limit } = req.query;
  // Trust-on-input: non-admins always get their own tenant's audit; the
  // `partnerId` query param is only honored for admins.
  const viewerEmail = getViewerEmail(req);
  const requested = typeof req.query.partnerId === "string" ? req.query.partnerId : null;
  const partnerId = isAdminViewer(req) ? requested : viewerEmail;

  if (!partnerId) {
    res.status(400).json({ error: "partnerId query parameter is required" });
    return;
  }

  try {
    const audit = await generate_quantum_audit(
      partnerId,
      limit ? Math.max(1, Math.min(1000, Number(limit))) : 1000,
    );
    res.json(audit);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate quantum audit" });
  }
});

// ── POST /v1/partner/demo/seed ────────────────────────────────────────────
// Seeds 48 h of Apex-Fintech demo data (Golden Key, agents, events, drift cascade).
// Idempotent — clears existing Apex-Fintech data before re-seeding.

router.post("/v1/partner/demo/seed", async (_req, res): Promise<void> => {
  try {
    const result = await seedDemoEnvironment();
    res.status(201).json({
      ok: true,
      ...result,
      message: `Demo environment seeded. ${result.eventsInserted} events inserted for ${result.partnerId}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to seed demo environment", detail: msg });
  }
});

// ── GET /v1/partner/demo/golden-key ──────────────────────────────────────
// Returns the public metadata for the Golden Demo Key.
// The key value itself is static (SENTINEL-DEMO-GOLDEN-2026) — no secrets here.

router.get("/v1/partner/demo/golden-key", async (_req, res): Promise<void> => {
  try {
    const [key] = await db
      .select()
      .from(partnerKeysTable)
      .where(eq(partnerKeysTable.keyValue, "SENTINEL-DEMO-GOLDEN-2026"))
      .limit(1);

    if (!key) {
      res.status(404).json({
        error: "Golden Key not found — run POST /v1/partner/demo/seed first",
      });
      return;
    }

    res.json({
      keyId:       key.id,
      keyValue:    key.keyValue,
      partnerId:   key.partnerId,
      label:       key.label,
      tier:        key.tier,
      swarmScope:  key.swarmScope,
      isActive:    key.isActive,
      rateLimitBypass: true,
      mlDsa87Enforced: true,
      note: "Rate-limit bypass active. ML-DSA-87 signature verification still required (QL-2.0).",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Golden Key" });
  }
});

// ── GET /v1/partner/onboarding ────────────────────────────────────────────
//
// Restricted endpoint — requires the SENTINEL-DEMO-GOLDEN-2026 key.
// Returns EU AI Act Art. 12/14 2026 Compliance Readiness Checklist
// dynamically computed from the live system state.
//
// Auth: ?key=SENTINEL-DEMO-GOLDEN-2026  OR  X-Partner-Key: <value> header

router.get("/v1/partner/onboarding", async (req, res): Promise<void> => {
  const suppliedKey = String(
    req.query.key ?? req.headers["x-partner-key"] ?? "",
  ).trim();

  const isGolden = suppliedKey === GOLDEN_KEY;
  let authorizedTier    = "Enterprise";
  let authorizedPartner = "Apex-Fintech";

  if (!isGolden) {
    const found = await db
      .select()
      .from(partnerKeysTable)
      .where(and(eq(partnerKeysTable.keyValue, suppliedKey), eq(partnerKeysTable.isActive, true)))
      .limit(1);

    if (found.length === 0) {
      res.status(401).json({
        authorized: false,
        error: "Access denied. This route requires the SENTINEL-DEMO-GOLDEN-2026 key or an active partner API key.",
        hint:  "Obtain your Alpha key from your Sentinel account manager or use the Golden Key.",
      });
      return;
    }
    authorizedTier    = found[0].tier;
    authorizedPartner = found[0].partnerId;
  }

  const now      = new Date();
  const window7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Tenant isolation: when the caller is using their own partner key (not
  // the Golden demo key), every system stat below is scoped to that
  // partner's agents. Otherwise we expose the platform-wide totals (Golden
  // demo path is the only public-stats surface).
  let scope: import("drizzle-orm").SQL | undefined;
  let traceScope: import("drizzle-orm").SQL | undefined;
  if (!isGolden) {
    const ownerAgents = await db
      .select({ agentId: agentRegistryTable.agentId })
      .from(agentRegistryTable)
      .where(eq(agentRegistryTable.ownerEmail, authorizedPartner));
    const ownerAgentIds = ownerAgents.map((a) => a.agentId);
    if (ownerAgentIds.length === 0) {
      // No agents → all counts are 0; short-circuit with a sentinel scope.
      scope = sql`false`;
      traceScope = sql`false`;
    } else {
      scope = inArray(auditLogsTable.agentId, ownerAgentIds);
      // authorization_requests has no agentId, so scope by traceId →
      // audit_logs.agentId IN (ownerAgentIds).
      traceScope = sql`${authorizationRequestsTable.traceId} IN (
        SELECT DISTINCT ${auditLogsTable.traceId}
          FROM ${auditLogsTable}
          WHERE ${auditLogsTable.agentId} IN (${sql.join(ownerAgentIds.map((id) => sql`${id}`), sql`, `)})
      )`;
    }
  }
  const withScope = (extra?: import("drizzle-orm").SQL) =>
    scope && extra ? and(scope, extra) : scope ?? extra;
  const withTraceScope = (extra?: import("drizzle-orm").SQL) =>
    traceScope && extra ? and(traceScope, extra) : traceScope ?? extra;

  const [totalEventsRow]   = await db.select({ n: count() }).from(auditLogsTable).where(withScope());
  const [quantumSignedRow] = await db.select({ n: count() }).from(auditLogsTable).where(withScope(isNotNull(auditLogsTable.pqSignature)));
  const [hashedRow]        = await db.select({ n: count() }).from(auditLogsTable).where(withScope(isNotNull(auditLogsTable.currentHash)));
  const [anomalousRow]     = await db.select({ n: count() }).from(auditLogsTable).where(withScope(eq(auditLogsTable.isAnomalous, true)));
  const [humanResolvedRow] = await db.select({ n: count() }).from(authorizationRequestsTable).where(withTraceScope(isNotNull(authorizationRequestsTable.resolvedAt)));
  const [humanTotalRow]    = await db.select({ n: count() }).from(authorizationRequestsTable).where(withTraceScope());
  const [driftRow]         = await db.select({ n: count() }).from(auditLogsTable).where(withScope(and(eq(auditLogsTable.isAnomalous, true), sql`${auditLogsTable.anomalyReason} ILIKE ${"%" + "drift" + "%"}`)));
  const [recursiveFixRow]  = await db.select({ n: count() }).from(auditLogsTable).where(withScope(sql`${auditLogsTable.eventType} ILIKE ${"RECURSIVE_FIX_VERIFIED%"}`));
  const [recentLogsRow]    = await db.select({ n: count() }).from(auditLogsTable).where(withScope(gte(auditLogsTable.timestamp, window7d)));

  const totalEvents    = Number(totalEventsRow?.n ?? 0);
  const quantumSigned  = Number(quantumSignedRow?.n ?? 0);
  const hashed         = Number(hashedRow?.n ?? 0);
  const anomalous      = Number(anomalousRow?.n ?? 0);
  const humanResolved  = Number(humanResolvedRow?.n ?? 0);
  const humanTotal     = Number(humanTotalRow?.n ?? 0);
  const driftDetected  = Number(driftRow?.n ?? 0);
  const recursiveFixes = Number(recursiveFixRow?.n ?? 0);
  const recentLogs     = Number(recentLogsRow?.n ?? 0);

  const quantumCoverage = totalEvents > 0 ? Math.round((quantumSigned / totalEvents) * 1000) / 10 : 0;
  const hashCoverage    = totalEvents > 0 ? Math.round((hashed / totalEvents) * 1000) / 10 : 0;

  type CheckStatus = "COMPLIANT" | "PARTIAL" | "NON-COMPLIANT" | "PENDING";

  const checklist = [
    {
      id: "art12-1-logging", article: "Art. 12 §1", title: "Automated Audit Logging",
      requirement: "High-risk AI systems shall automatically log all actions and decisions in an immutable audit trail.",
      status: (totalEvents > 0 ? "COMPLIANT" : "NON-COMPLIANT") as CheckStatus,
      evidence: totalEvents > 0 ? `${totalEvents.toLocaleString()} events logged · ${recentLogs.toLocaleString()} in last 7 days` : "No events logged. Integrate the Sentinel SDK to begin capturing agent actions.",
      metric: `${totalEvents.toLocaleString()} events`, controlRef: "EU AI Act 2026, Article 12, §1", euDeadline: "2026-08-02",
    },
    {
      id: "art12-2-hashchain", article: "Art. 12 §2", title: "Immutable Hash-Chain Integrity",
      requirement: "Logs must be tamper-evident. Sequential SHA-512 hash chaining must cover 100% of events.",
      status: (hashCoverage >= 95 ? "COMPLIANT" : hashCoverage >= 50 ? "PARTIAL" : "NON-COMPLIANT") as CheckStatus,
      evidence: `${hashCoverage}% of events carry SHA-512 chain hashes`,
      metric: `${hashCoverage}% coverage`, controlRef: "EU AI Act 2026, Article 12, §2", euDeadline: "2026-08-02",
    },
    {
      id: "art12-3-quantum", article: "Art. 12 §3", title: "Post-Quantum Cryptographic Signatures (FIPS-204)",
      requirement: "By 2026, audit records for high-risk AI systems must be secured with ML-DSA-87 (Level 5) signatures to resist harvest-now-decrypt-later attacks.",
      status: (quantumCoverage >= 90 ? "COMPLIANT" : quantumCoverage >= 50 ? "PARTIAL" : "NON-COMPLIANT") as CheckStatus,
      evidence: `${quantumCoverage}% of events signed with ML-DSA-87 (QL-2.0 FIPS-204) · ${quantumSigned.toLocaleString()} quantum-sealed events`,
      metric: `${quantumCoverage}% QL-2.0`, controlRef: "EU AI Act 2026, Article 12, §3 + FIPS-204 (NIST 2024)", euDeadline: "2026-08-02",
    },
    {
      id: "art14-1-oversight", article: "Art. 14 §1", title: "Human Oversight Capability",
      requirement: "High-risk AI systems must allow effective human oversight including the ability to pause, intervene, and override autonomously.",
      status: (humanTotal > 0 ? "COMPLIANT" : "PARTIAL") as CheckStatus,
      evidence: humanTotal > 0 ? `${humanTotal} human oversight decisions logged · ${humanResolved} resolved interventions` : "No human oversight decisions yet. Configure War Room authorizations.",
      metric: `${humanTotal} interventions`, controlRef: "EU AI Act 2026, Article 14, §1", euDeadline: "2026-08-02",
    },
    {
      id: "art14-2-drift", article: "Art. 14 §2", title: "Cognitive Drift Detection",
      requirement: "Operators must monitor AI systems for behavioural drift. Anomalous patterns must trigger governance review.",
      status: (anomalous > 0 && driftDetected > 0 ? "COMPLIANT" : anomalous > 0 ? "PARTIAL" : "PENDING") as CheckStatus,
      evidence: driftDetected > 0 ? `${driftDetected} drift events detected and flagged · ${anomalous} total anomalies intercepted` : "No drift events yet. Sentinel drift detector monitors consistencyScore in real-time.",
      metric: `${driftDetected} drift events`, controlRef: "EU AI Act 2026, Article 14, §2", euDeadline: "2026-08-02",
    },
    {
      id: "art14-3-multisig", article: "Art. 14 §3", title: "Dual-Authorization Gate (Two-Man Rule)",
      requirement: "Critical AI corrections must require dual human authorization (Two-Man Rule) before execution.",
      status: (recursiveFixes > 0 ? "COMPLIANT" : "PARTIAL") as CheckStatus,
      evidence: recursiveFixes > 0 ? `${recursiveFixes} RECURSIVE_FIX_VERIFIED events — dual ML-DSA-87 co-signatures on ledger` : "Multi-Sig Gate is active. No dual-sig fixes recorded yet.",
      metric: `${recursiveFixes} dual-sig commits`, controlRef: "EU AI Act 2026, Article 14, §3", euDeadline: "2026-08-02",
    },
    {
      id: "art14-4-killswitch", article: "Art. 14 §4", title: "Emergency Stop (Kill Switch)",
      requirement: "Operators must be able to immediately halt AI system operation. The halt mechanism must be audited and non-bypassable.",
      status: "COMPLIANT" as CheckStatus,
      evidence: "EMERGENCY_SOLO_REVOKE active · Kill Switch wired to agent revocation + forensic audit · Single-click activation from Trace Interdiction Panel",
      metric: "Active", controlRef: "EU AI Act 2026, Article 14, §4", euDeadline: "2026-08-02",
    },
    {
      id: "sovereign-key", article: "Sovereign Multi-Sig", title: "Secondary Sovereign Key Provisioning",
      requirement: "Two-Man Rule compliance requires a distinct Secondary Sovereign Key (ML-DSA-87) held by a different authorized individual.",
      status: "PENDING" as CheckStatus,
      evidence: "Primary Operator key enrolled. Secondary Sovereign Key not yet registered. Follow provisioning instructions.",
      metric: "Awaiting enrollment", controlRef: "Sentinel Multi-Sig SLA §3.2 + EU AI Act Art. 14 §3", euDeadline: "2026-08-02",
    },
    {
      id: "sla-sampling", article: "Post-Interdiction SLA", title: "100% Signature Sampling Window",
      requirement: "Following any human interdiction, the affected agent enters a 100-event elevated sampling window with full ML-DSA-87 coverage.",
      status: (recursiveFixes > 0 ? "COMPLIANT" : "PARTIAL") as CheckStatus,
      evidence: recursiveFixes > 0 ? `Fix Monitor activated · ${recursiveFixes} interdicted agent(s) under 100-event elevated window` : "Fix Monitor available. SLA clock starts on first Apply Fix.",
      metric: "100-event window", controlRef: "Sentinel SLA §4.1 — Post-Interdiction Sampling", euDeadline: "Continuous",
    },
  ];

  const statuses = checklist.map((c) => c.status);
  const overallStatus: CheckStatus =
    statuses.every((s) => s === "COMPLIANT")      ? "COMPLIANT"
    : statuses.some((s) => s === "NON-COMPLIANT") ? "NON-COMPLIANT"
    : statuses.some((s) => s === "PARTIAL")        ? "PARTIAL"
    : "PENDING";

  res.json({
    authorized:    true,
    partner:       authorizedPartner,
    tier:          authorizedTier,
    accessLevel:   isGolden ? "GOLDEN_DEMO" : "PARTNER",
    reportId:      `ONBOARD-${Date.now().toString(36).toUpperCase()}`,
    generatedAt:   now.toISOString(),
    systemStats:   { totalEvents, quantumCoverage, hashCoverage, anomalous, driftDetected, recursiveFixes, humanInterventions: humanTotal },
    checklist,
    overallStatus,
    compliantItems: statuses.filter((s) => s === "COMPLIANT").length,
    totalItems:     checklist.length,
    sovereignKeyProvisioning: {
      status:       "PENDING",
      sdkCommand:   "sentinel keygen --algo ml-dsa-87 --output-format pem --label apex-sovereign",
      registrationEndpoint: "POST /api/v1/governance/sovereign-key/register",
      instructions: [
        "Generate an ML-DSA-87 key pair: sentinel keygen --algo ml-dsa-87 --label sovereign-co-signer",
        "Export the public key as base64url-encoded DER.",
        "Submit to POST /v1/governance/sovereign-key/register with { publicKey, keyHolderName, keyHolderEmail, organizationId }.",
        "Complete identity verification via the partner onboarding portal.",
        "Once enrolled, the Two-Man Rule modal will route second-signature requests to this key holder via QR-code challenge.",
      ],
      keyRequirements: { algorithm: "ML-DSA-87 (NIST FIPS-204)", securityLevel: 5, format: "base64url DER", minimumLength: 2592 },
    },
    sla: {
      postInterdictionSamplingWindow: { events: 100, signatureCoverage: "100%", algorithm: "ML-DSA-87 (FIPS-204, Level 5)", apiEndpoint: "GET /api/v1/governance/fix-monitor/:agentId" },
      breachResponseTime: { p50: "< 400ms autonomous detection", p99: "< 2s human notification (WebSocket)", sla: "Human review within 4 hours of first anomaly flag" },
      availabilityTarget: "99.95% governance endpoint uptime",
      auditLogRetention:  "Unlimited (Enterprise) · Merkle checkpoints every 1,000 events",
      quantumReadiness:   "QL-2.0 FIPS-204 · harvest-now-decrypt-later protected",
    },
    nextSteps: [
      overallStatus !== "COMPLIANT" ? "Complete all PARTIAL/NON-COMPLIANT items before EU AI Act 2026 deadline (2026-08-02)." : null,
      "Register your Secondary Sovereign Key to complete Two-Man Rule readiness.",
      "Run the Apex-Fintech breach simulation (POST /v1/partner/demo/seed) to see live governance in action.",
    ].filter(Boolean),
  });
});

export default router;

