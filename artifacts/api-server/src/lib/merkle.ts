import { createHash } from "crypto";

/**
 * Block size for Merkle tree grouping.
 * 512 is a power-of-two that gives clean binary trees.
 * At 1,000 events/sec, a block fills in ~0.5s.
 * Verification of any single block is O(log2 512) = 9 hash operations.
 */
export const BLOCK_SIZE = 512;

/**
 * Hash two child nodes together to produce a parent node.
 * If there is no right child (odd leaf count), the left child is doubled —
 * this is the standard Bitcoin-style Merkle padding.
 */
function hashPair(left: string, right: string): string {
  return createHash("sha256")
    .update(left + right)
    .digest("hex");
}

/**
 * Build a Merkle root from an ordered list of leaf hashes.
 *
 * Structure (4 leaves example):
 *
 *         ROOT
 *        /    \
 *      AB      CD
 *     /  \   /  \
 *    A    B C    D
 *
 * Returns the root hash string.
 * Throws if leaves array is empty.
 */
export function buildMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    throw new Error("Cannot build Merkle root from empty leaf set");
  }

  if (leafHashes.length === 1) {
    return leafHashes[0];
  }

  let level = [...leafHashes];

  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left; // duplicate last leaf when odd
      nextLevel.push(hashPair(left, right));
    }
    level = nextLevel;
  }

  return level[0];
}

/**
 * Generate the Merkle proof path for a specific leaf index.
 * The proof is an ordered list of sibling hashes that, combined with
 * the leaf hash, allow reconstruction of the root without the full tree.
 *
 * Verification: O(log n)
 */
export function getMerkleProof(
  leafHashes: string[],
  leafIndex: number,
): { siblingHash: string; position: "left" | "right" }[] {
  if (leafIndex < 0 || leafIndex >= leafHashes.length) {
    throw new Error(`Leaf index ${leafIndex} out of range [0, ${leafHashes.length})`);
  }

  const proof: { siblingHash: string; position: "left" | "right" }[] = [];
  let level = [...leafHashes];
  let index = leafIndex;

  while (level.length > 1) {
    const nextLevel: string[] = [];

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      nextLevel.push(hashPair(left, right));

      if (i === index || i + 1 === index) {
        if (index % 2 === 0) {
          // current node is left child — sibling is right
          proof.push({ siblingHash: right, position: "right" });
        } else {
          // current node is right child — sibling is left
          proof.push({ siblingHash: left, position: "left" });
        }
      }
    }

    index = Math.floor(index / 2);
    level = nextLevel;
  }

  return proof;
}

/**
 * Verify a Merkle proof against a known root.
 * Returns true if the proof is valid.
 *
 * O(log n) — does not require access to the full log set.
 */
export function verifyMerkleProof(
  leafHash: string,
  proof: { siblingHash: string; position: "left" | "right" }[],
  expectedRoot: string,
): boolean {
  let current = leafHash;

  for (const step of proof) {
    if (step.position === "right") {
      current = hashPair(current, step.siblingHash);
    } else {
      current = hashPair(step.siblingHash, current);
    }
  }

  return current === expectedRoot;
}
