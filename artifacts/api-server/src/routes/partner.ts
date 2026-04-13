/**
 * Governance-as-a-Service (GaaS) Partner Routes
 *
 * GET  /v1/partner/whitepaper        — Download WHITE_PAPER.md as a file
 * POST /v1/partner/keys              — Generate a new scoped API key
 * GET  /v1/partner/keys              — List all keys (optionally filter by partnerId)
 * PATCH /v1/partner/keys/:keyId/revoke — Revoke a key
 * GET  /v1/partner/health            — Aggregate trust-score feed per partner
 */

import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import { db, partnerKeysTable, agentRegistryTable, auditLogsTable } from "@workspace/db";
import { eq, desc, avg, count, and, inArray, gte, lte } from "drizzle-orm";

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

router.post("/v1/partner/keys", async (req, res): Promise<void> => {
  const { partnerId, partnerEmail, label, tier, swarmScope } = req.body ?? {};

  if (!partnerId || !partnerEmail) {
    res.status(400).json({ error: "partnerId and partnerEmail are required" });
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

router.get("/v1/partner/keys", async (req, res): Promise<void> => {
  const { partnerId } = req.query;

  const rows = partnerId
    ? await db.select().from(partnerKeysTable).where(eq(partnerKeysTable.partnerId, String(partnerId))).orderBy(desc(partnerKeysTable.createdAt))
    : await db.select().from(partnerKeysTable).orderBy(desc(partnerKeysTable.createdAt));

  // Mask the key value — return only first 20 chars + ****
  const masked = rows.map((k) => ({
    ...k,
    keyValue: `${k.keyValue.substring(0, 20)}****`,
  }));

  res.json({ keys: masked, total: masked.length });
});

// ── PATCH /v1/partner/keys/:keyId/revoke ──────────────────────────────────

router.patch("/v1/partner/keys/:keyId/revoke", async (req, res): Promise<void> => {
  const { keyId } = req.params;

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

// ── GET /v1/compliance/audit-report ──────────────────────────────────────
//
// Professional Audit Report: partner-scoped, time-windowed executive summary.
// Aggregates trust score, anomaly disposition (detected vs blocked), and
// quantum-readiness certification score across all partner swarms.

router.get("/v1/compliance/audit-report", async (req, res): Promise<void> => {
  const { partnerId, timeHorizon = "30d" } = req.query;

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

  // 2. Pull all audit logs for these agents in the time window
  const allLogs = await db
    .select()
    .from(auditLogsTable)
    .where(
      and(
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

router.get("/v1/partner/health", async (_req, res): Promise<void> => {
  // 1. Get all registered agents
  const agents = await db.select().from(agentRegistryTable);

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

export default router;
