/**
 * Per-tenant ownership resolution.
 *
 * Two ways an event can be attributed to a Clerk user:
 *   1. The request carries `X-Sentinel-Key` matching a row in `partner_keys`
 *      (provisioned by /v1/me/key) — use that row's partner_id (= Clerk userId).
 *   2. The request carries a Clerk session (browser dashboard reads) —
 *      use req.auth().userId via @clerk/express getAuth().
 *
 * Returns null when the request is the legacy SENTINEL_KEY admin path or
 * fully unauthenticated. Null-owned data is the demo / system slice and is
 * never shown to a signed-in dashboard user.
 */

import type { Request } from "express";
import { getAuth } from "@clerk/express";
import { db, partnerKeysTable, auditLogsTable } from "@workspace/db";
import { and, eq, isNull, isNotNull, type SQL } from "drizzle-orm";
import { isAdminViewer } from "./admin";

export async function resolveOwnerFromKey(req: Request): Promise<string | null> {
  const raw = req.headers["x-sentinel-key"];
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key || !key.startsWith("sk_sent_")) return null;

  const [row] = await db
    .select({ partnerId: partnerKeysTable.partnerId })
    .from(partnerKeysTable)
    .where(
      and(
        eq(partnerKeysTable.keyValue, key),
        eq(partnerKeysTable.isActive, true),
      ),
    )
    .limit(1);

  return row?.partnerId ?? null;
}

export function getViewerUserId(req: Request): string | null {
  try {
    return getAuth(req).userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the Drizzle SQL condition that scopes audit_logs to the right slice
 * for the current viewer:
 *   - Signed-in viewer  → owner_user_id = viewer.userId  (their tenant)
 *   - Anonymous viewer  → owner_user_id IS NULL          (public demo slice)
 *
 * Compose with `and(...)` alongside any other filters. This is intentionally
 * a single condition (never `undefined`) so callers can't forget to apply it
 * and accidentally leak cross-tenant rows.
 */
export function viewerScopeCondition(req: Request): SQL {
  // Admins see all real-user data (every tenant), but NEVER the seeded
  // demo slice (owner_user_id IS NULL). The demo slice stays visible to
  // anonymous viewers on the public landing surface only.
  if (isAdminViewer(req)) return isNotNull(auditLogsTable.ownerUserId);

  const viewerId = getViewerUserId(req);
  return viewerId
    ? eq(auditLogsTable.ownerUserId, viewerId)
    : isNull(auditLogsTable.ownerUserId);
}
