/**
 * authMiddleware — Sentinel admin guard.
 *
 * Verifies the `X-Sentinel-Key` request header against the
 * `SENTINEL_KEY` environment variable using a constant-time
 * comparison (defends against timing oracles).
 *
 * Black-box failure policy (anti-recon):
 *   Every failure path returns an identical 401 `unauthorized` response.
 *   An outsider cannot distinguish "key not configured" from "key wrong"
 *   from "header missing" — the server reveals no backend state. Internal
 *   distinction is preserved only in the server-side audit log.
 *
 *   • SENTINEL_KEY env var unset/empty      → 401 unauthorized (logged: misconfig)
 *   • X-Sentinel-Key header missing/empty   → 401 unauthorized
 *   • header present but does not match     → 401 unauthorized (logged: bad key)
 *   • header present and matches            → next()
 *
 * Apply via:
 *   app.use(/\/admin\//, authMiddleware);
 *
 * All responses are JSON with explicit Content-Type and Cache-Control: no-store.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../lib/logger";
import { safeCompare } from "../lib/safeCompare";

const HEADER_NAME = "x-sentinel-key";

// Single, opaque rejection used for every failure path. Returning the same
// status, error code, and message regardless of the underlying cause prevents
// an outsider from probing the server's configuration state.
function denyOpaque(res: Response): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(401).json({
    ok: false,
    error: "unauthorized",
    message: "Unauthorized.",
    timestamp: new Date().toISOString(),
  });
}

export const authMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const expected = process.env["SENTINEL_KEY"];

  // Misconfiguration: log loudly server-side, but present an identical 401
  // to the caller so config status doesn't leak.
  if (!expected || expected.length === 0) {
    logger.error(
      { url: req.url, method: req.method },
      "authMiddleware: SENTINEL_KEY env var is not configured — denying (opaque 401)",
    );
    denyOpaque(res);
    return;
  }

  const raw = req.header(HEADER_NAME);
  const provided = typeof raw === "string" ? raw.trim() : "";

  if (provided.length === 0) {
    denyOpaque(res);
    return;
  }

  if (!safeCompare(provided, expected)) {
    logger.warn(
      { url: req.url, method: req.method },
      "authMiddleware: invalid X-Sentinel-Key on admin request",
    );
    denyOpaque(res);
    return;
  }

  next();
};

export default authMiddleware;
