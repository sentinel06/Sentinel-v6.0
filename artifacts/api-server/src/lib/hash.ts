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

export function computeHash(
  timestamp: string,
  agentId: string,
  payload: object,
  previousHash: string | null,
): string {
  const data = `${timestamp}|${agentId}|${JSON.stringify(payload)}|${previousHash ?? "GENESIS"}`;
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
