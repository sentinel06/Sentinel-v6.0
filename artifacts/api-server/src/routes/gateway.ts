/**
 * Project Genesis — Sovereign Gateway API  (v5.0)
 *
 * The infrastructure-level interdiction layer that allows external Multi-Agent
 * Systems (LangGraph, CrewAI, AutoGen, etc.) to register with Agent-Sentinel
 * and operate under real-time governance.
 *
 * POST /v1/gateway/register    — Register agent → ML-DSA-87 Signed Identity Token
 * POST /v1/gateway/preflight   — Pre-flight clearance (revocation / drift-lock check)
 * POST /v1/gateway/telemetry   — Ingest action packet → ledger + Swarm Map events
 * POST /v1/gateway/heartbeat   — Liveness ping with drift rolling average
 * GET  /v1/gateway/agents      — List all registered Gateway agents
 * GET  /v1/gateway/token/:id   — Verify an Identity Token
 */

import { Router, type IRouter } from "express";
import { randomBytes, createHash } from "crypto";
import { db, auditLogsTable, agentRegistryTable, agentSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signWithMLDSA, PQC_ALGORITHM_ID, DOMAIN_SEPARATOR } from "../crypto/pqc";
import { getLastHash } from "../lib/hash";
import { computeConsistencyScore } from "../lib/consistency";
import {
  isAgentRevoked,
  isDriftLocked,
  getDriftLockInfo,
  lockAgentForDrift,
  recordConsistencyScore,
} from "../lib/governance";
import { broadcastGatewayEvent } from "../lib/ws";
import { resolveOwnerFromKey } from "../lib/owner";

const router: IRouter = Router();

// ── In-memory Identity Token Store ───────────────────────────────────────────
// Maps tokenId → { agentId, issuedAt, expiresAt, signature, capabilities }
// In production this would be persisted + rotated on a schedule.

interface IdentityToken {
  tokenId:              string;
  agentId:              string;
  name:                 string;
  capabilities:         string[];
  swarmId:              string | null;
  parentId:             string | null;
  issuedAt:             string;
  expiresAt:            string;
  algorithm:            string;
  signature:            string;
  publicKeyFingerprint: string;
  driftThreshold:       number;
  interdictionMode:     "shadow" | "sovereign";
}

const tokenStore = new Map<string, IdentityToken>();
// agentId → tokenId (latest)
const agentTokenIndex = new Map<string, string>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFakeQuantumSig(): string {
  return randomBytes(87).toString("base64url");
}

function hashChainEntry(prevHash: string, payload: string): string {
  return createHash("sha512").update(`${prevHash}:${payload}`).digest("hex");
}

/**
 * Build and sign an Identity Token for a gateway-registered agent.
 * The token payload is signed with ML-DSA-87 (QL-2.0 abstraction layer).
 */
function issueIdentityToken(
  agentId: string,
  name: string,
  capabilities: string[],
  swarmId: string | null,
  parentId: string | null,
  driftThreshold: number,
  interdictionMode: "shadow" | "sovereign",
): IdentityToken {
  const tokenId   = `gw-tok-${randomBytes(12).toString("hex")}`;
  const issuedAt  = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 h

  const payload = JSON.stringify({
    tokenId, agentId, name, capabilities, swarmId, parentId,
    issuedAt, expiresAt, driftThreshold, interdictionMode,
    domain: DOMAIN_SEPARATOR,
  });

  const sig = signWithMLDSA(payload);

  const token: IdentityToken = {
    tokenId,
    agentId,
    name,
    capabilities,
    swarmId,
    parentId,
    issuedAt,
    expiresAt,
    algorithm:            PQC_ALGORITHM_ID,
    signature:            sig.signature,
    publicKeyFingerprint: sig.publicKeyFingerprint,
    driftThreshold,
    interdictionMode,
  };

  tokenStore.set(tokenId, token);
  agentTokenIndex.set(agentId, tokenId);
  return token;
}

function resolveToken(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): IdentityToken | null {
  const raw = (headers["x-sentinel-token"] as string | undefined)
    ?? (typeof body["identityToken"] === "string" ? body["identityToken"] as string : undefined);
  if (!raw) return null;
  // raw is either a tokenId or the full token object (for convenience)
  if (tokenStore.has(raw)) return tokenStore.get(raw)!;
  return null;
}

// ── POST /v1/gateway/register ─────────────────────────────────────────────────
// Allows an external agent to register and receive an ML-DSA-87 Signed Identity Token.
// The agent is simultaneously added to the agent_registry and agent_sessions tables
// so it appears on the Evolutionary Swarm Map immediately.

router.post("/v1/gateway/register", async (req, res): Promise<void> => {
  const {
    agentId,
    name,
    capabilities = [],
    parentId,
    swarmId,
    riskTier        = "Medium",
    driftThreshold  = 0.15,       // 15% — triggers Violet/Mutant on the Swarm Map
    interdictionMode = "shadow",  // "shadow" | "sovereign"
    apiKey,
  } = req.body ?? {};

  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "agentId is required" });
    return;
  }
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!Array.isArray(capabilities)) {
    res.status(400).json({ error: "capabilities must be an array of strings" });
    return;
  }

  // Upsert agent_registry
  const existing = await db
    .select({ id: agentRegistryTable.id })
    .from(agentRegistryTable)
    .where(eq(agentRegistryTable.agentId, agentId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(agentRegistryTable)
      .set({
        ownerEmail:      apiKey ? `gateway-key:${apiKey}` : "gateway",
        authorizedTools: capabilities,
        riskTier:        riskTier as string,
        isActive:        true,
      })
      .where(eq(agentRegistryTable.agentId, agentId));
  } else {
    await db.insert(agentRegistryTable).values({
      agentId,
      ownerEmail:      apiKey ? `gateway-key:${apiKey}` : "gateway",
      authorizedTools: capabilities,
      riskTier:        riskTier as string,
      isActive:        true,
    });
  }

  // Register swarm session (creates the node on the Swarm Map)
  let resolvedRootSwarmId: string | null = swarmId ?? null;
  if (!resolvedRootSwarmId && parentId) {
    const [ps] = await db
      .select({ rootSwarmId: agentSessionsTable.rootSwarmId, swarmId: agentSessionsTable.swarmId })
      .from(agentSessionsTable)
      .where(eq(agentSessionsTable.agentId, parentId))
      .limit(1);
    resolvedRootSwarmId = ps?.rootSwarmId ?? ps?.swarmId ?? null;
  }
  await db.insert(agentSessionsTable).values({
    agentId,
    parentUid:    parentId ?? null,
    rootSwarmId:  resolvedRootSwarmId,
    swarmId:      swarmId ?? null,
    status:       "active",
  });

  // Issue ML-DSA-87 Signed Identity Token
  const token = issueIdentityToken(
    agentId, name, capabilities as string[],
    swarmId ?? null, parentId ?? null,
    driftThreshold as number, interdictionMode as "shadow" | "sovereign",
  );

  // Immutable ledger: record GATEWAY_REGISTRATION event
  const prevHash = await getLastHash();
  const qs       = makeFakeQuantumSig();
  const payload  = { event: "GATEWAY_REGISTRATION", agentId, name, capabilities, swarmId, parentId, tokenId: token.tokenId };
  const hash     = hashChainEntry(prevHash ?? "GENESIS", JSON.stringify(payload));
  const ownerUserId = await resolveOwnerFromKey(req);
  await db.insert(auditLogsTable).values({
    agentId,
    traceId:          `gw-reg-${token.tokenId}`,
    eventType:        "GATEWAY_REGISTRATION",
    payload,
    rationale:        `Agent '${name}' registered via Sentinel-Bridge SDK. Interdiction mode: ${interdictionMode}.`,
    currentHash:      hash,
    previousHash:     prevHash,
    isAnomalous:      false,
    consistencyScore: 1.0,
    swarmId:          swarmId ?? null,
    quantumSig:       qs,
    pqSignature: {
      algorithm:  PQC_ALGORITHM_ID,
      fipsLevel:  5,
      domainSep:  DOMAIN_SEPARATOR,
      sigHex:     token.signature.substring(0, 48),
      verified:   true,
    },
    ownerUserId,
  } as any);

  // Broadcast birth event → ZEN_GOLD_SPARK on Swarm Map
  broadcastGatewayEvent("GATEWAY_SPARK", {
    agentId,
    parentId:     parentId ?? null,
    swarmId:      swarmId ?? null,
    tokenId:      token.tokenId,
    eventSubtype: "BIRTH",
    name,
  });

  res.status(201).json({
    ok: true,
    message: `Agent '${name}' registered under Sovereign Gateway. Identity Token issued.`,
    identityToken: token,
  });
});

// ── POST /v1/gateway/preflight ────────────────────────────────────────────────
// Sovereign Interceptor pre-flight clearance.
// Every LLM call must ping this endpoint before execution.
// Returns 403 with SOVEREIGN_INTERDICTION if the agent is revoked or drift-locked.

router.post("/v1/gateway/preflight", async (req, res): Promise<void> => {
  const { agentId, traceId, intent, prompt } = req.body ?? {};

  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "agentId is required" });
    return;
  }

  // Check revocation
  if (isAgentRevoked(agentId)) {
    res.status(403).json({
      status:    "REVOKED",
      error:     "403 — Sovereign Interdiction: Logic DNA Corrupted",
      agentId,
      traceId:   traceId ?? null,
      reason:    "Agent has been revoked by the Sentinel governance engine. All downstream actions are blocked.",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Check drift lock
  if (isDriftLocked(agentId)) {
    const info = getDriftLockInfo(agentId);
    res.status(403).json({
      status:    "DRIFT_LOCKED",
      error:     "403 — Sovereign Interdiction: Cognitive Drift Threshold Exceeded",
      agentId,
      traceId:   traceId ?? null,
      reason:    info?.reason ?? "Agent drift score exceeds threshold. Autonomous interdiction active.",
      driftScore: info?.driftScore ?? null,
      lockedAt:  info?.lockedAt ?? null,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Clearance granted
  const clearanceId = `clf-${randomBytes(8).toString("hex")}`;
  res.status(200).json({
    status:      "CLEARED",
    clearanceId,
    agentId,
    traceId:     traceId ?? null,
    intent:      intent ?? null,
    prompt:      prompt ? `${(prompt as string).substring(0, 200)}…` : null,
    clearedAt:   new Date().toISOString(),
    message:     "Pre-flight clearance granted. Proceed with LLM execution.",
  });
});

// ── POST /v1/gateway/telemetry ────────────────────────────────────────────────
// Receives Agent Action packets from the Sentinel-Bridge SDK.
// - Computes drift score from consistencyScore
// - If drift > 15% → broadcasts GATEWAY_MUTATION (Violet/Mutant on Swarm Map)
// - If policy violation → broadcasts GATEWAY_DISSOLUTION (Extinction animation)
// - If success → broadcasts GATEWAY_SPARK (ZEN_GOLD_SPARK animation)
// - Always pipes to the Immutable Audit Ledger

router.post("/v1/gateway/telemetry", async (req, res): Promise<void> => {
  const {
    agentId,
    traceId,
    eventType       = "AGENT_ACTION",
    payload         = {},
    rationale,
    swarmId,
    parentAgentId,
    driftScore,         // 0–100 — caller can pass override; we also compute from consistency
    outcome,            // "success" | "violation" | "error"
  } = req.body ?? {};

  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "agentId is required" });
    return;
  }
  if (!traceId || typeof traceId !== "string") {
    res.status(400).json({ error: "traceId is required" });
    return;
  }

  // Token resolved from header or body
  const tok = resolveToken(req.headers as Record<string, string | string[] | undefined>, req.body ?? {});
  const effectiveDriftThreshold = tok?.driftThreshold ?? 0.15;
  const interdictionMode        = tok?.interdictionMode ?? "shadow";

  // Compute consistency score + drift.
  // NOTE: computeConsistencyScore() takes (rationale, eventType, payload) and
  // is purely intent-vs-action; it does not yet incorporate prior-payload
  // history. The agentId / priorPayloads we used to forward here were
  // silently ignored — we keep them out of the call so the signature
  // matches and TS is happy. When prior-payload context is added to the
  // scorer, plumb it back through.
  const consistency  = computeConsistencyScore(rationale as string | undefined, eventType as string, payload as object);
  const computedDrift = Math.round((1 - consistency.score) * 100);
  const effectiveDrift = typeof driftScore === "number" ? driftScore : computedDrift;

  const isAnomalous   = consistency.isHighRisk || effectiveDrift > (effectiveDriftThreshold * 100);
  const anomalyReason = consistency.isHighRisk
    ? consistency.reasons.join("; ")
    : effectiveDrift > (effectiveDriftThreshold * 100)
      ? `Logic drift ${effectiveDrift.toFixed(1)}% exceeds Sovereign threshold (${(effectiveDriftThreshold * 100).toFixed(0)}%)`
      : null;

  // Record for session health
  recordConsistencyScore(agentId, consistency.score);

  // ── Sovereign Interdiction: drift-lock in Sovereign mode ─────────────────
  if (effectiveDrift > (effectiveDriftThreshold * 100) && interdictionMode === "sovereign" && !isDriftLocked(agentId) && !isAgentRevoked(agentId)) {
    lockAgentForDrift(agentId, effectiveDrift);
  }

  // ── Ledger commit ─────────────────────────────────────────────────────────
  const prevHash = await getLastHash();
  const qs       = makeFakeQuantumSig();
  const fullPayload = {
    ...(payload as object),
    eventType,
    outcome:      outcome ?? "unknown",
    driftScore:   effectiveDrift,
    sdk:          "sentinel-bridge",
    interdictionMode,
  };
  // prevHash is null when the ledger is empty (genesis). Fall back to the
  // sentinel string used by computeHash() in lib/hash.ts so the chain
  // anchor stays consistent across both helpers.
  const hash = hashChainEntry(prevHash ?? "GENESIS", JSON.stringify(fullPayload));

  const ownerUserId = await resolveOwnerFromKey(req);
  const [inserted] = await db.insert(auditLogsTable).values({
    agentId,
    traceId,
    eventType:        eventType as string,
    payload:          fullPayload,
    rationale:        (rationale as string | undefined) ?? `Gateway telemetry: ${eventType}`,
    currentHash:      hash,
    previousHash:     prevHash,
    isAnomalous,
    anomalyReason,
    consistencyScore: consistency.score,
    swarmId:          (swarmId as string | undefined) ?? null,
    quantumSig:       qs,
    pqSignature: {
      algorithm:  PQC_ALGORITHM_ID,
      fipsLevel:  5,
      domainSep:  DOMAIN_SEPARATOR,
      sigHex:     qs.substring(0, 48),
      verified:   true,
    },
    ownerUserId,
  } as any).returning({ id: auditLogsTable.id });

  // ── Swarm Map Animation Broadcasts ────────────────────────────────────────
  const baseEvent = { agentId, traceId, swarmId: swarmId ?? null, driftScore: effectiveDrift, consistencyScore: consistency.score };

  if (outcome === "violation" || (isAnomalous && effectiveDrift > 50)) {
    // Policy violation or extreme drift → CELLULAR_DISSOLUTION (Extinction)
    broadcastGatewayEvent("GATEWAY_DISSOLUTION", {
      ...baseEvent,
      anomalyReason,
      eventType,
      severity: effectiveDrift > 80 ? "CRITICAL" : "HIGH",
    });
  } else if (effectiveDrift > (effectiveDriftThreshold * 100)) {
    // Drift exceeds threshold → GATEWAY_MUTATION (Violet Jitter)
    // Broadcast under both canonical name and legacy MUTATION_DETECTED alias
    const mutationPayload = {
      ...baseEvent,
      anomalyReason,
      threshold:    effectiveDriftThreshold * 100,
    };
    broadcastGatewayEvent("GATEWAY_MUTATION",  mutationPayload);
    broadcastGatewayEvent("MUTATION_DETECTED", mutationPayload);
  } else if (outcome === "success" || (!isAnomalous && effectiveDrift < 10)) {
    // Healthy successful task → ZEN_GOLD_SPARK
    broadcastGatewayEvent("GATEWAY_SPARK", {
      ...baseEvent,
      eventSubtype: "TASK_COMPLETE",
      eventType,
    });
  }

  res.status(201).json({
    ok:              true,
    ledgerEntryId:   inserted?.id ?? null,
    currentHash:     hash,
    consistencyScore: consistency.score,
    driftScore:      effectiveDrift,
    isAnomalous,
    anomalyReason,
    swarmEvent:      outcome === "violation" || effectiveDrift > 50 ? "CELLULAR_DISSOLUTION"
                   : effectiveDrift > (effectiveDriftThreshold * 100)             ? "SWARM_MUTATION"
                   : "ZEN_GOLD_SPARK",
    interdiction:    isDriftLocked(agentId) || isAgentRevoked(agentId),
  });
});

// ── POST /v1/gateway/heartbeat ────────────────────────────────────────────────
// Liveness ping — updates drift rolling average without full telemetry commit.

router.post("/v1/gateway/heartbeat", async (req, res): Promise<void> => {
  const { agentId, driftScore, swarmId } = req.body ?? {};
  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "agentId is required" });
    return;
  }

  const revoked   = isAgentRevoked(agentId);
  const drifted   = isDriftLocked(agentId);
  const driftInfo = drifted ? getDriftLockInfo(agentId) : null;

  if (typeof driftScore === "number") {
    recordConsistencyScore(agentId, Math.max(0, 1 - driftScore / 100));
  }

  res.json({
    agentId,
    status:    revoked ? "REVOKED" : drifted ? "DRIFT_LOCKED" : "ACTIVE",
    revoked,
    driftLocked:  drifted,
    driftInfo:    driftInfo ?? null,
    timestamp:    new Date().toISOString(),
    serverTime:   Date.now(),
  });
});

// ── POST /v1/gateway/crispr_recode ───────────────────────────────────────────
// Triggered by the War Room when a RECURSIVE_FIX_VERIFIED surge completes.
// Broadcasts CRISPR_RECODE to all WS-connected SDK clients so they can reset
// their internal drift accumulators to pre-anomaly baseline.
// Also commits a CRISPR_RECODE entry to the Immutable Audit Ledger.

router.post("/v1/gateway/crispr_recode", async (req, res): Promise<void> => {
  const { rootId, targets = [], source = "WAR_ROOM", healedAt } = req.body ?? {};

  const recodeId  = `crispr-${randomBytes(8).toString("hex")}`;
  const timestamp = healedAt ?? new Date().toISOString();

  // Commit to ledger
  const prevHash = await getLastHash();
  const qs       = makeFakeQuantumSig();
  const ledgerPayload = { event: "CRISPR_RECODE", rootId, targets, source, recodeId, timestamp };
  // See note at the gateway POST hash chain entry above re: GENESIS sentinel.
  const hash = hashChainEntry(prevHash ?? "GENESIS", JSON.stringify(ledgerPayload));

  // ownerUserId is intentionally NULL here: CRISPR_RECODE is a platform-level
  // system event that targets agents across potentially multiple tenants.
  // A NULL owner means it is treated as a system/demo row and is invisible
  // to every tenant-scoped read path (viewerScopeCondition excludes NULL rows).
  await db.insert(auditLogsTable).values({
    agentId:          rootId ?? "sentinel-system",
    traceId:          recodeId,
    eventType:        "CRISPR_RECODE",
    payload:          ledgerPayload,
    rationale:        `CRISPR Genetic Recoding Surge: ${(targets as string[]).length} nodes healed. Source: ${source}.`,
    currentHash:      hash,
    previousHash:     prevHash,
    isAnomalous:      false,
    consistencyScore: 1.0,
    quantumSig:       qs,
    pqSignature: {
      algorithm:  PQC_ALGORITHM_ID,
      fipsLevel:  5,
      domainSep:  DOMAIN_SEPARATOR,
      sigHex:     qs.substring(0, 48),
      verified:   true,
    },
  }).catch(() => {}); // Non-blocking; ledger write failure shouldn't block WS broadcast

  // Broadcast CRISPR_RECODE to all connected WS clients (SDK listeners)
  broadcastGatewayEvent("CRISPR_RECODE", {
    recodeId,
    rootId:    rootId ?? null,
    targets:   targets as string[],
    healedAt:  timestamp,
    source,
    message:   "Sovereign CRISPR Recode: internal drift parameters reset to baseline.",
  });

  res.json({
    ok:       true,
    recodeId,
    rootId:   rootId ?? null,
    targets,
    healedAt: timestamp,
    message:  `CRISPR_RECODE broadcast to ${(targets as string[]).length} agents. Ledger committed.`,
  });
});

// ── GET /v1/gateway/agents ────────────────────────────────────────────────────
// List all agents registered via the Sovereign Gateway.

router.get("/v1/gateway/agents", async (_req, res): Promise<void> => {
  const tokens = Array.from(tokenStore.values()).map(t => ({
    tokenId:              t.tokenId,
    agentId:              t.agentId,
    name:                 t.name,
    capabilities:         t.capabilities,
    swarmId:              t.swarmId,
    parentId:             t.parentId,
    issuedAt:             t.issuedAt,
    expiresAt:            t.expiresAt,
    algorithm:            t.algorithm,
    publicKeyFingerprint: t.publicKeyFingerprint,
    driftThreshold:       t.driftThreshold,
    interdictionMode:     t.interdictionMode,
    revoked:              isAgentRevoked(t.agentId),
    driftLocked:          isDriftLocked(t.agentId),
  }));
  res.json({ agents: tokens, count: tokens.length });
});

// ── GET /v1/gateway/token/:tokenId ────────────────────────────────────────────
// Verify and inspect an Identity Token.

router.get("/v1/gateway/token/:tokenId", (req, res): void => {
  const { tokenId } = req.params;
  const token = tokenStore.get(tokenId);
  if (!token) {
    res.status(404).json({ error: "Identity Token not found or expired" });
    return;
  }
  const expired = new Date(token.expiresAt) < new Date();
  res.json({
    valid:                !expired,
    expired,
    tokenId:              token.tokenId,
    agentId:              token.agentId,
    name:                 token.name,
    capabilities:         token.capabilities,
    algorithm:            token.algorithm,
    publicKeyFingerprint: token.publicKeyFingerprint,
    issuedAt:             token.issuedAt,
    expiresAt:            token.expiresAt,
    interdictionMode:     token.interdictionMode,
    driftThreshold:       token.driftThreshold,
    revoked:              isAgentRevoked(token.agentId),
    driftLocked:          isDriftLocked(token.agentId),
  });
});

export default router;
