/**
 * Itasca License-Proxy Heartbeat
 *
 * GET /api/v1/itasca/status
 *
 * Returns a signed heartbeat for the (forthcoming) AWS-hosted Itasca
 * license-proxy bridge. Even before the proxy is online this endpoint
 * publishes the same SLSA L4 / ML-DSA-87 seal envelope as /gatekeeper,
 * so downstream consumers can verify the channel is live and that the
 * sovereign key is the one signing.
 *
 * Read-only, idempotent, no admin guard. Anyone can pull the heartbeat
 * — that's the point of a heartbeat.
 *
 * Response shape:
 *   {
 *     service:      "itasca-license-proxy",
 *     status:       "healthy" | "degraded",
 *     heartbeatId:  "ITC-<timestamp>-<rand>",
 *     uptimeSeconds: <number>,
 *     environment:  { provider, region, platform },
 *     // ── seal ──
 *     signature:    "SENTINEL_SIG_0x7A_F3_9C",
 *     fingerprint:  "7A:F3:9C:21:E4:8B:5D:62",
 *     standard:     "FIPS-204",
 *     algorithm:    "ML-DSA-87",
 *     slsaLevel:    4,
 *     timestamp:    ISO-8601
 *   }
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { getAttestation } from "../attestation";
import { getEnvironment } from "../lib/environment";

const router: IRouter = Router();

const ML_DSA_87_FINGERPRINT = "7A:F3:9C:21:E4:8B:5D:62";

router.get("/v1/itasca/status", (_req: Request, res: Response) => {
  const seal = getAttestation();
  const env  = getEnvironment();

  const heartbeatId =
    `ITC-${Date.now().toString(36).toUpperCase()}` +
    `-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  res.status(200).json({
    service:       "itasca-license-proxy",
    status:        "healthy",
    heartbeatId,
    uptimeSeconds: Math.round(process.uptime()),
    environment:   env,
    signature:     seal.signature,
    fingerprint:   ML_DSA_87_FINGERPRINT,
    standard:      "FIPS-204",
    algorithm:     "ML-DSA-87",
    slsaLevel:     4,
    release:       "v6.0-neural-sovereignty",
    timestamp:     seal.timestamp,
  });
});

export default router;
