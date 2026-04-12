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

export function detectAnomaly(
  eventType: string,
  rationale: string | null | undefined,
): { isAnomalous: boolean; anomalyReason: string | null } {
  if (eventType === "Error") {
    return { isAnomalous: true, anomalyReason: "Event type is Error" };
  }

  if (rationale) {
    const lower = rationale.toLowerCase();
    const matched = HIGH_RISK_KEYWORDS.find((kw) => lower.includes(kw));
    if (matched) {
      return {
        isAnomalous: true,
        anomalyReason: `High-risk keyword detected in rationale: "${matched}"`,
      };
    }
  }

  return { isAnomalous: false, anomalyReason: null };
}
