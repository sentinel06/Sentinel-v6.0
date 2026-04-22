/**
 * authMiddleware — Sentinel admin guard.
 *
 * Verifies the `X-Sentinel-Key` request header against the
 * `SENTINEL_KEY` environment variable using a constant-time
 * comparison (defends against timing oracles).
 *
 * Behavior:
 *   • SENTINEL_KEY env var is unset/empty   → 503 (server misconfigured)
 *   • X-Sentinel-Key header missing/empty   → 401 unauthorized
 *   • header present but does not match     → 403 forbidden
 *   • header present and matches            → next()
 *
 * Apply via:
 *   app.use(/\/admin\//, authMiddleware);
 *
 * All responses are JSON with explicit Content-Type and Cache-Control: no-store.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";

const HEADER_NAME = "x-sentinel-key";

function reject(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(status).json({
    ok: false,
    error: code,
    message,
    timestamp: new Date().toISOString(),
  });
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // still call timingSafeEqual on equal-length buffers to keep timing flat
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export const authMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const expected = process.env["SENTINEL_KEY"];
  if (!expected || expected.length === 0) {
    logger.error(
      { url: req.url, method: req.method },
      "authMiddleware: SENTINEL_KEY env var is not configured — rejecting admin request",
    );
    reject(
      res,
      503,
      "auth_not_configured",
      "Admin authentication is not configured on this server. SENTINEL_KEY env var is missing.",
    );
    return;
  }

  const raw = req.header(HEADER_NAME);
  const provided = typeof raw === "string" ? raw.trim() : "";

  if (provided.length === 0) {
    reject(
      res,
      401,
      "missing_sentinel_key",
      "Admin route requires the X-Sentinel-Key header.",
    );
    return;
  }

  if (!safeEqual(provided, expected)) {
    logger.warn(
      { url: req.url, method: req.method },
      "authMiddleware: invalid X-Sentinel-Key on admin request",
    );
    reject(
      res,
      403,
      "invalid_sentinel_key",
      "X-Sentinel-Key did not match the configured admin key.",
    );
    return;
  }

  next();
};

export default authMiddleware;
