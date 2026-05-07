# Agent-Sentinel

Agent-Sentinel provides an immutable audit ledger system for AI agents, ensuring traceability and accountability for AI systems.

## Run & Operate

- `pnpm run typecheck`: Full typecheck across all packages.
- `pnpm run build`: Typecheck and build all packages.
- `pnpm --filter @workspace/api-spec run codegen`: Regenerate API hooks and Zod schemas from OpenAPI spec.
- `pnpm --filter @workspace/db run push`: Push DB schema changes (development only).
- `pnpm --filter @workspace/api-server run dev`: Run API server locally.
- `pnpm --filter @workspace/sentinel-dashboard run dev`: Run dashboard locally.
- `pnpm --filter @workspace/scripts run breach`: Run Apex-Fintech 3-stage breach simulation.

**Environment Variables:**
- `SENTINEL_KEY`: API key for authentication (e.g., `X-Sentinel-Key` header). If not set, all `POST` requests are allowed (dev mode).

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **WebSockets**: `ws` package
- **Frontend**: React + Vite

## Where things live

- **Backend API Server**: `artifacts/api-server`
- **Frontend Dashboard**: `artifacts/sentinel-dashboard`
- **Database Schema**: `lib/db` (defines `audit_logs` and `integrity_checks` tables)
- **API Specifications**: `artifacts/api-spec` (OpenAPI spec for codegen)
- **White Paper Generation Service**: `artifacts/api-server/src/services/whitepaper_gen.ts`
- **Sentinel-Bridge SDK (Python)**: `sdk/sentinel_bridge.py`
- **Main CSS Theming**: `artifacts/sentinel-dashboard/src/index.css`
- **Partner Onboarding Guide**: `docs/partner_onboarding_guide.md`
- **Swarm Map Visualizations**: `artifacts/sentinel-dashboard/src/pages/swarmmap.tsx`

## Architecture decisions

- **Immutable Audit Ledger**: `audit_logs` table prevents `UPDATE` and `DELETE` via PostgreSQL triggers to ensure data integrity compliant with EU AI Act Article 12.
- **Hash Chaining for Integrity**: Each log entry incorporates a SHA-256 hash of its critical data and the previous hash, forming a tamper-proof chain.
- **API Key for Secure Ingestion**: Audit log submission requires an API key (`X-Sentinel-Key`) for authenticated access, with a dev mode fallback.
- **Dynamic White Paper Generation**: A technical white paper is generated dynamically from the live system state, ensuring up-to-date documentation.
- **Sovereign Gateway for Agent Governance**: A dedicated API (`/api/v1/gateway`) and Python SDK provide an infrastructure-level governance layer for external AI agents, including registration, pre-flight checks, telemetry ingestion, and liveness pings.
- **Hardened Security UI (Command Center)**: Dashboard-wide aesthetic driven by tokens in `index.css`. Obsidian `#050505` bg + 20px grid; semantic accents are **cyan `#00F5FF`** (health/active), **amber `#FFB800`** (warnings), **crimson `#FF003C`** (blocks). All cards use the `.glass-panel` utility (`@layer components` so Tailwind utilities can override). New page mounts use `.page-transition`. Three live health widgets in `src/components/widgets/` (Lattice gauge, Redis sparkline, Worker Threads). System Frequency wave lives in the top bar.
- **Per-Tenant Data Isolation**: `audit_logs.owner_user_id` (nullable, indexed) carries the Clerk userId of whoever owns each row. Stamped on insert in `routes/logs.ts` (POST /v1/log) and `routes/gateway.ts` via `lib/owner.ts:resolveOwnerFromKey()` (looks up `X-Sentinel-Key` in `partner_keys`). Every tenant-scoped read endpoint mounts `requireAuth` (`lib/requireAuth.ts`) inline — anonymous requests get a 401, so visitors must sign up to see any tenant data. Authenticated requests then compose `viewerScopeCondition(req)` from `lib/owner.ts` into their WHERE clause. Rule: admin → `owner_user_id IS NOT NULL` (every real tenant, never the demo slice); signed-in viewer → `owner_user_id = userId`. The seeded demo rows (Apex-Fintech, etc.) physically remain in the table because the immutable-ledger trigger blocks DELETE, but they're invisible from every code path. Endpoints under the guard: `/v1/logs`, `/v1/logs/:id`, `/v1/traces/:traceId`, `/v1/stats`, `/v1/agents`, `/v1/compliance/export`, `/v1/registry` (GET + POST + PATCH), `/v1/forensic/*`, `/v1/governance/confirm-fix`, `/v1/forensic/kill-switch-log`, `/v1/topology/:traceId` and `/v1/topology/:traceId/diff/:edgeId`, `/v1/authorize/:id/status` and `/v1/authorize/:id/resolve`, `/v1/authorize/pending`, `/v1/authorize/history`, `/v1/partner/keys` (GET + POST), `/v1/partner/keys/:keyId/revoke`, `/v1/compliance/executive-summary`, `/v1/compliance/audit-report`, `POST /v1/swarm/sessions`, `POST /v1/swarm/revoke-tree/:agentId`. The auth-request, topology, and partner-compliance routes scope by joining `traceId` / `partnerId` / `ownerEmail` back to `audit_logs.ownerUserId` (admins see any non-NULL trace; users only their own). `POST /v1/registry` and `POST /v1/partner/keys` derive owner identity from the viewer (admins may pass explicit overrides); `PATCH /v1/registry/:agentId` and `PATCH /v1/partner/keys/:keyId/revoke` 404 if the row isn't owned by the viewer and refuse ownership reassignment for non-admins. `POST /v1/forensic/kill-switch-log` and `POST /v1/swarm/revoke-tree/:agentId` probe `audit_logs` for the agent under viewer scope before writing. `/v1/admin/kill-switch` (GET + POST) and `POST /v1/admin/chain-reconstruct` are admin-only via `isAdminViewer(req)` (403 otherwise) — kill-switch flips the global lockdown; chain-reconstruct rewrites every audit-log hash. `GET /v1/partner/health` and `GET /v1/partner/quantum-audit` are gated and force the partner identifier to the viewer's email for non-admins. `GET /v1/partner/onboarding` accepts either the Golden demo key (returns platform-wide systemStats) or any active partner key (systemStats are scoped to that partner's agents only). `GET /v1/export/audit-pdf` requires auth and threads `viewerScopeCondition(req)` through `generateAuditPDF()` so the exported document only ever contains the caller's tenant rows. The marketing landing page is pure static copy and does not hit any of these. Platform-wide metrics (integrity/quantum, swarm map, status, pulse, whitepaper) intentionally remain public.
- **Onboarding**: Sign-up `fallbackRedirectUrl` points at `/onboarding`. The page (`pages/onboarding.tsx`) auto-provisions the user's Sentinel key on mount, shows it once with copy buttons, plus tabbed Python SDK + curl snippets. Dashboard renders an empty-state ("Connect your first agent" → `/onboarding`) when `stats.totalLogs === 0`.
- **Sentinel Assistant (AI support)**: Floating chat widget (`components/support-widget.tsx`) mounted globally inside `Layout`. Streams responses from `POST /api/v1/support/chat` (SSE, `routes/support.ts`) backed by Claude (`claude-sonnet-4-6`) via Replit AI Integrations (`AI_INTEGRATIONS_ANTHROPIC_*` env vars, `@anthropic-ai/sdk`). Stateless — full conversation history is sent on every turn (capped to last 20 turns). System prompt embeds product knowledge (onboarding flow, SDK + curl snippets, hash chain, gateway, common errors) so the assistant can resolve most user issues without escalation.
- **Admin Override**: `lib/admin.ts` exposes `attachAdminFlag` middleware (mounted in `app.ts` after Clerk) which stamps `req.isAdmin` and `req.viewerEmail` when the signed-in user's email is on the `SENTINEL_ADMIN_EMAILS` allowlist (comma-separated env var, defaults to `afaiz9078@gmail.com`). For admins, `viewerScopeCondition` returns `isNotNull(owner_user_id)` — they see every real-user tenant but NEVER the seeded demo slice (NULL owner). The demo rows physically remain in `audit_logs` (immutable trigger blocks DELETE) but are unreachable from any code path. `/v1/registry` (Governance Registry) applies the same scope on `ownerEmail`: admin → `LIKE '%@%'` (excludes demo rows like `ownerEmail = "Apex-Fintech"`); user → equals their own email; anonymous → 401 (route is mounted behind `requireAuth`). Identity (admin flag + primary email) is cached per Clerk userId for the process lifetime.
- **Auth (Clerk)**: Replit-managed Clerk instance. Dashboard wraps everything in `ClerkProvider` (`src/App.tsx`) with the `shadcn` base theme overridden to the Command Center palette; `/sign-in/*` and `/sign-up/*` mount Clerk's `<SignIn>` / `<SignUp>` components, all other routes are gated by a `<Protected>` wrapper that redirects signed-out users to `/sign-in`. The landing page (`/`) stays public. The publishable key is read straight from `VITE_CLERK_PUBLISHABLE_KEY` — do **not** use `publishableKeyFromHost`, it synthesizes a junk `clerk.localhost` host and breaks dev. `clerkProxyMiddleware` is mounted on the API server but only runs when `NODE_ENV === "production"`. Identity chip (email + sign-out) is rendered in the top bar via `ClerkUserChip` in `src/components/layout.tsx`.

## Product

- **Immutable Audit Ledger**: Records all agent actions and decisions, compliant with EU AI Act Article 12.
- **Real-time Monitoring Dashboard**: Live stream of audit logs, agent activity, and system statistics.
- **Compliance Reporting**: Generates exportable compliance reports for agents within specified timeframes.
- **Hash Chain Integrity Verification**: Automatically and manually verifies the integrity of the audit log hash chain.
- **Anomaly Detection**: Automatically flags potential issues based on event types and rationale content.
- **AI Agent Governance (Sentinel-Bridge SDK)**: Provides tools for registering, monitoring, and controlling external AI agents, including drift detection and interdiction.
- **Dynamic Technical White Paper**: Generates an on-demand technical white paper reflecting the current system state.
- **Interactive Swarm Map**: Visualizes the lifecycle and health of AI agents, including evolutionary dynamics, mutations, and interventions.

## User preferences

- _Populate as you build_

## Gotchas

- **API Key in Dev Mode**: If `SENTINEL_KEY` is not set, all `POST` requests to the API are allowed, which is a security risk in production environments.
- **DB Schema Push**: `pnpm --filter @workspace/db run push` is for development only and should not be used in production directly.
- **Anomaly Rationale Keywords**: Anomaly detection relies on specific keywords in the rationale (`"Access Denied", "Financial Transfer"`, etc.), which may require updates if new anomaly types emerge.
- **Mobile Swarm Map Optimizations**: Mobile optimizations (e.g., simplified mutation filters, label filtering) mean the visual experience differs significantly from desktop.

## Pointers

- **EU AI Act Article 12**: [Link to relevant EU AI Act documentation]
- **Drizzle ORM Documentation**: [Link to Drizzle ORM docs]
- **Zod Documentation**: [Link to Zod docs]
- **Orval Documentation**: [Link to Orval docs]
- **pnpm Workspaces Documentation**: [Link to pnpm workspaces docs]
- **Express.js Documentation**: [Link to Express docs]