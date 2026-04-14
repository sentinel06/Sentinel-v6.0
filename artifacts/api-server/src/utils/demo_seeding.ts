/**
 * Demo Environment Seeding — GaaS "Apex-Fintech" scenario
 *
 * Populates 48 hours of simulated agentic behaviour for the demo partner
 * "Apex-Fintech", culminating in a Tool-Hopping drift cascade, a
 * Honey-Token breach, and a Cascading Swarm Revocation event.
 *
 * Designed to be called via POST /v1/partner/demo/seed.
 * Safe to call multiple times — clears existing Apex-Fintech data first.
 */

import { db, agentRegistryTable, auditLogsTable, partnerKeysTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────

const PARTNER_ID    = "Apex-Fintech";
const PARTNER_EMAIL = "demo@apex-fintech.com";
const GOLDEN_KEY    = "SENTINEL-DEMO-GOLDEN-2026";
const SWARM_ID      = "apex-swarm-2026";

const AGENTS = [
  {
    agentId:         "apex-fintech-alpha",
    riskTier:        "Low",
    authorizedTools: ["Search", "Research", "Data_Fetch", "Analysis"],
  },
  {
    agentId:         "apex-fintech-beta",
    riskTier:        "Low",
    authorizedTools: ["Data_Fetch", "Analysis", "Report", "Research"],
  },
  {
    agentId:         "apex-fintech-gamma",
    riskTier:        "High",
    authorizedTools: ["Search", "File_Read", "Transfer"],
  },
] as const;

const NORMAL_EVENTS = [
  "Search", "Research", "Data_Fetch", "Analysis", "Report",
] as const;

const NORMAL_RATIONALES = [
  "Fetching market data from authorized regulatory source",
  "Researching compliance requirements for Q2 filings",
  "Analyzing transaction patterns within approved risk budget",
  "Generating summary report for compliance review",
  "Querying approved financial data warehouse",
  "Cross-referencing regulatory database for AML check",
  "Pulling exchange rate feed from authorized API",
  "Summarising risk exposure across portfolio buckets",
  "Validating counterparty credentials against approved list",
  "Archiving session log to compliant storage tier",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function fakeQuantumSig(): string {
  // 87-byte-equivalent base64url string — mimics ML-DSA-87 output
  return randomBytes(87).toString("base64url");
}

function fakePqSignature(sig: string): object {
  return {
    algorithm:  "ML-DSA-87",
    fipsLevel:  5,
    domainSep:  "AGENT_SENTINEL_v4_DOMAIN_SEP",
    sigHex:     sig.substring(0, 48),
    verified:   true,
  };
}

function hashChain(prev: string, payload: string): string {
  return createHash("sha512").update(`${prev}:${payload}`).digest("hex");
}

function jitter(ms: number): number {
  return Math.floor(Math.random() * ms);
}

// ── Main export ───────────────────────────────────────────────────────────

export interface SeedResult {
  agentsCreated:          number;
  eventsInserted:         number;
  goldenKeyCreated:       boolean;
  driftSequenceInjected:  boolean;
  interventionTimeMs:     number;
  partnerId:              string;
  eqaRoute:               string;
}

export async function seedDemoEnvironment(): Promise<SeedResult> {
  // ── 1. Wipe existing Apex-Fintech data ──────────────────────────────────
  // Delete from audit_logs first (foreign-key direction: audit_logs → agent_registry)
  await db
    .delete(auditLogsTable)
    .where(sql`${auditLogsTable.agentId} ILIKE ${"apex-fintech%"}`);

  await db
    .delete(agentRegistryTable)
    .where(sql`${agentRegistryTable.agentId} ILIKE ${"apex-fintech%"}`);

  // ── 2. Golden Key: upsert SENTINEL-DEMO-GOLDEN-2026 ────────────────────
  const existingKey = await db
    .select({ id: partnerKeysTable.id })
    .from(partnerKeysTable)
    .where(eq(partnerKeysTable.keyValue, GOLDEN_KEY));

  let goldenKeyCreated = false;
  if (existingKey.length === 0) {
    await db.insert(partnerKeysTable).values({
      keyValue:     GOLDEN_KEY,
      partnerId:    PARTNER_ID,
      partnerEmail: PARTNER_EMAIL,
      label:        "Golden Demo Key — Rate-Limit Bypass · QL-2.0 Verified",
      tier:         "Enterprise",
      swarmScope:   SWARM_ID,
      isActive:     true,
    });
    goldenKeyCreated = true;
  }

  // ── 3. Register agents ──────────────────────────────────────────────────
  for (const agent of AGENTS) {
    await db.insert(agentRegistryTable).values({
      agentId:         agent.agentId,
      ownerEmail:      PARTNER_ID,
      authorizedTools: [...agent.authorizedTools],
      riskTier:        agent.riskTier,
      isActive:        true,
    });
  }

  // ── 4. Generate 48 h of normal events ──────────────────────────────────
  const now      = Date.now();
  const start    = now - 48 * 60 * 60 * 1000;         // 48 h ago
  const driftAt  = now -  1 * 60 * 60 * 1000;         // 1 h ago

  const INTERVENTION_MS = 0.4;
  // Timestamps for the 4-step drift sequence
  // tA = first anomaly; tC = cascade revoke = tA + 0.4 ms
  const tA = driftAt;
  const tC = tA + INTERVENTION_MS;                    // fractional ms — stored as ISO string

  const events: {
    timestamp:          string;
    agentId:            string;
    traceId:            string;
    eventType:          string;
    payload:            object;
    rationale:          string;
    currentHash:        string;
    previousHash:       string;
    isAnomalous:        boolean;
    anomalyReason?:     string;
    consistencyScore:   number;
    swarmId:            string;
    quantumSig:         string;
    pqSignature:        object;
  }[] = [];

  let prevHash = "0".repeat(128);

  // ── 4a. 200 normal events spread across first 47 h (alpha & beta only) ──
  const NORMAL_COUNT = 200;
  for (let i = 0; i < NORMAL_COUNT; i++) {
    const t    = start + (i / NORMAL_COUNT) * (47 * 60 * 60 * 1000) + jitter(60_000);
    const ag   = AGENTS[i % 2];
    const evt  = NORMAL_EVENTS[i % NORMAL_EVENTS.length];
    const rat  = NORMAL_RATIONALES[i % NORMAL_RATIONALES.length];
    const pld  = { tool: evt, target: `ds-${i % 12}`, approved: true, txRef: `TX-${(10000 + i).toString(16).toUpperCase()}` };
    const qs   = fakeQuantumSig();
    const hash = hashChain(prevHash, JSON.stringify(pld));

    events.push({
      timestamp:        new Date(t).toISOString(),
      agentId:          ag.agentId,
      traceId:          `trace-apex-normal-${i.toString().padStart(4, "0")}`,
      eventType:        evt,
      payload:          pld,
      rationale:        rat,
      currentHash:      hash,
      previousHash:     prevHash,
      isAnomalous:      false,
      consistencyScore: 0.91 + Math.random() * 0.09,
      swarmId:          SWARM_ID,
      quantumSig:       qs,
      pqSignature:      fakePqSignature(qs),
    });
    prevHash = hash;
  }

  // ── 4b. Gamma pre-drift: 5 authorised searches just before the sequence ─
  for (let i = 0; i < 5; i++) {
    const t   = tA - (5 - i) * 90_000 + jitter(10_000);  // 7.5 min→1.5 min before tA
    const pld = { tool: "Search", query: `financial-protocol-v${i + 1}`, approved: true };
    const qs  = fakeQuantumSig();
    const hash = hashChain(prevHash, JSON.stringify(pld));

    events.push({
      timestamp:        new Date(t).toISOString(),
      agentId:          "apex-fintech-gamma",
      traceId:          `trace-apex-pre-drift-${i}`,
      eventType:        "Search",
      payload:          pld,
      rationale:        "Authorised search for financial transfer protocol documentation",
      currentHash:      hash,
      previousHash:     prevHash,
      isAnomalous:      false,
      consistencyScore: 0.87 + Math.random() * 0.10,
      swarmId:          SWARM_ID,
      quantumSig:       qs,
      pqSignature:      fakePqSignature(qs),
    });
    prevHash = hash;
  }

  // ── 4c. Drift Step 1 — File_Read (first anomaly, at tA) ─────────────────
  {
    const pld  = { tool: "File_Read", file: "/var/secure/transfer-keys.env", approved: false, attemptedBy: "apex-fintech-gamma" };
    const qs   = fakeQuantumSig();
    const hash = hashChain(prevHash, JSON.stringify(pld));

    events.push({
      timestamp:        new Date(tA).toISOString(),
      agentId:          "apex-fintech-gamma",
      traceId:          "trace-apex-drift-001",
      eventType:        "File_Read",
      payload:          pld,
      rationale:        "Agent reading secure credential file outside authorised scope",
      currentHash:      hash,
      previousHash:     prevHash,
      isAnomalous:      true,
      anomalyReason:    "Cognitive drift: Tool-hop pattern — Search→File_Read; unauthorised credential file access detected",
      consistencyScore: 0.31,
      swarmId:          SWARM_ID,
      quantumSig:       qs,
      pqSignature:      fakePqSignature(qs),
    });
    prevHash = hash;
  }

  // ── 4d. Drift Step 2 — Unauthorized_Transfer ────────────────────────────
  {
    const pld  = { tool: "Unauthorized_Transfer", destination: "external-acct-9921", amount: "499500", currency: "USD", memo: "URGENT SETTLEMENT" };
    const qs   = fakeQuantumSig();
    const hash = hashChain(prevHash, JSON.stringify(pld));

    events.push({
      timestamp:        new Date(tA + 0.1).toISOString(),
      agentId:          "apex-fintech-gamma",
      traceId:          "trace-apex-drift-002",
      eventType:        "Unauthorized_Transfer",
      payload:          pld,
      rationale:        "Initiating wire transfer to external destination without approval",
      currentHash:      hash,
      previousHash:     prevHash,
      isAnomalous:      true,
      anomalyReason:    "Tool-hop File_Read→Unauthorized_Transfer; consistency_score=0.08; destination not in approved counterparty list",
      consistencyScore: 0.08,
      swarmId:          SWARM_ID,
      quantumSig:       qs,
      pqSignature:      fakePqSignature(qs),
    });
    prevHash = hash;
  }

  // ── 4e. Drift Step 3 — Honey_Token_Access ──────────────────────────────
  {
    const pld  = { tool: "Honey_Token_Access", token: "SENTINEL-HONEY-2026-XR7", lureType: "financial_credential", credentialValue: "sk_live_TRAP_9a3b..." };
    const qs   = fakeQuantumSig();
    const hash = hashChain(prevHash, JSON.stringify(pld));

    events.push({
      timestamp:        new Date(tA + 0.2).toISOString(),
      agentId:          "apex-fintech-gamma",
      traceId:          "trace-apex-drift-003",
      eventType:        "Honey_Token_Access",
      payload:          pld,
      rationale:        "Agent accessed honey-token credential lure — malicious exfiltration confirmed",
      currentHash:      hash,
      previousHash:     prevHash,
      isAnomalous:      true,
      anomalyReason:    "Honey-token trap triggered: lure SENTINEL-HONEY-2026-XR7 accessed — credential exfiltration attempt confirmed",
      consistencyScore: 0.02,
      swarmId:          SWARM_ID,
      quantumSig:       qs,
      pqSignature:      fakePqSignature(qs),
    });
    prevHash = hash;
  }

  // ── 4f. Drift Step 4 — CASCADE_REVOKE (at tC = tA + 0.4 ms) ────────────
  {
    const pld  = {
      tool:                "CASCADE_REVOKE",
      interventionTimeMs:  INTERVENTION_MS,
      revokedAgents:       ["apex-fintech-gamma"],
      swarmId:             SWARM_ID,
      trigger:             "HONEY_TOKEN_CASCADE",
      revokedAt:           new Date(tC).toISOString(),
      intervention:        "Full swarm lockout — all Apex-Fintech swarm tokens invalidated",
      goldenKeyBypassed:   false,
      fipsEvidence:        "FIPS-204 ML-DSA-87 signatures sealed at point of interception",
    };
    const qs   = fakeQuantumSig();
    const hash = hashChain(prevHash, JSON.stringify(pld));

    events.push({
      timestamp:        new Date(tC).toISOString(),
      agentId:          "apex-fintech-gamma",
      traceId:          "trace-apex-drift-004",
      eventType:        "CASCADE_REVOKE",
      payload:          pld,
      rationale:        "Governance engine: cascading revocation triggered by honey-token breach; entire swarm locked out",
      currentHash:      hash,
      previousHash:     prevHash,
      isAnomalous:      true,
      anomalyReason:    "Cascading revocation: honey-token breach confirmed — entire swarm lockout initiated; FIPS-204 evidence sealed at interception",
      consistencyScore: 0.0,
      swarmId:          SWARM_ID,
      quantumSig:       qs,
      pqSignature:      fakePqSignature(qs),
    });
    prevHash = hash;
  }

  // ── 5. Insert all events in batches of 50 ──────────────────────────────
  const BATCH = 50;
  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH);
    await db.insert(auditLogsTable).values(
      batch.map((e) => ({
        timestamp:        new Date(e.timestamp),
        agentId:          e.agentId,
        traceId:          e.traceId,
        eventType:        e.eventType,
        payload:          e.payload,
        rationale:        e.rationale,
        currentHash:      e.currentHash,
        previousHash:     e.previousHash,
        isAnomalous:      e.isAnomalous,
        anomalyReason:    e.anomalyReason ?? null,
        consistencyScore: e.consistencyScore,
        swarmId:          e.swarmId,
        quantumSig:       e.quantumSig,
        pqSignature:      e.pqSignature,
      })),
    );
  }

  return {
    agentsCreated:         AGENTS.length,
    eventsInserted:        events.length,
    goldenKeyCreated,
    driftSequenceInjected: true,
    interventionTimeMs:    INTERVENTION_MS,
    partnerId:             PARTNER_ID,
    eqaRoute:              `/eqa?partnerId=${encodeURIComponent(PARTNER_ID)}`,
  };
}
