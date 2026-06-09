import { createHash } from "crypto";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

export async function getLastHash(): Promise<string | null> {
  const [last] = await db
    .select({ currentHash: auditLogsTable.currentHash })
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(1);

  return last?.currentHash ?? null;
}

/**
 * Hash-scheme versions stamped on each ledger row (audit_logs.hash_version).
 *
 *   1 (or NULL) — LEGACY: payload serialized with raw JSON.stringify. Every
 *                 historical demo / simulation / gateway row was written this
 *                 way.
 *   2           — CANONICAL: payload serialized with recursively sorted keys
 *                 (canonicalStringify) so structurally-equal payloads always
 *                 hash identically regardless of key insertion order.
 *
 * computeHash() defaults to LEGACY so existing call sites stay byte-for-byte
 * unchanged; only the live ingest path opts into CANONICAL for new chains.
 */
export const LEGACY_HASH_VERSION = 1;
export const CANONICAL_HASH_VERSION = 2;

/**
 * Deterministic JSON serialization with recursively sorted object keys.
 * Used only by canonical (v2+) chains. Array order is preserved (it is
 * semantically significant); object keys are sorted. Primitives defer to
 * JSON.stringify for correct escaping. JSONB payloads never contain
 * `undefined`, so that JSON.stringify edge case cannot occur in practice.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(",")}}`;
}

/**
 * Compute the SHA-256 chain hash for a ledger entry.
 *
 * `version` selects the payload serialization scheme (see the LEGACY/CANONICAL
 * constants above) and MUST equal the value stored in audit_logs.hash_version
 * for the row, so verifyHashChain() can recompute it exactly.
 */
export function computeHash(
  timestamp: string,
  agentId: string,
  payload: object,
  previousHash: string | null,
  version: number = LEGACY_HASH_VERSION,
): string {
  const serializedPayload =
    version >= CANONICAL_HASH_VERSION ? canonicalStringify(payload) : JSON.stringify(payload);
  const data = `${timestamp}|${agentId}|${serializedPayload}|${previousHash ?? "GENESIS"}`;
  return createHash("sha256").update(data).digest("hex");
}

const HIGH_RISK_KEYWORDS = [
  "access denied",
  "financial transfer",
  "data export",
  "unauthorized",
  "permission",
];

export interface AnomalyResult {
  isAnomalous: boolean;
  anomalyReason: string | null;
  severity: "none" | "medium" | "high";
}

/**
 * Detects anomalies from event type and rationale keywords.
 * Consistency-based anomalies are merged in separately at the call site
 * so the two systems remain independently testable.
 */
export function detectAnomaly(
  eventType: string,
  rationale: string | null | undefined,
  consistencyScore?: number,
  consistencyReasons?: string[],
): AnomalyResult {
  // High-Risk: hallucination detected (intent ≠ action)
  if (consistencyScore !== undefined && consistencyScore < 0.5) {
    const primary = consistencyReasons?.[0] ?? "Intent-action mismatch detected";
    return {
      isAnomalous: true,
      anomalyReason: `HIGH-RISK: Consistency score ${Math.round(consistencyScore * 100)}% — ${primary}`,
      severity: "high",
    };
  }

  if (eventType === "Error") {
    return {
      isAnomalous: true,
      anomalyReason: "Event type is Error",
      severity: "medium",
    };
  }

  if (rationale) {
    const lower = rationale.toLowerCase();
    const matched = HIGH_RISK_KEYWORDS.find((kw) => lower.includes(kw));
    if (matched) {
      return {
        isAnomalous: true,
        anomalyReason: `High-risk keyword detected in rationale: "${matched}"`,
        severity: "medium",
      };
    }
  }

  // Medium-risk: marginal consistency (0.5 ≤ score < 0.75)
  if (consistencyScore !== undefined && consistencyScore < 0.75 && consistencyScore >= 0.5) {
    return {
      isAnomalous: true,
      anomalyReason: `Consistency score ${Math.round(consistencyScore * 100)}% — marginal intent-action alignment`,
      severity: "medium",
    };
  }

  return { isAnomalous: false, anomalyReason: null, severity: "none" };
}
