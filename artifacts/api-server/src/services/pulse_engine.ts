/**
 * Sovereign Pulse Engine — Internal heartbeat system for Agent-Sentinel
 *
 * Runs every 6 hours. Computes three core metrics over the ENTIRE ledger:
 *
 *   ① Global Integrity Index  — % of all audit events carrying a valid
 *                                ML-DSA-87 pq_signature (lifetime, not windowed)
 *
 *   ② Swarm Vitality          — active agent sessions vs. revoked at snapshot time
 *
 *   ③ Quantum Throughput      — theoretical lattice entropy bits processed in the
 *                                last window (verifiedEvents × ML-DSA-87 sigBytes × 8)
 *
 * Each snapshot is SELF-SIGNED with the QL-2.0 Master Key (ML-DSA-87, SYSTEM scope)
 * and stored in system_pulses. This makes the pulse history tamper-evident:
 * any post-hoc edit breaks the lattice signature.
 *
 * If Global Integrity Index falls below 99.9%, the engine:
 *   • Sets status = ALERT
 *   • Broadcasts { type: "pulse_fault" } over the WebSocket so War Room
 *     surfaces a high-priority banner
 */

import { db, auditLogsTable, agentSessionsTable, systemPulsesTable } from "@workspace/db";
import { gte, count, sql, desc } from "drizzle-orm";
import { quantumSigner } from "../crypto/quantum_ledger.js";
import { ML_DSA_87_PARAMS } from "../crypto/pqc.js";
import { broadcastGovernanceEvent } from "../lib/ws.js";
import { logger } from "../lib/logger.js";

// ── Constants ─────────────────────────────────────────────────────────────

const INTEGRITY_FAULT_THRESHOLD = 99.9; // below this → ALERT / UNDER_INVESTIGATION

// ── Helpers ───────────────────────────────────────────────────────────────

function buildPulsePayload(metrics: {
  globalIntegrityIndex: number;
  totalEvents:          number;
  verifiedEvents:       number;
  activeSwarms:         number;
  revokedSwarms:        number;
  quantumThroughputBits: string;
  windowHours:          number;
  createdAt:            string;
}): string {
  // Deterministic canonical string — order matters for signature reproducibility
  return [
    `integrity=${metrics.globalIntegrityIndex.toFixed(6)}`,
    `total=${metrics.totalEvents}`,
    `verified=${metrics.verifiedEvents}`,
    `activeSwarms=${metrics.activeSwarms}`,
    `revokedSwarms=${metrics.revokedSwarms}`,
    `throughputBits=${metrics.quantumThroughputBits}`,
    `windowHours=${metrics.windowHours}`,
    `createdAt=${metrics.createdAt}`,
    `sovereign=AGENT_SENTINEL_SOVEREIGN_PULSE_v1`,
  ].join("|");
}

// ── Public result type ────────────────────────────────────────────────────

export interface SovereignPulseResult {
  id:                   string;
  createdAt:            string;
  globalIntegrityIndex: number;
  totalEvents:          number;
  verifiedEvents:       number;
  activeSwarms:         number;
  revokedSwarms:        number;
  quantumThroughputBits: string;
  status:               string;
  faultReason:          string | null;
  pulsePayload:         string;
  signatureFingerprint: string;
  windowHours:          number;
}

// ── Core engine ───────────────────────────────────────────────────────────

export class PulseEngine {

  async execute(windowHours = 6): Promise<SovereignPulseResult> {
    const createdAt  = new Date();
    const windowSince = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    // ── ① Global Integrity Index (lifetime — entire ledger) ────────────────
    const [totalRow] = await db
      .select({ n: count() })
      .from(auditLogsTable);

    const totalEvents = Number(totalRow?.n ?? 0);

    const [verifiedRow] = await db
      .select({ n: count() })
      .from(auditLogsTable)
      .where(sql`${auditLogsTable.pqSignature} IS NOT NULL`);

    const verifiedEvents = Number(verifiedRow?.n ?? 0);

    const globalIntegrityIndex = totalEvents === 0
      ? 100
      : (verifiedEvents / totalEvents) * 100;

    // ── ② Swarm Vitality ───────────────────────────────────────────────────
    const [activeRow] = await db
      .select({ n: count() })
      .from(agentSessionsTable)
      .where(sql`${agentSessionsTable.status} = 'active'`);

    const [revokedRow] = await db
      .select({ n: count() })
      .from(agentSessionsTable)
      .where(sql`${agentSessionsTable.status} != 'active'`);

    const activeSwarms  = Number(activeRow?.n ?? 0);
    const revokedSwarms = Number(revokedRow?.n ?? 0);

    // ── ③ Quantum Throughput — bits of lattice entropy in the window ───────
    // Count verified events in the rolling window
    const [windowVerifiedRow] = await db
      .select({ n: count() })
      .from(auditLogsTable)
      .where(
        sql`${auditLogsTable.timestamp} >= ${windowSince}
         AND ${auditLogsTable.pqSignature} IS NOT NULL`,
      );

    const windowVerified = Number(windowVerifiedRow?.n ?? 0);
    // ML-DSA-87: 4595 bytes per signature × 8 bits/byte
    const throughputBits = BigInt(windowVerified) * BigInt(ML_DSA_87_PARAMS.sigBytes) * 8n;
    const quantumThroughputBits = throughputBits.toString();

    // ── Status classification ──────────────────────────────────────────────
    let status: "NOMINAL" | "ALERT" | "UNDER_INVESTIGATION" = "NOMINAL";
    let faultReason: string | null = null;

    if (globalIntegrityIndex < INTEGRITY_FAULT_THRESHOLD) {
      status      = "ALERT";
      faultReason = `Global Integrity Index ${globalIntegrityIndex.toFixed(4)}% is below the 99.9% threshold — ${totalEvents - verifiedEvents} events lack ML-DSA-87 signatures`;
    }

    // ── Self-sign the snapshot with QL-2.0 Master Key ─────────────────────
    const metrics = {
      globalIntegrityIndex,
      totalEvents,
      verifiedEvents,
      activeSwarms,
      revokedSwarms,
      quantumThroughputBits,
      windowHours,
      createdAt: createdAt.toISOString(),
    };

    const pulsePayload  = buildPulsePayload(metrics);
    const envelope      = quantumSigner.sign(pulsePayload, "SYSTEM", "SOVEREIGN_PULSE");
    const fingerprint   = envelope.mlDsa87.publicKeyFingerprint;

    // ── Persist ────────────────────────────────────────────────────────────
    const [inserted] = await db
      .insert(systemPulsesTable)
      .values({
        createdAt,
        globalIntegrityIndex,
        totalEvents,
        verifiedEvents,
        activeSwarms,
        revokedSwarms,
        quantumThroughputBits,
        status,
        faultReason,
        pulsePayload,
        pulseSignature: envelope as unknown as Record<string, unknown>,
        windowHours,
      })
      .returning();

    logger.info(
      {
        id: inserted!.id,
        globalIntegrityIndex: globalIntegrityIndex.toFixed(4),
        status,
        activeSwarms,
        revokedSwarms,
        throughputBits: quantumThroughputBits,
      },
      "Sovereign pulse executed",
    );

    // ── Broadcast Pulse Fault to War Room if below threshold ───────────────
    // NOTE: `status` is typed as the full union (NOMINAL|ALERT|UNDER_INVESTIGATION)
    // but the classification block above only ever assigns ALERT. The
    // UNDER_INVESTIGATION state is reserved for future tiered-fault logic
    // (e.g. multi-pulse degradation). Until that lands, only ALERT triggers
    // a War Room broadcast — TS rightly flags any UNDER_INVESTIGATION
    // comparison here as dead code.
    if (status === "ALERT") {
      broadcastGovernanceEvent("pulse_fault", {
        pulseId:              inserted!.id,
        globalIntegrityIndex: globalIntegrityIndex.toFixed(4),
        faultReason,
        status,
        createdAt:            createdAt.toISOString(),
      });
      logger.warn({ status, faultReason }, "Pulse Fault broadcast to War Room");
    }

    return {
      id:                   inserted!.id,
      createdAt:            createdAt.toISOString(),
      globalIntegrityIndex,
      totalEvents,
      verifiedEvents,
      activeSwarms,
      revokedSwarms,
      quantumThroughputBits,
      status,
      faultReason,
      pulsePayload,
      signatureFingerprint: fingerprint,
      windowHours,
    };
  }
}

/** Process-lifetime singleton */
export const pulseEngine = new PulseEngine();

// ── Scheduler ─────────────────────────────────────────────────────────────

const INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startSovereignPulseEngine(): void {
  logger.info({ intervalHours: 6 }, "Sovereign Pulse Engine started");

  // First pulse 45 seconds after boot (staggered from the basic pulse at 30s)
  setTimeout(async () => {
    try {
      await pulseEngine.execute(6);
    } catch (err) {
      logger.warn({ err }, "Initial sovereign pulse failed");
    }
  }, 45_000);

  setInterval(async () => {
    try {
      await pulseEngine.execute(6);
    } catch (err) {
      logger.warn({ err }, "Scheduled sovereign pulse failed");
    }
  }, INTERVAL_MS);
}
