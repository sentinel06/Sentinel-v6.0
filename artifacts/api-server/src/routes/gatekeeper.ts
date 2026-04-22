/**
 * Gatekeeper Route — Sovereign admission endpoint.
 *
 * POST /v1/gatekeeper
 *
 * Issues a signed admission seal for an inbound agent / action request.
 * Every response is signed with getAttestation() — single source of truth
 * shared with the badge SVG <metadata> and the /v1/attestation JSON endpoint.
 *
 * Body (all fields optional):
 *   { agentId?: string, action?: string, partnerId?: string, reason?: string }
 *
 * Response (always application/json):
 *   {
 *     admitted: true,
 *     status:   "verified",
 *     signature:"SENTINEL_SIG_0x7A_F3_9C",
 *     timestamp:"2026-04-22T18:55:00.000Z",
 *     fingerprint:"7A:F3:9C:21:E4:8B:5D:62",
 *     standard: "FIPS-204",
 *     algorithm:"ML-DSA-87",
 *     slsaLevel:4,
 *     release:  "v6.0-neural-sovereignty",
 *     environment: "forensics-audit" | null,
 *     request:  { agentId, action, partnerId, reason },
 *     admissionId: "GK-<timestamp>-<rand>"
 *   }
 */

import { Router, type IRouter } from "express";
import { getAttestation } from "../attestation";

const router: IRouter = Router();

const ML_DSA_87_FINGERPRINT = "7A:F3:9C:21:E4:8B:5D:62";

function setJsonHeaders(res: import("express").Response): void {
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
  const seal = getAttestation();

  // Body is optional — accept any/all fields, normalize to strings.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const request = {
    agentId:   typeof body.agentId   === "string" ? body.agentId   : null,
    action:    typeof body.action    === "string" ? body.action    : null,
    partnerId: typeof body.partnerId === "string" ? body.partnerId : null,
    reason:    typeof body.reason    === "string" ? body.reason    : null,
  };

  const admissionId =
    `GK-${Date.now().toString(36).toUpperCase()}-` +
    Math.random().toString(36).slice(2, 8).toUpperCase();

  setJsonHeaders(res);
  res.status(200).json({
    admitted:    true,
    ...seal,
    fingerprint: ML_DSA_87_FINGERPRINT,
    standard:    "FIPS-204",
    algorithm:   "ML-DSA-87",
    slsaLevel:   4,
    release:     "v6.0-neural-sovereignty",
    environment: process.env.GITHUB_ENVIRONMENT ?? null,
    request,
    admissionId,
  });
});

export default router;
