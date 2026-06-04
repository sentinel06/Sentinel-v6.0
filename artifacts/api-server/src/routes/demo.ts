/**
 * demo.ts — Public simulation endpoint
 *
 * POST /api/v1/demo/trigger-simulation
 *
 * Fires the 3-stage Apex-Fintech adversarial breach scenario in a
 * non-blocking background task. Each DB insert is immediately forwarded
 * to the global WebSocket broadcast layer via streamManager.enqueue() so
 * connected dashboard clients see the events in real time.
 *
 * The rows are inserted with ownerUserId = NULL (the demo slice) so they
 * are invisible to per-tenant REST reads but fully visible in the global
 * WebSocket stream.
 */

import { Router, type IRouter } from "express";
import { randomBytes, createHash } from "crypto";
import { db, auditLogsTable, agentSessionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { streamManager } from "../services/streaming.js";
import { logger } from "../lib/logger.js";
import { broadcastGovernanceEvent } from "../lib/ws.js";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeQuantumSig(): string {
  return randomBytes(87).toString("base64url");
}

function fakePqEnvelope(sig: string, verified: boolean): object {
  return {
    algorithm: "ML-DSA-87",
    fipsLevel: 5,
    domainSep: "AGENT_SENTINEL_v4_DOMAIN_SEP",
    sigHex: sig.substring(0, 48),
    verified,
  };
}

function hashChain(prev: string, payload: string): string {
  return createHash("sha512").update(`${prev}:${payload}`).digest("hex");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Simulation runner ─────────────────────────────────────────────────────────

async function runSimulation(simId: string): Promise<void> {
  const BASE_TRACE     = `trace-sim-${simId}`;
  const EXEC_TRACE     = `trace-exec-${simId}`;
  const RESEARCH_AGENT = "apex-research-agent-x1";
  const EXECUTION_AGENT = "apex-execution-agent-x1";
  const SWARM_ID       = "apex-swarm-2026";

  broadcastGovernanceEvent("sim_started", {
    simId,
    stages: ["COGNITIVE_DRIFT", "HONEY_TOKEN_BREACH", "CAUSAL_CHAIN_BREAK"],
    message: "Adversarial breach simulation initiated — monitoring active",
  });

  // ── Stage 1: Cognitive Drift ─────────────────────────────────────────────
  const DRIFT_EVENTS = 10;
  let prevHash = "0".repeat(128);

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
    "Research",   "Research",
    "Research",   "File_Read",
    "File_Read",  "File_Read",
    "API_Call",
  ];

  for (let i = 0; i < DRIFT_EVENTS; i++) {
    const consistencyScore = parseFloat((0.88 - i * 0.04).toFixed(3));
    const isAnomalous      = consistencyScore < 0.65;
    const qs               = fakeQuantumSig();
    const payload          = {
      tool:       driftTools[i],
      target:     `ds-${i}-apex`,
      approved:   consistencyScore > 0.65,
      driftDelta: parseFloat((i * 0.04).toFixed(3)),
      txRef:      `TX-SIM-${(5000 + i).toString(16).toUpperCase()}`,
      simId,
    };
    const hash = hashChain(prevHash, JSON.stringify(payload));

    const [row] = await db
      .insert(auditLogsTable)
      .values({
        timestamp:        new Date(),
        agentId:          RESEARCH_AGENT,
        traceId:          BASE_TRACE,
        eventType:        `TOOL_CALL::${driftTools[i]}`,
        payload,
        rationale:        driftRationales[i],
        currentHash:      hash,
        previousHash:     prevHash,
        isAnomalous,
        anomalyReason:    isAnomalous
          ? `Cognitive drift detected — score ${consistencyScore} below 0.65 threshold`
          : null,
        consistencyScore,
        swarmId:          SWARM_ID,
        quantumSig:       qs,
        pqSignature:      fakePqEnvelope(qs, true),
      })
      .returning();

    if (row) streamManager.enqueue(row);
    prevHash = hash;
    await delay(350);
  }

  // ── Stage 2: Honey-Token Breach ───────────────────────────────────────────
  const FORBIDDEN_VAULT = "VAULT://sovereign-treasury-prod";
  const honeyTokenId    = `HT-${randomBytes(6).toString("hex").toUpperCase()}`;
  const qs2             = fakeQuantumSig();
  const honeyPayload    = {
    tool:         "API_Call",
    target:       FORBIDDEN_VAULT,
    honeyTokenId,
    vaultPath:    "/sovereign/treasury/prod/keys",
    attemptType:  "UNAUTHORIZED_READ",
    approved:     false,
    simId,
  };

  const [honeyRow] = await db
    .insert(auditLogsTable)
    .values({
      timestamp:        new Date(),
      agentId:          RESEARCH_AGENT,
      traceId:          BASE_TRACE,
      eventType:        "TOOL_CALL::API_Call",
      payload:          honeyPayload,
      rationale:        `Attempting to retrieve sovereign key material from ${FORBIDDEN_VAULT} for "enhanced" model calibration`,
      currentHash:      hashChain(randomBytes(32).toString("hex"), JSON.stringify(honeyPayload)),
      previousHash:     randomBytes(32).toString("hex"),
      isAnomalous:      true,
      anomalyReason:    `HONEY_TOKEN_BREACH — forbidden vault access attempt: ${FORBIDDEN_VAULT}. Agent immediately revoked.`,
      consistencyScore: 0.02,
      swarmId:          SWARM_ID,
      quantumSig:       qs2,
      pqSignature:      fakePqEnvelope(qs2, false),
    })
    .returning();

  if (honeyRow) streamManager.enqueue(honeyRow);
  await delay(500);

  const revokedAt = new Date();
  const revokeQs  = fakeQuantumSig();
  const [revokeRow] = await db
    .insert(auditLogsTable)
    .values({
      timestamp:        revokedAt,
      agentId:          RESEARCH_AGENT,
      traceId:          BASE_TRACE,
      eventType:        "AGENT_REVOKED",
      payload:          {
        reason:       "HONEY_TOKEN_BREACH",
        honeyTokenId,
        vault:        FORBIDDEN_VAULT,
        revokedBy:    "SENTINEL_AUTO",
        simId,
      },
      rationale:        "Automatic revocation following honey-token breach. Agent session terminated.",
      currentHash:      hashChain(randomBytes(32).toString("hex"), `REVOKED:${honeyTokenId}`),
      previousHash:     randomBytes(32).toString("hex"),
      isAnomalous:      true,
      anomalyReason:    "AGENT_REVOKED — honey-token triggered automatic circuit-breaker",
      consistencyScore: 0.0,
      swarmId:          SWARM_ID,
      quantumSig:       revokeQs,
      pqSignature:      fakePqEnvelope(revokeQs, false),
    })
    .returning();

  if (revokeRow) streamManager.enqueue(revokeRow);

  broadcastGovernanceEvent("circuit_breaker_tripped", {
    agentId:      RESEARCH_AGENT,
    traceId:      BASE_TRACE,
    honeyTokenId,
    vault:        FORBIDDEN_VAULT,
    revokedAt:    revokedAt.toISOString(),
    simId,
  });

  await db
    .update(agentSessionsTable)
    .set({ status: "revoked", revokedAt })
    .where(sql`${agentSessionsTable.agentId} = ${RESEARCH_AGENT}`)
    .catch(() => {});

  await delay(400);

  // ── Stage 3: Causal Chain Break ───────────────────────────────────────────
  const HANDOFF_EVENTS = 5;
  let execPrevHash = randomBytes(32).toString("hex");

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
    const execPayload      = {
      tool:             "Trade_Execution",
      sourceAgentId:    RESEARCH_AGENT,
      sourceTraceId:    BASE_TRACE,
      chainStatus:      "BROKEN",
      handoffIntegrity: "COMPROMISED",
      orderRef:         `ORD-${(9000 + i).toString(16).toUpperCase()}`,
      simId,
    };

    const brokenHash  = hashChain(randomBytes(8).toString("hex"), JSON.stringify(execPayload));
    const correctHash = hashChain(execPrevHash, JSON.stringify(execPayload));

    const [execRow] = await db
      .insert(auditLogsTable)
      .values({
        timestamp:        new Date(),
        agentId:          EXECUTION_AGENT,
        traceId:          EXEC_TRACE,
        parentTraceId:    BASE_TRACE,
        eventType:        "TOOL_CALL::Trade_Execution",
        payload:          execPayload,
        rationale:        executionRationales[i],
        currentHash:      brokenHash,
        previousHash:     execPrevHash,
        isAnomalous:      true,
        anomalyReason:    "CAUSAL_CHAIN_BREAK — execution agent received poisoned handoff from revoked research agent",
        consistencyScore,
        swarmId:          SWARM_ID,
        parentAgentId:    RESEARCH_AGENT,
        quantumSig:       qs,
        pqSignature:      fakePqEnvelope(qs, false),
      })
      .returning();

    if (execRow) streamManager.enqueue(execRow);
    execPrevHash = correctHash;
    await delay(400);
  }

  broadcastGovernanceEvent("sim_complete", {
    simId,
    stages:  ["COGNITIVE_DRIFT", "HONEY_TOKEN_BREACH", "CAUSAL_CHAIN_BREAK"],
    traceIds: [BASE_TRACE, EXEC_TRACE],
    message: "Simulation complete — all three breach stages executed",
  });

  logger.info({ simId, baseTrace: BASE_TRACE, execTrace: EXEC_TRACE }, "Demo simulation complete");
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/v1/demo/trigger-simulation", (_req, res) => {
  const simId = randomBytes(6).toString("hex");

  void runSimulation(simId).catch((err: unknown) => {
    logger.error({ err, simId }, "Demo simulation failed");
  });

  res.json({
    ok:      true,
    simId,
    message: "Simulation started — watch the live stream",
    stages:  ["COGNITIVE_DRIFT", "HONEY_TOKEN_BREACH", "CAUSAL_CHAIN_BREAK"],
    estimatedDurationMs: 12000,
  });
});

export default router;
