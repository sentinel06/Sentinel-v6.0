/**
 * Nonce Manager — in-memory replay-attack lockdown.
 *
 * Single-process, zero-dependency. Each accepted nonce is held in a Set
 * for NONCE_TTL ms; a setTimeout schedules its removal. Repeated nonces
 * inside the window are rejected.
 *
 * Trade-offs (single-instance Replit deployment):
 *   • No cross-process coordination. If you ever scale horizontally,
 *     swap the Set for `Redis SETNX gk:nonce:<value> EX 300`.
 *   • setTimeout handles are not tracked — Node's timer wheel cleans
 *     them up after fire. Memory is bounded by request rate × TTL.
 */

const seenNonces = new Set<string>();
const NONCE_TTL = 1000 * 60 * 5; // 5 minutes

export const verifyAndStoreNonce = (nonce: string): boolean => {
  if (seenNonces.has(nonce)) return false;
  seenNonces.add(nonce);
  setTimeout(() => seenNonces.delete(nonce), NONCE_TTL).unref();
  return true;
};

export const NONCE_TTL_MS = NONCE_TTL;
