/**
 * Attestation Route — JSON surface for the Sentinel v6.0 sovereign seal.
 *
 * GET /v1/attestation
 *
 * Returns the static envelope (algorithm, standard, slsaLevel, release,
 * environment, fingerprint) plus a real ML-DSA-87 signature bound to the
 * service name "attestation".
 */

import { Router, type IRouter } from "express";
import { getEnvironment } from "../lib/environment";
import {
  signWithContext,
  getPublicKeyFingerprint,
  SENTINEL_ALGORITHM,
  SENTINEL_STANDARD,
} from "../lib/crypto";

const router: IRouter = Router();

const SERVICE_NAME = "attestation" as const;
const ENVIRONMENT_METADATA = getEnvironment();
const FINGERPRINT = getPublicKeyFingerprint();

router.get("/v1/attestation", (_req, res): void => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const payload = {
    status:      "verified" as const,
    timestamp:   new Date().toISOString(),
    environment: ENVIRONMENT_METADATA,
    fingerprint: FINGERPRINT,
    standard:    SENTINEL_STANDARD,
    algorithm:   SENTINEL_ALGORITHM,
    slsaLevel:   4,
    release:     "v6.0-neural-sovereignty",
  };

  res.status(200).json({
    ...payload,
    service:   SERVICE_NAME,
    signature: signWithContext(SERVICE_NAME, payload),
  });
});

export default router;
