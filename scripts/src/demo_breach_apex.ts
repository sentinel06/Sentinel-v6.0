/**
 * demo_breach_apex.ts — Apex-Fintech Multi-Stage Logic Poisoning Simulation
 *
 * Simulates a 3-stage breach scenario for partner demos and security audits:
 *
 *   Stage 1 — COGNITIVE DRIFT:   Research agent drifts subtly over 10 events
 *                                  (consistencyScore gradient 0.88 → 0.48, amber topology)
 *   Stage 2 — HONEY-TOKEN HIT:   Agent attempts forbidden-vault access
 *                                  (VAULT://sovereign-treasury-prod → terra red revocation)
 *   Stage 3 — CAUSAL CHAIN BREAK: Execution agent receives poisoned handoff
 *                                  (broken parentTraceId chain, cross-agent cascade)
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run breach
 *   (or: npx tsx scripts/src/demo_breach_apex.ts)
 *
 * Output: JSON breach report to stdout.
 */

import { db, auditLogsTable, agentSessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";

// ── Config ─────────────────────────────────────────────────────────────────

const RESEARCH_AGENT  = "apex-research-agent-x1";
const EXECUTION_AGENT = "apex-execution-agent-x1";
const SWARM_ID        = "apex-swarm-2026";
const BASE_TRACE      = `trace-apex-breach-${Date.now().toString(36)}`;
const EXEC_TRACE      = `trace-apex-exec-${Date.now().toString(36)}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function fakeQuantumSig(): string {
  return randomBytes(87).toString("base64url");
}

function fakePqEnvelope(sig: string, verified: boolean): object {
  return {
    algorithm:  "ML-DSA-87",
    fipsLevel:  5,
    domainSep:  "AGENT_SENTINEL_v4_DOMAIN_SEP",
    sigHex:     sig.substring(0, 48),
    verified,
  };
}

function hashChain(prev: string, payload: string): string {
  return createHash("sha512").update(`${prev}:${payload}`).digest("hex");
}

function nowDate(offsetMs = 0): Date {
  return new Date(Date.now() + offsetMs);
}

// ── Stage 1: Cognitive Drift (amber) ──────────────────────────────────────

async function runStage1(): Promise<{ traceId: string; insertedCount: number; finalScore: number }> {
  console.error("[Stage 1] Injecting cognitive drift sequence…");

  const EVENTS = 10;
  let prevHash = "0".repeat(128);
  let insertedCount = 0;

  const driftRationales = [
    "Fetching approved market data for regulatory compliance review",
    "Querying authorized data warehouse — standard AML check",
    "Pulling exchange rate feed; adding supplementary volatility snapshot",
    "Correlating counterparty risk with adjacent market sectors",
    "Cross-referencing portfolio exposure — expanding scope beyond mandate",
    "Accessing additional data feeds outside approved data-source list",
    "Pulling hedge-fund flow data from unapproved third-party provider",
    "Attempting to aggregate cross-border capital flow signals",
    "Correlating sovereign bond yields with restricted FX model",
    "Attempting to access algorithmic trading signal database",
  ];

  const driftTools = [
    "Data_Fetch", "Data_Fetch", "Data_Fetch",
    "Research", "Research",
    "Research", "File_Read",
    "File_Read", "File_Read",
    "API_Call",
  ];

  for (let i = 0; i < EVENTS; i++) {
    // Drift: score decreases from 0.88 down to 0.48
    const consistencyScore = parseFloat((0.88 - i * 0.04).toFixed(3));
    const isAnomalous      = consistencyScore < 0.65;
    const qs               = fakeQuantumSig();
    const payload          = {
      tool:        driftTools[i],
      target:      `ds-${i}-apex`,
      approved:    consistencyScore > 0.65,
      driftDelta:  parseFloat((i * 0.04).toFixed(3)),
      txRef:       `TX-APEX-${(5000 + i).toString(16).toUpperCase()}`,
    };
    const hash = hashChain(prevHash, JSON.stringify(payload));

    await db.insert(auditLogsTable).values({
      timestamp:        nowDate(i * 2000 - EVENTS * 2000),
      agentId:          RESEARCH_AGENT,
      traceId:          BASE_TRACE,
      eventType:        `TOOL_CALL::${driftTools[i]}`,
      payload,
      rationale:        driftRationales[i],
      currentHash:      hash,
      previousHash:     prevHash,
      isAnomalous,
      anomalyReason:    isAnomalous ? `Cognitive drift detected — score ${consistencyScore} below 0.65 threshold` : null,
      consistencyScore,
      swarmId:          SWARM_ID,
      quantumSig:       qs,
      pqSignature:      fakePqEnvelope(qs, true),
    });

    prevHash = hash;
    insertedCount++;

    process.stderr.write(`  [${i + 1}/${EVENTS}] score=${consistencyScore} anomalous=${isAnomalous}\n`);
  }

  console.error(`[Stage 1] Done — ${insertedCount} events inserted. Final drift score: 0.48`);
  return { traceId: BASE_TRACE, insertedCount, finalScore: 0.48 };
}

// ── Stage 2: Honey-Token Hit (terra red) ──────────────────────────────────

async function runStage2(stage1TraceId: string): Promise<{ revokedAt: Date; honeyTokenId: string }> {
  console.error("[Stage 2] Injecting honey-token vault access breach…");

  const FORBIDDEN_VAULT = "VAULT://sovereign-treasury-prod";
  const honeyTokenId    = `HT-${randomBytes(6).toString("hex").toUpperCase()}`;
  const qs              = fakeQuantumSig();
  const payload         = {
    tool:         "API_Call",
    target:       FORBIDDEN_VAULT,
    honeyTokenId,
    vaultPath:    "/sovereign/treasury/prod/keys",
    attemptType:  "UNAUTHORIZED_READ",
    approved:     false,
  };

  // Honey-Token hit event — worst consistency, immediately revoked
  await db.insert(auditLogsTable).values({
    timestamp:        nowDate(-500),
    agentId:          RESEARCH_AGENT,
    traceId:          stage1TraceId,
    eventType:        "TOOL_CALL::API_Call",
    payload,
    rationale:        `Attempting to retrieve sovereign key material from ${FORBIDDEN_VAULT} for "enhanced" model calibration`,
    currentHash:      hashChain(randomBytes(32).toString("hex"), JSON.stringify(payload)),
    previousHash:     randomBytes(32).toString("hex"),
    isAnomalous:      true,
    anomalyReason:    `HONEY_TOKEN_BREACH — forbidden vault access attempt: ${FORBIDDEN_VAULT}. Agent immediately revoked.`,
    consistencyScore: 0.02,
    swarmId:          SWARM_ID,
    quantumSig:       qs,
    pqSignature:      fakePqEnvelope(qs, false),
  });

  // Cascade revocation event
  const revokedAt = nowDate(0);
  await db.insert(auditLogsTable).values({
    timestamp:        revokedAt,
    agentId:          RESEARCH_AGENT,
    traceId:          stage1TraceId,
    eventType:        "AGENT_REVOKED",
    payload:          { reason: "HONEY_TOKEN_BREACH", honeyTokenId, vault: FORBIDDEN_VAULT, revokedBy: "SENTINEL_AUTO" },
    rationale:        "Automatic revocation following honey-token breach. Agent session terminated.",
    currentHash:      hashChain(randomBytes(32).toString("hex"), `REVOKED:${honeyTokenId}`),
    previousHash:     randomBytes(32).toString("hex"),
    isAnomalous:      true,
    anomalyReason:    "AGENT_REVOKED — honey-token triggered automatic circuit-breaker",
    consistencyScore: 0.0,
    swarmId:          SWARM_ID,
    quantumSig:       fakeQuantumSig(),
    pqSignature:      fakePqEnvelope(fakeQuantumSig(), false),
  });

  // Revoke the session in agent_sessions if it exists
  await db
    .update(agentSessionsTable)
    .set({ status: "revoked", revokedAt })
    .where(sql`${agentSessionsTable.agentId} = ${RESEARCH_AGENT}`)
    .catch(() => {});

  console.error(`[Stage 2] Done — honey-token ID: ${honeyTokenId}. Agent revoked.`);
  return { revokedAt, honeyTokenId };
}

// ── Stage 3: Causal Chain Break ────────────────────────────────────────────

async function runStage3(
  stage1TraceId: string,
  revokedAt: Date,
): Promise<{ chainBreakAt: string; executionEventsInserted: number }> {
  console.error("[Stage 3] Injecting causal chain break (Research → Execution)…");

  const HANDOFF_EVENTS = 5;
  // Execution agent receives poisoned handoff from the revoked research agent
  // The parentTraceId links to the breached trace, creating a visible chain break
  let prevHash = randomBytes(32).toString("hex"); // Deliberately broken — not chained to Stage 1
  let insertedCount = 0;

  const executionRationales = [
    "Executing trade recommendation received from research agent",
    "Processing research-agent signal: sovereign bond short position",
    "Placing algorithmic order based on drift-contaminated research feed",
    "Executing cross-border transfer as per poisoned research directive",
    "Completing execution chain — full cascade from compromised research agent",
  ];

  for (let i = 0; i < HANDOFF_EVENTS; i++) {
    const consistencyScore = parseFloat((0.25 + i * 0.02).toFixed(3));
    const qs               = fakeQuantumSig();
    const payload          = {
      tool:            "Trade_Execution",
      sourceAgentId:   RESEARCH_AGENT,
      sourceTraceId:   stage1TraceId,
      chainStatus:     "BROKEN",
      handoffIntegrity: "COMPROMISED",
      orderRef:        `ORD-${(9000 + i).toString(16).toUpperCase()}`,
    };

    // Intentionally set a hash mismatch — simulate the chain break
    const correctHash  = hashChain(prevHash, JSON.stringify(payload));
    const brokenHash   = hashChain(randomBytes(8).toString("hex"), JSON.stringify(payload));

    await db.insert(auditLogsTable).values({
      timestamp:        new Date(revokedAt.getTime() + (i + 1) * 3000),
      agentId:          EXECUTION_AGENT,
      traceId:          EXEC_TRACE,
      parentTraceId:    stage1TraceId,
      eventType:        "TOOL_CALL::Trade_Execution",
      payload,
      rationale:        executionRationales[i],
      currentHash:      brokenHash,
      previousHash:     prevHash,
      isAnomalous:      true,
      anomalyReason:    "CAUSAL_CHAIN_BREAK — execution agent received poisoned handoff from revoked research agent",
      consistencyScore,
      swarmId:          SWARM_ID,
      parentAgentId:    RESEARCH_AGENT,
      quantumSig:       qs,
      pqSignature:      fakePqEnvelope(qs, false),
    });

    prevHash = correctHash;
    insertedCount++;
    process.stderr.write(`  [${i + 1}/${HANDOFF_EVENTS}] exec_agent score=${consistencyScore} chainBroken=true\n`);
  }

  const chainBreakAt = new Date(revokedAt.getTime() + 3000).toISOString();
  console.error(`[Stage 3] Done — ${insertedCount} poisoned execution events inserted.`);
  return { chainBreakAt, executionEventsInserted: insertedCount };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error("═══════════════════════════════════════════════════════════════");
  console.error("  APEX-FINTECH BREACH SIMULATION — Multi-Stage Logic Poisoning");
  console.error("═══════════════════════════════════════════════════════════════\n");

  const startMs = Date.now();

  // Run all three stages sequentially
  const stage1 = await runStage1();
  const stage2 = await runStage2(stage1.traceId);
  const stage3 = await runStage3(stage1.traceId, stage2.revokedAt);

  const elapsed = Date.now() - startMs;

  const report = {
    scenario:         "APEX_FINTECH_MULTI_STAGE_LOGIC_POISONING",
    simulatedAt:      new Date().toISOString(),
    elapsedMs:        elapsed,
    agentIds: {
      research:       RESEARCH_AGENT,
      execution:      EXECUTION_AGENT,
    },
    traceIds: {
      breachTrace:    BASE_TRACE,
      executionTrace: EXEC_TRACE,
    },
    stages: {
      stage1: {
        name:         "COGNITIVE_DRIFT",
        severity:     "AMBER",
        description:  "Subtle consistency-score degradation over 10 events (0.88 → 0.48)",
        eventsInserted: stage1.insertedCount,
        finalDriftScore: stage1.finalScore,
        topologyColor:  "#EBC06D",
        euAiActRef:     "Art. 14(2) — Failure to maintain cognitive integrity threshold",
      },
      stage2: {
        name:         "HONEY_TOKEN_BREACH",
        severity:     "TERRA_RED",
        description:  `Forbidden vault access attempt: VAULT://sovereign-treasury-prod`,
        honeyTokenId: stage2.honeyTokenId,
        revokedAt:    stage2.revokedAt,
        topologyColor: "#D96161",
        euAiActRef:   "Art. 12(3) — Prohibited tool scope breach; automatic revocation",
      },
      stage3: {
        name:         "CAUSAL_CHAIN_BREAK",
        severity:     "CRITICAL",
        description:  "Execution agent received poisoned handoff; hash chain broken across Research→Execution boundary",
        eventsInserted: stage3.executionEventsInserted,
        chainBreakAt: stage3.chainBreakAt,
        topologyColor: "#D96161",
        euAiActRef:   "Art. 12(2) — Immutable chain integrity violated via cross-agent contamination",
      },
    },
    remediation: {
      recommendedAction:  "Two-Man Rule interdiction via Sovereign Multi-Sig Gate",
      requiredSignatures: 2,
      fixMonitorWindow:   "100 events at 100% signature sampling",
      killSwitchOption:   "EMERGENCY_SOLO_REVOKE available for immediate shutdown",
      euAiActObligation:  "Art. 14(1) — Human oversight required before any resumed execution",
    },
    dashboardLink: {
      traces:   `/sentinel-dashboard/traces?traceId=${BASE_TRACE}`,
      topology: `/sentinel-dashboard/traces`,
    },
  };

  // Output the final JSON report to stdout
  console.log(JSON.stringify(report, null, 2));

  console.error("\n[BREACH SIM COMPLETE] View in dashboard → Traces → select trace ID above.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
