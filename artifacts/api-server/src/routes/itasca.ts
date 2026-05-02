/**
 * Itasca License-Proxy Heartbeat — Eager Refresh edition.
 *
 * GET /api/v1/itasca/status
 *
 * Strategy: an internal setInterval pre-signs a fresh heartbeat every
 * REFRESH_INTERVAL_MS (900ms). The route handler simply ships the
 * pre-serialized buffer back to the caller — no signing, no JSON.stringify,
 * no env lookup on the hot path. Sub-millisecond per request.
 *
 * Cold start: the very first request awaits the initial sign (one-time
 * cost ~5ms). After that, every request reads the cached buffer directly.
 *
 * Service-name binding: payload is signed with "itasca-license-proxy" via
 * lib/crypto's signWithContext, so an itasca-bound signature can never
 * validate as a gatekeeper admission.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { getEnvironment } from "../lib/environment";
import {
  signWithContext,
  getPublicKeyFingerprint,
  SENTINEL_ALGORITHM,
  SENTINEL_STANDARD,
} from "../lib/crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SERVICE_NAME = "itasca-license-proxy" as const;
const REFRESH_INTERVAL_MS = 900;

// Module-level snapshots — never change during process lifetime.
const ENVIRONMENT_METADATA = getEnvironment();
const FINGERPRINT = getPublicKeyFingerprint();

// Pre-signed envelope buffer. Updated by the refresh loop.
let currentBody: Buffer | null = null;
let initialSignPromise: Promise<void>;

async function refreshHeartbeat(): Promise<void> {
  const timestamp = new Date().toISOString();
  const heartbeatId =
    `ITC-${Date.now().toString(36).toUpperCase()}` +
    `-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const payload = {
    service:       SERVICE_NAME,
    status:        "healthy" as const,
    heartbeatId,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp,
    environment:   ENVIRONMENT_METADATA,
  };

  const signature = await signWithContext(SERVICE_NAME, payload);

  const body = JSON.stringify({
    ...payload,
    fingerprint: FINGERPRINT,
    standard:    SENTINEL_STANDARD,
    algorithm:   SENTINEL_ALGORITHM,
    slsaLevel:   4,
    release:     "v6.0-neural-sovereignty",
    signature,
  });

  currentBody = Buffer.from(body, "utf-8");
}

// Kick off initial sign and start the refresh loop.
initialSignPromise = refreshHeartbeat().catch((err) => {
  logger.error({ err }, "itasca initial heartbeat sign failed");
});

const refreshTimer = setInterval(() => {
  refreshHeartbeat().catch((err) => {
    logger.error({ err }, "itasca heartbeat refresh failed");
  });
}, REFRESH_INTERVAL_MS);
refreshTimer.unref();

router.get("/v1/itasca/status", async (_req: Request, res: Response): Promise<void> => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=1");

  if (!currentBody) {
    // Cold start — wait for the very first sign to complete.
    await initialSignPromise;
  }

  if (!currentBody) {
    // Still null means the initial sign rejected. Fail loudly.
    res.status(503).json({
      ok: false,
      error: "heartbeat_not_ready",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.setHeader("X-Sentinel-Cache", "eager");
  res.status(200).send(currentBody);
});

export default router;
