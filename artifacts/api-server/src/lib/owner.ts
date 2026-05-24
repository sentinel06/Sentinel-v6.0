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
import { and, eq, isNull, isNotNull, sql, type SQL } from "drizzle-orm";
import { isAdminViewer } from "./admin";

export async function resolveOwnerFromKey(req: Request): Promise<string | null> {
  const raw = req.headers["x-sentinel-key"];
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key || !key.startsWith("sk_sent_")) return null;

  const [row] = await db
    .select({ id: partnerKeysTable.id, partnerId: partnerKeysTable.partnerId })
    .from(partnerKeysTable)
    .where(
      and(
        eq(partnerKeysTable.keyValue, key),
        eq(partnerKeysTable.isActive, true),
      ),
    )
    .limit(1);

  if (!row) return null;

  // Stamp lastUsedAt — fire-and-forget (don't block the ingest hot path).
  db.update(partnerKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(partnerKeysTable.id, row.id))
    .catch(() => { /* non-critical — ignore */ });

  return row.partnerId;
}

export function getViewerUserId(req: Request): string | null {
  try {
    return getAuth(req).userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the Drizzle SQL condition that scopes audit_logs to the correct
 * tenant slice for the current viewer.  The return type is the non-optional
 * `SQL` — never `undefined` — so TypeScript guarantees callers always pass a
 * condition to the WHERE clause and can never accidentally omit it.
 *
 * Decision table
 * ──────────────
 * │ Viewer identity          │ SQL produced                              │
 * │──────────────────────────│───────────────────────────────────────────│
 * │ Admin (allowlisted email)│ owner_user_id IS NOT NULL  (all tenants)  │
 * │ Signed-in Clerk user     │ owner_user_id = '<viewerUserId>'          │
 * │ Anonymous / no session   │ FALSE  (zero rows — fail-closed)          │
 *
 * The anonymous branch is a defensive last resort: every endpoint that calls
 * this helper is already mounted behind `requireAuth` (lib/requireAuth.ts),
 * which returns 401 before the route handler runs.  If the guard is ever
 * accidentally removed the fallback still prevents a cross-tenant data leak.
 */
export function viewerScopeCondition(req: Request): SQL {
  // Admins see all real-user data (every tenant), but NEVER the seeded
  // demo slice (owner_user_id IS NULL).
  if (isAdminViewer(req)) return isNotNull(auditLogsTable.ownerUserId);

  // Signed-in users see only their own tenant — strict equality constraint.
  const viewerId = getViewerUserId(req);
  if (viewerId) return eq(auditLogsTable.ownerUserId, viewerId);

  // Fail-closed: unauthenticated requests must never see any rows.
  // requireAuth should have already rejected this request with 401.
  return sql`false`;
}
