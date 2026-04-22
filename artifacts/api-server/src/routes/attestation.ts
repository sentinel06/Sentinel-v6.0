/**
 * Attestation Route — JSON surface for the Sentinel v6.0 sovereign seal.
 *
 * GET /v1/attestation       → { status, signature, timestamp, environment, fingerprint }
 *
 * Calls getAttestation() from src/attestation.ts so the SAME signature surfaces
 * across the CLI, the badge SVG <title>, and this JSON endpoint — single source
 * of truth for the v6.0 release seal.
 */

import { Router, type IRouter } from "express";
import { getAttestation } from "../attestation";

const router: IRouter = Router();

const ML_DSA_87_FINGERPRINT = "7A:F3:9C:21:E4:8B:5D:62";

router.get("/v1/attestation", (_req, res): void => {
  const seal = getAttestation();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).json({
    ...seal,
    environment:  process.env.GITHUB_ENVIRONMENT ?? null,
    fingerprint:  ML_DSA_87_FINGERPRINT,
    standard:     "FIPS-204",
    algorithm:    "ML-DSA-87",
    slsaLevel:    4,
    release:      "v6.0-neural-sovereignty",
  });
});

export default router;
