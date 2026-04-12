/**
 * Cold Storage Archiver
 *
 * Strategy: every ARCHIVE_BLOCK_SIZE rows (default 10,000), seal the block:
 *   1. Fetch all rows in the block ordered by timestamp
 *   2. Compute a block digest: SHA-256 over all concatenated currentHash values
 *   3. HMAC-SHA256 sign the digest with SESSION_SECRET for tamper-evident export
 *   4. Write a JSON archive file to disk (can be replaced with S3/GCS upload)
 *   5. Record the seal in archive_seals table
 *
 * Hot window: the live GET /v1/logs endpoint defaults to the last 30 days.
 * Archived data is still queryable via the DB — the archive file is an
 * additional cold-storage backup, not a replacement.
 *
 * Production extension: replace writeArchiveFile() with an S3 PutObject call.
 */

import { createHash, createHmac } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { db } from "@workspace/db";
import { auditLogsTable, archiveSealsTable } from "@workspace/db";
import { asc, eq, count } from "drizzle-orm";
import { logger } from "./logger";

export const ARCHIVE_BLOCK_SIZE = 10_000;
export const HOT_WINDOW_DAYS = 30;

const ARCHIVE_DIR = join(process.cwd(), "archives");

/**
 * Compute a block-level SHA-256 digest by concatenating all entry hashes.
 * This produces a single fingerprint for the entire block.
 */
function computeBlockDigest(hashes: string[]): string {
  return createHash("sha256").update(hashes.join("|")).digest("hex");
}

/**
 * HMAC-SHA256 sign the digest with the SESSION_SECRET.
 * If SESSION_SECRET is not set, a fixed fallback key is used (dev only).
 */
function signDigest(digest: string): string {
  const secret = process.env["SESSION_SECRET"] ?? "sentinel-dev-secret-do-not-use-in-production";
  return createHmac("sha256", secret).update(digest).digest("hex");
}

async function writeArchiveFile(
  blockIndex: number,
  archiveData: object,
): Promise<string> {
  await mkdir(ARCHIVE_DIR, { recursive: true });
  const filename = `archive-block-${String(blockIndex).padStart(6, "0")}.json`;
  const filepath = join(ARCHIVE_DIR, filename);
  await writeFile(filepath, JSON.stringify(archiveData, null, 2), "utf8");
  return filepath;
}

/**
 * Seal a completed archive block.
 * Called when row count crosses a ARCHIVE_BLOCK_SIZE multiple.
 *
 * Returns null if the block is already sealed (idempotent).
 */
export async function sealArchiveBlock(blockIndex: number): Promise<{
  filepath: string;
  digest: string;
  signature: string;
  entryCount: number;
} | null> {
  // Idempotency check
  const existing = await db
    .select({ id: archiveSealsTable.id })
    .from(archiveSealsTable)
    .where(eq(archiveSealsTable.blockIndex, blockIndex))
    .limit(1);

  if (existing.length > 0) {
    logger.info({ blockIndex }, "Archive block already sealed — skipping");
    return null;
  }

  const offset = blockIndex * ARCHIVE_BLOCK_SIZE;

  const rows = await db
    .select()
    .from(auditLogsTable)
    .orderBy(asc(auditLogsTable.timestamp))
    .limit(ARCHIVE_BLOCK_SIZE)
    .offset(offset);

  if (rows.length === 0) return null;

  const hashes = rows.map((r) => r.currentHash);
  const digest = computeBlockDigest(hashes);
  const signature = signDigest(digest);

  const archiveData = {
    meta: {
      blockIndex,
      blockStart: offset,
      blockEnd: offset + rows.length - 1,
      entryCount: rows.length,
      sealedAt: new Date().toISOString(),
      digest,
      signature,
      signatureAlgorithm: "HMAC-SHA256",
      note: "Verify by recomputing SHA-256 over all currentHash values joined with '|', then HMAC-SHA256 with your SESSION_SECRET.",
    },
    entries: rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp.toISOString(),
      agentId: r.agentId,
      traceId: r.traceId,
      eventType: r.eventType,
      payload: r.payload,
      rationale: r.rationale,
      currentHash: r.currentHash,
      previousHash: r.previousHash,
      isAnomalous: r.isAnomalous,
      anomalyReason: r.anomalyReason,
      consistencyScore: r.consistencyScore,
      consistencyReasons: r.consistencyReasons,
    })),
  };

  const filepath = await writeArchiveFile(blockIndex, archiveData);

  await db.insert(archiveSealsTable).values({
    blockIndex,
    blockStart: offset,
    blockEnd: offset + rows.length - 1,
    entryCount: rows.length,
    digest,
    signature,
    archivePath: filepath,
  });

  logger.info(
    { blockIndex, entryCount: rows.length, digest: digest.slice(0, 16) + "…", filepath },
    "Archive block sealed",
  );

  return { filepath, digest, signature, entryCount: rows.length };
}

/**
 * Check if a new log insert crosses an archive block boundary,
 * and if so, trigger sealing asynchronously.
 * Call this after every successful INSERT.
 */
export async function checkAndSealArchive(totalRowsAfterInsert: number): Promise<void> {
  if (totalRowsAfterInsert % ARCHIVE_BLOCK_SIZE === 0) {
    const completedBlock = Math.floor((totalRowsAfterInsert - 1) / ARCHIVE_BLOCK_SIZE);
    sealArchiveBlock(completedBlock).catch((err) => {
      logger.error({ err, blockIndex: completedBlock }, "Failed to seal archive block");
    });
  }
}
