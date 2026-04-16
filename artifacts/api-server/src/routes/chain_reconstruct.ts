/**
 * Sovereign Ledger Reconstruction Protocol
 *
 * POST /v1/admin/chain-reconstruct
 *
 * Performs an in-place SHA-256 chain recalculation over the entire audit_logs
 * table, then reseals all Merkle checkpoints.  This restores ledger integrity
 * after a seeding incident where entries were written with an incorrect hash
 * function (SHA-512) or wrong chain format.
 *
 * Safety:
 *   - Disabled the immutability trigger only for the duration of this
 *     operation (single transaction, re-enabled in finally block).
 *   - Only available in development (NODE_ENV !== "production").
 *   - Requires the X-Sovereign-Reconstruct: true header as an extra guard.
 */

import { Router } from "express";
import { asc, sql } from "drizzle-orm";
import { db, auditLogsTable, merkleCheckpointsTable } from "@workspace/db";
import { computeHash } from "../lib/hash.js";
import { buildMerkleRoot, BLOCK_SIZE } from "../lib/merkle.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/v1/admin/chain-reconstruct", async (req, res): Promise<void> => {
  // ── Guard: dev-only ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Reconstruction is disabled in production." });
    return;
  }
  if (req.headers["x-sovereign-reconstruct"] !== "true") {
    res.status(400).json({ error: "Missing required X-Sovereign-Reconstruct: true header." });
    return;
  }

  const startedAt = Date.now();
  logger.info("Sovereign Ledger Reconstruction Protocol — INITIATED");

  try {
    // ── 1. Fetch all entries in canonical order ───────────────────────────
    const allEntries = await db
      .select()
      .from(auditLogsTable)
      .orderBy(asc(auditLogsTable.timestamp));

    if (allEntries.length === 0) {
      res.json({ status: "NOTHING_TO_RECONSTRUCT", totalEntries: 0 });
      return;
    }

    // ── 2. Build the corrected hash chain in memory ───────────────────────
    let previousHash: string | null = null;
    const updates: { id: string; currentHash: string; previousHash: string | null }[] = [];

    for (const entry of allEntries) {
      const correctHash = computeHash(
        entry.timestamp.toISOString(),
        entry.agentId,
        entry.payload as object,
        previousHash,
      );
      updates.push({ id: entry.id, currentHash: correctHash, previousHash });
      previousHash = correctHash;
    }

    // ── 3. Suspend immutability trigger & apply updates ───────────────────
    //    We use raw SQL so Drizzle's type layer doesn't interfere, and we wrap
    //    everything in a transaction so a partial failure rolls back cleanly.
    let entriesPatched = 0;

    await db.transaction(async (tx) => {
      // Disable trigger for this session (SECURITY NOTE: restored in finally)
      await tx.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER ALL`);

      try {
        // Apply hash corrections in batches of 100
        const BATCH = 100;
        for (let i = 0; i < updates.length; i += BATCH) {
          const chunk = updates.slice(i, i + BATCH);
          for (const u of chunk) {
            await tx.execute(
              sql`UPDATE audit_logs
                  SET current_hash  = ${u.currentHash},
                      previous_hash = ${u.previousHash}
                  WHERE id = ${u.id}`
            );
          }
          entriesPatched += chunk.length;
        }
      } finally {
        // ALWAYS re-enable the trigger — even if the loop throws
        await tx.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER ALL`);
      }
    });

    logger.info({ entriesPatched }, "Hash chain corrected — trigger re-enabled");

    // ── 4. Wipe stale Merkle checkpoints ─────────────────────────────────
    await db.delete(merkleCheckpointsTable);
    logger.info("Stale Merkle checkpoints cleared");

    // ── 5. Reseal completed Merkle blocks ─────────────────────────────────
    //    Re-fetch entries (now with corrected hashes) and seal each full block.
    const freshEntries = await db
      .select({ id: auditLogsTable.id, currentHash: auditLogsTable.currentHash })
      .from(auditLogsTable)
      .orderBy(asc(auditLogsTable.timestamp));

    const totalBlocks = Math.floor(freshEntries.length / BLOCK_SIZE);
    let blocksSealedCount = 0;

    for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
      const offset = blockIdx * BLOCK_SIZE;
      const block  = freshEntries.slice(offset, offset + BLOCK_SIZE);
      const leafHashes = block.map((e) => e.currentHash);
      const merkleRoot = buildMerkleRoot(leafHashes);

      await db.insert(merkleCheckpointsTable).values({
        blockIndex: blockIdx,
        blockStart: offset,
        blockEnd:   offset + block.length - 1,
        entryCount: block.length,
        merkleRoot,
      });

      blocksSealedCount++;
      logger.info(
        { blockIdx, entryCount: block.length, root: merkleRoot.slice(0, 16) + "…" },
        "Merkle block resealed",
      );
    }

    const durationMs = Date.now() - startedAt;

    logger.info(
      { entriesPatched, blocksSealedCount, durationMs },
      "Sovereign Ledger Reconstruction Protocol — COMPLETE",
    );

    res.json({
      status:          "SOVEREIGN_VERIFIED",
      entriesPatched,
      blocksResealed:  blocksSealedCount,
      partialTailSize: freshEntries.length - totalBlocks * BLOCK_SIZE,
      totalEntries:    freshEntries.length,
      durationMs,
      message:
        `Chain reconstructed. ${entriesPatched} hashes corrected using ` +
        `SHA-256(timestamp|agentId|payload|prevHash). ` +
        `${blocksSealedCount} Merkle block(s) resealed. ` +
        `Trigger re-enabled. Run POST /api/v1/integrity/verify to confirm.`,
    });
  } catch (err: any) {
    logger.error({ err }, "Chain reconstruction FAILED");
    // Best-effort: try to re-enable the trigger if something went wrong outside the tx
    try {
      await db.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER ALL`);
    } catch {}
    res.status(500).json({ error: "Reconstruction failed", detail: err?.message });
  }
});

export default router;
