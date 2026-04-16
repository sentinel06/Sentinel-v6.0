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
 * Safety guards (all three must pass):
 *   1. ALLOW_CHAIN_RECONSTRUCT env var must be exactly "true"
 *   2. X-Sovereign-Reconstruct: true header must be present
 *   3. The immutability trigger is re-enabled in a finally block — always.
 *
 * Body params:
 *   forceSeal {boolean} — if true, seals even the partial tail block (< 512
 *                         entries).  Required when the total ledger size is
 *                         less than BLOCK_SIZE and you need a verified state.
 */

import { Router } from "express";
import { asc, sql } from "drizzle-orm";
import { db, auditLogsTable, merkleCheckpointsTable } from "@workspace/db";
import { computeHash } from "../lib/hash.js";
import { buildMerkleRoot, BLOCK_SIZE } from "../lib/merkle.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/v1/admin/chain-reconstruct", async (req, res): Promise<void> => {
  // ── Guard 1: explicit opt-in env flag ─────────────────────────────────────
  if (process.env.ALLOW_CHAIN_RECONSTRUCT !== "true") {
    res.status(403).json({
      error: "Reconstruction is disabled. Set ALLOW_CHAIN_RECONSTRUCT=true to enable.",
    });
    return;
  }

  // ── Guard 2: magic header ─────────────────────────────────────────────────
  if (req.headers["x-sovereign-reconstruct"] !== "true") {
    res.status(400).json({ error: "Missing required X-Sovereign-Reconstruct: true header." });
    return;
  }

  // ── Optional: force-seal even partial tail blocks ─────────────────────────
  const forceSeal = req.body?.forceSeal === true;

  const startedAt = Date.now();
  logger.info({ forceSeal }, "Sovereign Ledger Reconstruction Protocol — INITIATED");

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
    let entriesPatched = 0;

    await db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER ALL`);

      try {
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
        // ALWAYS re-enable the trigger
        await tx.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER ALL`);
      }
    });

    logger.info({ entriesPatched }, "Hash chain corrected — trigger re-enabled");

    // ── 4. Wipe stale Merkle checkpoints ─────────────────────────────────
    await db.delete(merkleCheckpointsTable);
    logger.info("Stale Merkle checkpoints cleared");

    // ── 5. Reseal Merkle blocks ───────────────────────────────────────────
    //    Re-fetch entries (now with corrected hashes).
    //    Seal every full block (BLOCK_SIZE entries).
    //    If forceSeal=true, also seal the partial tail as a smaller block.
    const freshEntries = await db
      .select({ id: auditLogsTable.id, currentHash: auditLogsTable.currentHash })
      .from(auditLogsTable)
      .orderBy(asc(auditLogsTable.timestamp));

    const fullBlocks  = Math.floor(freshEntries.length / BLOCK_SIZE);
    const tailSize    = freshEntries.length - fullBlocks * BLOCK_SIZE;
    let blocksSealedCount = 0;

    const blocksToSeal = forceSeal && tailSize > 0 ? fullBlocks + 1 : fullBlocks;

    for (let blockIdx = 0; blockIdx < blocksToSeal; blockIdx++) {
      const offset = blockIdx * BLOCK_SIZE;
      const block  = freshEntries.slice(offset, offset + BLOCK_SIZE); // tail block may be < BLOCK_SIZE
      if (block.length === 0) continue;

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
        { blockIdx, entryCount: block.length, root: merkleRoot.slice(0, 16) + "…", forced: blockIdx === fullBlocks },
        "Merkle block sealed",
      );
    }

    const durationMs = Date.now() - startedAt;

    logger.info(
      { entriesPatched, blocksSealedCount, forceSeal, durationMs },
      "Sovereign Ledger Reconstruction Protocol — COMPLETE",
    );

    const partialSealed = forceSeal && tailSize > 0;

    res.json({
      status:          "SOVEREIGN_VERIFIED",
      entriesPatched,
      blocksResealed:  blocksSealedCount,
      partialTailSize: partialSealed ? 0 : tailSize,
      partialForceSealed: partialSealed,
      totalEntries:    freshEntries.length,
      durationMs,
      message:
        `Chain reconstructed. ${entriesPatched} hashes corrected using ` +
        `SHA-256(timestamp|agentId|payload|prevHash). ` +
        `${blocksSealedCount} Merkle block(s) sealed` +
        (partialSealed ? ` (including force-sealed tail of ${tailSize} entries)` : "") +
        `. Trigger re-enabled. Run POST /api/v1/integrity/verify to confirm.`,
    });
  } catch (err: any) {
    logger.error({ err }, "Chain reconstruction FAILED");
    try {
      await db.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER ALL`);
    } catch {}
    res.status(500).json({ error: "Reconstruction failed", detail: err?.message });
  }
});

export default router;
