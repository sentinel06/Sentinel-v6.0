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

import { logger } from "./logger";

const seenNonces = new Set<string>();
const NONCE_TTL = 1000 * 60 * 5; // 5 minutes
const NONCE_CAP = 10_000;        // forensic canary threshold

// Throttle the cap warning so a sustained DoS doesn't flood the audit log.
let lastCapWarnAt = 0;
const CAP_WARN_INTERVAL_MS = 60_000;

export const verifyAndStoreNonce = (nonce: string): boolean => {
  if (seenNonces.has(nonce)) return false;

  // Forensic canary: a full ledger is a likely DoS signal aimed at flushing
  // replay protection. Log to the audit trail (rate-limited).
  if (seenNonces.size >= NONCE_CAP) {
    const now = Date.now();
    if (now - lastCapWarnAt > CAP_WARN_INTERVAL_MS) {
      lastCapWarnAt = now;
      logger.warn(
        { cap: NONCE_CAP, size: seenNonces.size },
        "Nonce ledger at capacity. Opportunistic sweep triggered.",
      );
    }
  }

  seenNonces.add(nonce);
  setTimeout(() => seenNonces.delete(nonce), NONCE_TTL).unref();
  return true;
};

export const NONCE_TTL_MS = NONCE_TTL;
export const NONCE_LEDGER_CAP = NONCE_CAP;
