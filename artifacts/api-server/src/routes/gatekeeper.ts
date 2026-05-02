/**
 * Gatekeeper Route — Sovereign admission endpoint.
 *
 * POST /v1/gatekeeper
 *
 * Issues a real ML-DSA-87 signed admission seal for an inbound request.
 * The signature is bound to the service name "gatekeeper" via
 * signWithContext(), so an itasca-bound signature can never be replayed
 * here and vice versa.
 *
 * ── Pipeline ───────────────────────────────────────────────────────────────
 *   1. Zod schema guard       → 400 invalid_payload
 *   2. Anti-downgrade check   → 422 security_downgrade_blocked
 *   3. Nonce replay check     → 409 nonce_replayed
 *   4. Sign payload (ML-DSA-87 with service binding)
 *   5. Return signed envelope → 200
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { verifyAndStoreNonce, NONCE_TTL_MS } from "../lib/nonce";
import { getEnvironment } from "../lib/environment";
import {
  signWithContext,
  getPublicKeyFingerprint,
  SENTINEL_ALGORITHM,
  SENTINEL_STANDARD,
} from "../lib/crypto";

const router: IRouter = Router();

const SERVICE_NAME = "gatekeeper" as const;

const SENSITIVE_INTENTS = [
  "kill_switch",
  "override",
  "admin",
  "reconstruct",
];

// Module-level caches — captured once, reused per request to avoid
// redundant env parsing and SHA-256 recomputation on the hot path.
const ENVIRONMENT_METADATA = getEnvironment();
const FINGERPRINT = getPublicKeyFingerprint();

const GatekeeperSchema = z.object({
  intent:    z.string().min(3).max(100),
  riskScore: z.number().min(0).max(1),
  nonce:     z.string().min(8).max(128).optional(),
});

type GatekeeperRequest = z.infer<typeof GatekeeperSchema>;

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

router.post("/v1/gatekeeper", async (req: Request, res: Response): Promise<void> => {
  setJsonHeaders(res);

  // 1. Schema guard
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

  const data: GatekeeperRequest = validation.data;

  // 2. Anti-downgrade — sensitive intents must carry a nonce
  if (
    !data.nonce &&
    SENSITIVE_INTENTS.some((kw) => data.intent.includes(kw))
  ) {
    res.status(422).json({
      ok: false,
      error: "security_downgrade_blocked",
      detail: "Nonce mandatory for high-stakes intents.",
      intent: data.intent,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 3. Replay protection (await — backend may be Redis or memory)
  if (data.nonce) {
    const fresh = await verifyAndStoreNonce(data.nonce);
    if (!fresh) {
      res.status(409).json({
        ok: false,
        error: "nonce_replayed",
        detail: "Nonce already consumed.",
        nonce: data.nonce,
        ttlSeconds: NONCE_TTL_MS / 1000,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }

  // 4. Build & sign the admission envelope
  const timestamp = new Date().toISOString();
  const admissionId =
    `GK-${Date.now().toString(36).toUpperCase()}-` +
    Math.random().toString(36).slice(2, 8).toUpperCase();

  // The payload that gets signed — service-bound via signWithContext
  const payload = {
    admitted:    true,
    status:      "verified",
    timestamp,
    admissionId,
    request:     data,
    environment: ENVIRONMENT_METADATA,
  };

  const signature = await signWithContext(SERVICE_NAME, payload);

  // 5. Respond with the signed envelope
  res.status(200).json({
    ...payload,
    fingerprint: FINGERPRINT,
    standard:    SENTINEL_STANDARD,
    algorithm:   SENTINEL_ALGORITHM,
    slsaLevel:   4,
    release:     "v6.0-neural-sovereignty",
    service:     SERVICE_NAME,
    signature,
  });
});

export default router;
