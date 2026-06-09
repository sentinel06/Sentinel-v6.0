import { db } from "@workspace/db";
import { auditLogsTable, integrityCheckTable, merkleCheckpointsTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { computeHash, LEGACY_HASH_VERSION } from "./hash";
import { buildMerkleRoot, BLOCK_SIZE } from "./merkle";
import { logger } from "./logger";

/**
 * Group an ordered array of logs into fixed-size blocks.
 */
function groupIntoBlocks<T>(items: T[], blockSize: number): T[][] {
  const blocks: T[][] = [];
  for (let i = 0; i < items.length; i += blockSize) {
    blocks.push(items.slice(i, i + blockSize));
  }
  return blocks;
}

/**
 * Compute and store a Merkle checkpoint for a completed block.
 * Called after every BLOCK_SIZE-th log insert.
 *
 * Block entries are fetched by OFFSET/LIMIT over the immutable timestamp-ordered
 * sequence — no stored block_index column is needed (and the immutability trigger
 * prevents us from writing one after insertion).
 *
 * Leaf hashes are the stored `currentHash` values for each entry in the block.
 * The Merkle root over those leaves is stored as a tamper-evident checkpoint.
 * If any entry's stored hash changes, the recomputed root won't match the
 * checkpoint, surfacing the tamper without a full sequential scan.
 */
export async function sealMerkleBlock(blockIndex: number): Promise<string | null> {
  const offset = blockIndex * BLOCK_SIZE;

  const entries = await db
    .select({ currentHash: auditLogsTable.currentHash })
    .from(auditLogsTable)
    .orderBy(asc(auditLogsTable.timestamp))
    .limit(BLOCK_SIZE)
    .offset(offset);

  if (entries.length === 0) return null;

  const leafHashes = entries.map((e) => e.currentHash);
  const merkleRoot = buildMerkleRoot(leafHashes);

  await db
    .insert(merkleCheckpointsTable)
    .values({
      blockIndex,
      blockStart: offset,
      blockEnd: offset + entries.length - 1,
      entryCount: entries.length,
      merkleRoot,
    })
    .onConflictDoNothing();

  logger.info(
    { blockIndex, entryCount: entries.length, merkleRoot: merkleRoot.slice(0, 16) + "…" },
    "Merkle checkpoint sealed for block",
  );

  return merkleRoot;
}

/**
 * Two-phase integrity verification:
 *
 * Phase 1 — Merkle sweep (fast, O(b log n) where b = number of blocks)
 *   Recomputes each block's Merkle root from stored leaf hashes and compares
 *   against the checkpoint. A mismatch means ≥1 entry in the block was changed.
 *   This phase can be run at high frequency without full table scans.
 *
 * Phase 2 — Sequential chain walk (targeted, only on suspect blocks)
 *   Within any block that failed Phase 1, walks every entry in order and
 *   recomputes H_n = SHA256(timestamp | agentId | payload | H_{n-1}).
 *   Pinpoints the exact tampered row(s).
 *
 * For blocks with no stored checkpoint yet (the latest partial block),
 * the sequential walk is always performed.
 */
export async function verifyHashChain(): Promise<{
  ok: boolean;
  totalChecked: number;
  tamperDetected: boolean;
  tamperedEntries: string[];
  message: string;
  merkleBlocksChecked: number;
  merkleBlocksFailed: number;
}> {
  const allLogs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(asc(auditLogsTable.timestamp));

  if (allLogs.length === 0) {
    return {
      ok: true,
      totalChecked: 0,
      tamperDetected: false,
      tamperedEntries: [],
      message: "No audit log entries to verify.",
      merkleBlocksChecked: 0,
      merkleBlocksFailed: 0,
    };
  }

  const checkpoints = await db.select().from(merkleCheckpointsTable).orderBy(asc(merkleCheckpointsTable.blockIndex));
  const checkpointMap = new Map(checkpoints.map((c) => [c.blockIndex, c.merkleRoot]));

  const blocks = groupIntoBlocks(allLogs, BLOCK_SIZE);
  const tamperedEntries: string[] = [];
  let previousHash: string | null = null;
  let merkleBlocksChecked = 0;
  let merkleBlocksFailed = 0;

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const leafHashes = block.map((e) => e.currentHash);
    const storedRoot = checkpointMap.get(blockIdx);
    let blockNeedsDetailedScan = false;

    // ── Phase 1: Merkle root check (fast) ─────────────────────────────────
    if (storedRoot !== undefined) {
      merkleBlocksChecked++;
      const recomputedRoot = buildMerkleRoot(leafHashes);

      if (recomputedRoot !== storedRoot) {
        merkleBlocksFailed++;
        blockNeedsDetailedScan = true;
        logger.warn(
          { blockIdx, expected: storedRoot.slice(0, 16), actual: recomputedRoot.slice(0, 16) },
          "Merkle root mismatch — block failed Phase 1",
        );
      }
    } else {
      // No checkpoint yet (partial block at the tail) — always do detailed scan
      blockNeedsDetailedScan = true;
    }

    // ── Phase 2: Sequential chain walk (targeted) ──────────────────────────
    // Always walk to maintain the inter-block previousHash cursor,
    // but only collect tampered entries for blocks that need it.
    for (const log of block) {
      // Recompute under the row's own hash scheme: legacy (v1/NULL) demo and
      // simulation rows verify with JSON.stringify, while new canonical (v2)
      // chains verify with sorted-key serialization.
      const expectedHash = computeHash(
        log.timestamp.toISOString(),
        log.agentId,
        log.payload as object,
        previousHash,
        log.hashVersion ?? LEGACY_HASH_VERSION,
      );

      if (blockNeedsDetailedScan) {
        if (log.currentHash !== expectedHash) {
          tamperedEntries.push(log.id);
          logger.warn(
            { logId: log.id, blockIdx, expected: expectedHash.slice(0, 16), actual: log.currentHash.slice(0, 16) },
            "Hash mismatch — sequential chain broken",
          );
        } else if (log.previousHash !== previousHash) {
          tamperedEntries.push(log.id);
          logger.warn({ logId: log.id, blockIdx }, "Previous-hash pointer tampered");
        }
      }

      previousHash = log.currentHash;
    }
  }

  const tamperDetected = tamperedEntries.length > 0;
  const result = {
    ok: !tamperDetected,
    totalChecked: allLogs.length,
    tamperDetected,
    tamperedEntries,
    message: tamperDetected
      ? `TAMPER ALERT: ${tamperedEntries.length} entry(ies) failed verification across ${merkleBlocksFailed} Merkle block(s)`
      : `Verified: ${allLogs.length} entries across ${merkleBlocksChecked} sealed Merkle block(s) — chain intact`,
    merkleBlocksChecked,
    merkleBlocksFailed,
  };

  await db.insert(integrityCheckTable).values({
    totalChecked: String(result.totalChecked),
    tamperDetected: result.tamperDetected,
    tamperedEntries: result.tamperedEntries,
    message: result.message,
  });

  return result;
}

/**
 * Hourly integrity scheduler.
 * Runs 5 s after startup (to allow DB connections to warm up),
 * then every hour thereafter.
 */
export function startIntegrityScheduler(): void {
  const INTERVAL_MS = 60 * 60 * 1000;

  const run = async () => {
    logger.info("Running scheduled hash chain + Merkle integrity verification");
    try {
      const result = await verifyHashChain();
      if (result.tamperDetected) {
        logger.error(
          { tamperedEntries: result.tamperedEntries, merkleBlocksFailed: result.merkleBlocksFailed },
          "TAMPER ALERT: Hash chain integrity compromised",
        );
      } else {
        logger.info(
          { totalChecked: result.totalChecked, merkleBlocksChecked: result.merkleBlocksChecked },
          "Integrity verified OK",
        );
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
