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

interface AdminCacheEntry { isAdmin: boolean; email: string | null }
const adminCache = new Map<string, AdminCacheEntry>();

async function resolveIdentity(userId: string): Promise<AdminCacheEntry> {
  const cached = adminCache.get(userId);
  if (cached) return cached;
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    );
    const email = (primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null);
    const emailLower = email?.toLowerCase() ?? null;
    const isAdmin = emailLower !== null && ADMIN_EMAILS.includes(emailLower);
    const entry: AdminCacheEntry = { isAdmin, email: emailLower };
    adminCache.set(userId, entry);
    return entry;
  } catch {
    return { isAdmin: false, email: null };
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
      const id = await resolveIdentity(auth.userId);
      req.isAdmin = id.isAdmin;
      req.viewerEmail = id.email;
    } else {
      req.isAdmin = false;
      req.viewerEmail = null;
    }
  } catch {
    req.isAdmin = false;
    req.viewerEmail = null;
  }
  next();
}

export function isAdminViewer(req: Request): boolean {
  return req.isAdmin === true;
}

export function getViewerEmail(req: Request): string | null {
  return req.viewerEmail ?? null;
}

declare global {
  namespace Express {
    interface Request {
      isAdmin?: boolean;
      viewerEmail?: string | null;
    }
  }
}
