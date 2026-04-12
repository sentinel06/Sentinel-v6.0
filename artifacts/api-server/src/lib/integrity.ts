import { db } from "@workspace/db";
import { auditLogsTable, integrityCheckTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { computeHash } from "./hash";
import { logger } from "./logger";

export async function verifyHashChain(): Promise<{
  ok: boolean;
  totalChecked: number;
  tamperDetected: boolean;
  tamperedEntries: string[];
  message: string;
}> {
  const allLogs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(asc(auditLogsTable.timestamp));

  const tamperedEntries: string[] = [];
  let previousHash: string | null = null;

  for (const log of allLogs) {
    const expectedHash = computeHash(
      log.timestamp.toISOString(),
      log.agentId,
      log.payload as object,
      previousHash,
    );

    if (log.currentHash !== expectedHash) {
      tamperedEntries.push(log.id);
      logger.warn({ logId: log.id, expectedHash, actualHash: log.currentHash }, "Hash mismatch detected");
    }

    if (log.previousHash !== previousHash) {
      if (!tamperedEntries.includes(log.id)) {
        tamperedEntries.push(log.id);
      }
    }

    previousHash = log.currentHash;
  }

  const tamperDetected = tamperedEntries.length > 0;
  const result = {
    ok: !tamperDetected,
    totalChecked: allLogs.length,
    tamperDetected,
    tamperedEntries,
    message: tamperDetected
      ? `TAMPER ALERT: ${tamperedEntries.length} entry(ies) failed hash chain verification`
      : `Hash chain verified: ${allLogs.length} entries are intact`,
  };

  await db.insert(integrityCheckTable).values({
    totalChecked: String(result.totalChecked),
    tamperDetected: result.tamperDetected,
    tamperedEntries: result.tamperedEntries,
    message: result.message,
  });

  return result;
}

export function startIntegrityScheduler(): void {
  const INTERVAL_MS = 60 * 60 * 1000;

  const run = async () => {
    logger.info("Running scheduled hash chain integrity verification");
    try {
      const result = await verifyHashChain();
      if (result.tamperDetected) {
        logger.error({ tamperedEntries: result.tamperedEntries }, "TAMPER ALERT: Hash chain integrity compromised");
      } else {
        logger.info({ totalChecked: result.totalChecked }, "Hash chain integrity verified OK");
      }
    } catch (err) {
      logger.error({ err }, "Hash chain verification failed");
    }
  };

  setTimeout(() => {
    run();
    setInterval(run, INTERVAL_MS);
  }, 5000);
}
