---
name: Per-tenant isolation pattern
description: How audit_logs rows are scoped to Clerk users, and the canonical gate pattern for read endpoints.
---

**Schema:** `audit_logs.owner_user_id` (nullable, indexed). NULL = demo/system/legacy rows — never shown to signed-in users.

**Write path:** `resolveOwnerFromKey(req)` in `lib/owner.ts` looks up `X-Sentinel-Key` in `partner_keys`, returns the `partner_id` (Clerk userId) or null. Stamp `ownerUserId` on every INSERT in logs.ts and gateway.ts.

**Read path — the canonical three-file pattern:**
1. Mount `requireAuth` middleware on the route — returns 401 before handler runs for unauthenticated callers.
2. Call `viewerScopeCondition(req)` inside the handler — returns a Drizzle `SQL` object, never undefined.
3. Add that condition to the WHERE clause.

**Decision table for viewerScopeCondition:**
- Admin (SENTINEL_ADMIN_EMAILS) → `owner_user_id IS NOT NULL` (all tenants, never demo)
- Signed-in Clerk user → `owner_user_id = viewerUserId`
- Anonymous (should never reach here past requireAuth) → `false` (zero rows, fail-closed)

**Demo rows are permanently invisible** to signed-in users because they have `owner_user_id = NULL`, and viewerScopeCondition never emits `IS NULL`. The immutable trigger prevents DELETE, but the rows are unreachable from any code path.

**Platform-wide metrics** (integrity checks, system pulse, whitepaper, badge, healthz) intentionally bypass viewerScopeCondition — they describe the platform, not a tenant.

**Key files:** `artifacts/api-server/src/lib/owner.ts`, `lib/db/src/schema/auditLogs.ts` (ownerUserId field + index), `artifacts/api-server/src/lib/requireAuth.ts`, `artifacts/api-server/src/lib/admin.ts` (SENTINEL_ADMIN_EMAILS).
