/**
 * Itasca License-Proxy Heartbeat
 *
 * GET /api/v1/itasca/status
 *
 * Returns a real ML-DSA-87 signed heartbeat. Service name "itasca-license-proxy"
 * is bound into the signature so it can never validate as a gatekeeper admission.
 *
 * ── 1-second signature cache ──────────────────────────────────────────────
 * ML-DSA-87 signing is the heaviest op on this hot path (~1-3ms). For a
 * heartbeat that only needs second-level freshness, we sign at most once
 * per second and serve the cached envelope to every other request that
 * arrives in the same window. Under autocannon load (≥1k req/s) this drops
 * the per-request CPU cost from full sign → memcpy.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { getEnvironment } from "../lib/environment";
import {
  signWithContext,
  getPublicKeyFingerprint,
  SENTINEL_ALGORITHM,
  SENTINEL_STANDARD,
} from "../lib/crypto";

const router: IRouter = Router();

const SERVICE_NAME = "itasca-license-proxy" as const;
const CACHE_TTL_MS = 1_000;

// Module-level snapshots — env never changes, fingerprint never changes.
const ENVIRONMENT_METADATA = getEnvironment();
const FINGERPRINT = getPublicKeyFingerprint();

interface CachedHeartbeat {
  body: string;       // pre-serialized JSON to skip stringify on cache hit
  expiresAt: number;  // epoch ms
}

let cached: CachedHeartbeat | null = null;

function buildHeartbeatBody(): string {
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

  const signature = signWithContext(SERVICE_NAME, payload);

  return JSON.stringify({
    ...payload,
    fingerprint: FINGERPRINT,
    standard:    SENTINEL_STANDARD,
    algorithm:   SENTINEL_ALGORITHM,
    slsaLevel:   4,
    release:     "v6.0-neural-sovereignty",
    signature,
  });
}

router.get("/v1/itasca/status", (_req: Request, res: Response): void => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    // Cache hit — serve stale heartbeat with browser-cache hint matching TTL.
    res.setHeader("Cache-Control", "public, max-age=1");
    res.setHeader("X-Sentinel-Cache", "hit");
    res.status(200).send(cached.body);
    return;
  }

  // Cache miss — re-sign and refresh.
  const body = buildHeartbeatBody();
  cached = { body, expiresAt: now + CACHE_TTL_MS };
  res.setHeader("Cache-Control", "public, max-age=1");
  res.setHeader("X-Sentinel-Cache", "miss");
  res.status(200).send(body);
});

export default router;
