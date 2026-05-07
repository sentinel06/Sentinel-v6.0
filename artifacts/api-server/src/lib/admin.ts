/**
 * Admin viewer resolution.
 *
 * An admin is a signed-in Clerk user whose primary email is on the
 * SENTINEL_ADMIN_EMAILS allowlist (comma-separated env var). Admins
 * bypass per-tenant data scoping — they see every audit row regardless
 * of `owner_user_id`, including the public/demo slice.
 *
 * Resolution is performed once per request by `attachAdminFlag`
 * middleware, which stamps `req.isAdmin` so downstream handlers can
 * read it synchronously. We cache the email lookup per Clerk userId so
 * we only hit Clerk once per user per process lifetime.
 */

import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";

const ADMIN_EMAILS = (process.env.SENTINEL_ADMIN_EMAILS ?? "afaiz9078@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const adminCache = new Map<string, boolean>();

async function resolveIsAdmin(userId: string): Promise<boolean> {
  if (adminCache.has(userId)) return adminCache.get(userId)!;
  try {
    const user = await clerkClient.users.getUser(userId);
    const emails = user.emailAddresses.map((e) => e.emailAddress.toLowerCase());
    const isAdmin = emails.some((e) => ADMIN_EMAILS.includes(e));
    adminCache.set(userId, isAdmin);
    return isAdmin;
  } catch {
    return false;
  }
}

export async function attachAdminFlag(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuth(req);
    if (auth.userId) {
      req.isAdmin = await resolveIsAdmin(auth.userId);
    } else {
      req.isAdmin = false;
    }
  } catch {
    req.isAdmin = false;
  }
  next();
}

export function isAdminViewer(req: Request): boolean {
  return req.isAdmin === true;
}

declare global {
  namespace Express {
    interface Request {
      isAdmin?: boolean;
    }
  }
}
