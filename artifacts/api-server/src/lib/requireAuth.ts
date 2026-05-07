/**
 * Per-route auth guard for tenant-scoped endpoints.
 *
 * Returns 401 unless the request carries a valid Clerk session (resolved
 * by `clerkMiddleware` upstream). Anonymous viewers are not a supported
 * audience — visitors must sign up to see any tenant data.
 *
 * Mount inline on each tenant-scoped route handler:
 *   router.get("/v1/logs", requireAuth, async (req, res) => { ... });
 *
 * Public endpoints (landing-page assets, support chat handshake, platform
 * metrics like `/v1/integrity/quantum`, `/v1/pulse/*`, `/v1/status`) do
 * NOT mount this guard.
 */

import type { Request, Response, NextFunction } from "express";
import { getViewerUserId } from "./owner";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (getViewerUserId(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized", message: "Sign in to view this resource." });
}
