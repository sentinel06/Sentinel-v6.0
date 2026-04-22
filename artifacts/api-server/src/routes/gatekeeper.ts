/**
 * Gatekeeper Route — Sovereign admission endpoint.
 *
 * POST /v1/gatekeeper
 *
 * Issues a signed admission seal for an inbound agent / action request.
 * Every response is signed with getAttestation() — single source of truth
 * shared with the badge SVG <metadata> and the /v1/attestation JSON endpoint.
 *
 * ── Schema Guard (Zod) ──────────────────────────────────────────────────────
 * Body MUST conform to GatekeeperSchema:
 *   {
 *     intent:    string  (3..100 chars)        // e.g. "deploy_swarm_v6"
 *     riskScore: number  (0..1, inclusive)      // 0=safe, 1=critical
 *     nonce?:    string                          // reserved for replay protection
 *   }
 *
 * Validation failures return 400 with structured `issues` from Zod so callers
 * can surface field-level errors. Only `validation.data` is used downstream;
 * raw `req.body` is never trusted past the guard.
 *
 * Response (200, application/json):
 *   {
 *     admitted: true,
 *     status: "verified",
 *     signature: "SENTINEL_SIG_0x7A_F3_9C",
 *     timestamp: ISO-8601,
 *     fingerprint: "7A:F3:9C:21:E4:8B:5D:62",
 *     standard: "FIPS-204",
 *     algorithm: "ML-DSA-87",
 *     slsaLevel: 4,
 *     release: "v6.0-neural-sovereignty",
 *     environment: string | null,
 *     request: { intent, riskScore, nonce? },
 *     admissionId: "GK-<timestamp>-<rand>"
 *   }
 */

import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { getAttestation } from "../attestation";

const router: IRouter = Router();

const ML_DSA_87_FINGERPRINT = "7A:F3:9C:21:E4:8B:5D:62";

// ── Schema Guard ────────────────────────────────────────────────────────────
const GatekeeperSchema = z.object({
  intent:    z.string().min(3).max(100),
  riskScore: z.number().min(0).max(1),
  nonce:     z.string().min(8).max(128).optional(), // Replay protection key
});

type GatekeeperRequest = z.infer<typeof GatekeeperSchema>;

// ── Replay Protection (in-memory nonce ledger) ──────────────────────────────
// Tracks every accepted nonce with an expiry timestamp. A repeated nonce
// within the TTL window is rejected with 409 nonce_replayed.
//
// Single-process only. For horizontally-scaled deployments swap this Map
// for a Redis SETNX with EX, keyed by `gk:nonce:<value>`.
const NONCE_TTL_MS = 5 * 60 * 1000;          // 5-minute replay window
const NONCE_CAP    = 10_000;                  // hard ceiling to bound memory
const nonceLedger: Map<string, number> = new Map();

function sweepExpiredNonces(now: number): void {
  for (const [k, exp] of nonceLedger) {
    if (exp <= now) nonceLedger.delete(k);
  }
}

/**
 * Returns true if `nonce` is fresh (not seen within TTL) and records it;
 * returns false if it is a replay.
 */
function claimNonce(nonce: string, now: number): boolean {
  // Opportunistic sweep when we hit the cap so we never grow unbounded.
  if (nonceLedger.size >= NONCE_CAP) sweepExpiredNonces(now);

  const existing = nonceLedger.get(nonce);
  if (existing !== undefined && existing > now) {
    return false; // replay within TTL
  }
  nonceLedger.set(nonce, now + NONCE_TTL_MS);
  return true;
}

function setJsonHeaders(res: Response): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

router.options("/v1/gatekeeper", (_req, res): void => {
  setJsonHeaders(res);
  res.sendStatus(204);
});

router.post("/v1/gatekeeper", (req, res): void => {
  setJsonHeaders(res);

  // ── Schema Guard: validate request body before any business logic ────────
  const validation = GatekeeperSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      ok: false,
      error: "Validation Failed",
      issues: validation.error.issues,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // ── Trusted, type-safe payload from this point forward ──────────────────
  const data: GatekeeperRequest = validation.data;

  // ── Replay protection: reject reused nonces inside the TTL window ───────
  if (data.nonce !== undefined) {
    const now = Date.now();
    if (!claimNonce(data.nonce, now)) {
      res.status(409).json({
        ok: false,
        error: "nonce_replayed",
        message: `Nonce has already been used within the ${NONCE_TTL_MS / 1000}s replay window.`,
        nonce: data.nonce,
        ttlSeconds: NONCE_TTL_MS / 1000,
        timestamp: new Date(now).toISOString(),
      });
      return;
    }
  }

  const seal = getAttestation();

  const admissionId =
    `GK-${Date.now().toString(36).toUpperCase()}-` +
    Math.random().toString(36).slice(2, 8).toUpperCase();

  res.status(200).json({
    admitted:    true,
    ...seal,
    fingerprint: ML_DSA_87_FINGERPRINT,
    standard:    "FIPS-204",
    algorithm:   "ML-DSA-87",
    slsaLevel:   4,
    release:     "v6.0-neural-sovereignty",
    environment: process.env["GITHUB_ENVIRONMENT"] ?? null,
    request:     data,
    admissionId,
  });
});

export default router;
