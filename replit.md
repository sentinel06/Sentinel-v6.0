# MaroShield

MaroShield provides an immutable audit ledger system for AI agents, ensuring traceability and accountability for AI systems.

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
- **MaroShield-Bridge SDK (Python)**: `sdk/sentinel_bridge.py`
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
- **Onboarding**: Sign-up `fallbackRedirectUrl` points at `/onboarding`. The page (`pages/onboarding.tsx`) auto-provisions the user's MaroShield key on mount, shows it once with copy buttons, plus tabbed Python SDK + curl snippets. Dashboard renders an empty-state ("Connect your first agent" → `/onboarding`) when `stats.totalLogs === 0`.
- **API Key Settings page** (`/settings`): Persistent key-management page accessible from "Account → API Key & Settings" in the sidebar. Shows masked key by default; eye icon reveals full plaintext. Copy-to-clipboard button. Regenerate section with two-step confirmation (warns about revocation before proceeding). Uses `GET /api/v1/me/key` on mount; `POST /api/v1/me/key` for reveal; `POST /api/v1/me/key/regenerate` for rotation.
- **React Error Boundary**: `components/ErrorBoundary.tsx` (class component) wraps all authenticated routes inside `<Layout>`. A rendering crash in any page shows a "RENDER FAULT DETECTED" panel with error message and a Retry button instead of a blank white screen. Tour overlay (`SovereignInduction`) is suppressed on `/onboarding`, `/settings`, `/sign-in`, `/sign-up` so it never blocks critical flows.
- **MaroShield Assistant (AI support)**: Floating chat widget (`components/support-widget.tsx`) mounted globally inside `Layout`. Streams responses from `POST /api/v1/support/chat` (SSE, `routes/support.ts`) backed by Claude (`claude-sonnet-4-6`) via Replit AI Integrations (`AI_INTEGRATIONS_ANTHROPIC_*` env vars, `@anthropic-ai/sdk`). Stateless — full conversation history is sent on every turn (capped to last 20 turns). System prompt embeds product knowledge (onboarding flow, SDK + curl snippets, hash chain, gateway, common errors, all four support channels + SLAs) so the assistant can resolve most user issues without escalation.
- **Support & Escalation (`/support`)**: Dedicated page (`pages/support.tsx`) that shows the four support channels (Partner Support < 2 h, Security Incidents < 30 min, Compliance Queries < 4 h, Sovereign Key Issues < 1 h) and a triage form. Submitting calls `POST /api/v1/support/triage` which uses Claude to classify the message into one of four categories (`partner` | `security` | `compliance` | `sovereign_key`), assigns the correct routing email + SLA, sets urgency (`critical` | `high` | `normal`), and drafts an automated first response. Returns a structured ticket (`ticketId`, `category`, `routingEmail`, `sla`, `urgency`, `escalationRequired`, `autoResponse`, `submittedAt`). Security/critical tickets show an inline escalation banner with a direct link to the War Room. A static breach escalation path (Kill Switch → EMERGENCY_SOLO_REVOKE → security@... → preserve forensic IDs) is always visible at the bottom. Accessible from the sidebar under Account → Support & Escalation. Clerk-auth required; rate-limited at 20 req/min per user (shared with the chat rate limiter).
- **Admin Override**: `lib/admin.ts` exposes `attachAdminFlag` middleware (mounted in `app.ts` after Clerk) which stamps `req.isAdmin` and `req.viewerEmail` when the signed-in user's email is on the `SENTINEL_ADMIN_EMAILS` allowlist (comma-separated env var, defaults to `afaiz9078@gmail.com`). For admins, `viewerScopeCondition` returns `isNotNull(owner_user_id)` — they see every real-user tenant but NEVER the seeded demo slice (NULL owner). The demo rows physically remain in `audit_logs` (immutable trigger blocks DELETE) but are unreachable from any code path. `/v1/registry` (Governance Registry) applies the same scope on `ownerEmail`: admin → `LIKE '%@%'` (excludes demo rows like `ownerEmail = "Apex-Fintech"`); user → equals their own email; anonymous → 401 (route is mounted behind `requireAuth`). Identity (admin flag + primary email) is cached per Clerk userId for the process lifetime.
- **Auth (Clerk)**: Replit-managed Clerk instance. Dashboard wraps everything in `ClerkProvider` (`src/App.tsx`) with the `shadcn` base theme overridden to the Command Center palette; `/sign-in/*` and `/sign-up/*` mount Clerk's `<SignIn>` / `<SignUp>` components, all other routes are gated by a `<Protected>` wrapper that redirects signed-out users to `/sign-in`. The landing page (`/`) stays public. The publishable key is read straight from `VITE_CLERK_PUBLISHABLE_KEY` — do **not** use `publishableKeyFromHost`, it synthesizes a junk `clerk.localhost` host and breaks dev. `clerkProxyMiddleware` is mounted on the API server but only runs when `NODE_ENV === "production"`. Identity chip (email + sign-out) is rendered in the top bar via `ClerkUserChip` in `src/components/layout.tsx`.

## Product

- **Immutable Audit Ledger**: Records all agent actions and decisions, compliant with EU AI Act Article 12.
- **Real-time Monitoring Dashboard**: Live stream of audit logs, agent activity, and system statistics.
- **Compliance Reporting**: Generates exportable compliance reports for agents within specified timeframes.
- **Hash Chain Integrity Verification**: Automatically and manually verifies the integrity of the audit log hash chain.
- **Anomaly Detection**: Automatically flags potential issues based on event types and rationale content.
- **AI Agent Governance (MaroShield-Bridge SDK)**: Provides tools for registering, monitoring, and controlling external AI agents, including drift detection and interdiction.
- **Dynamic Technical White Paper**: Generates an on-demand technical white paper reflecting the current system state.
- **Interactive Swarm Map**: Visualizes the lifecycle and health of AI agents, including evolutionary dynamics, mutations, and interventions.
- **API Key Self-Service**: Users can view (masked), reveal, copy, and rotate their MaroShield key at any time via `/settings` — no need to return to the onboarding flow.

## User preferences

- _Populate as you build_

## Gotchas

- **API Key in Dev Mode**: If `SENTINEL_KEY` is not set, all `POST` requests to the API are allowed, which is a security risk in production environments.
- **DB Schema Push**: `pnpm --filter @workspace/db run push` is for development only and should not be used in production directly.
- **Anomaly Rationale Keywords**: Anomaly detection relies on specific keywords in the rationale (`"Access Denied", "Financial Transfer"`, etc.), which may require updates if new anomaly types emerge.
- **SovereignInduction hook ordering**: The tour overlay uses a thin outer wrapper (`SovereignInduction`) that reads the route and returns `null` early; the hook-heavy inner component (`SovereignInductionInner`) is only mounted when needed — never violates React rules of hooks.
- **Mobile Swarm Map Optimizations**: Mobile optimizations (e.g., simplified mutation filters, label filtering) mean the visual experience differs significantly from desktop.
- **CORS in production**: `REPLIT_DOMAINS` env var (set automatically by the platform) locks allowed origins to the deployed domain(s). In dev this var is unset, so any origin is mirrored back for convenience.
- **Body size limit**: `express.json` and `express.urlencoded` are capped at 512 KB. Payloads larger than this receive HTTP 413.
- **Health check**: `GET /api/healthz` performs an actual `SELECT 1` DB round-trip. A 200 with `{ "db": "ok" }` means both the process and Postgres are reachable. 503 means the pool is down.
- **`lastUsedAt` tracking**: `resolveOwnerFromKey()` fires a background UPDATE to `partner_keys.last_used_at` every time a `sk_sent_core_*` key authenticates a log ingestion. The `/settings` page displays this alongside the provisioning date.
- **SDK Handshake (`/v1/auth/verify`)**: `SovereignGateway.__init__` calls `POST /api/v1/auth/verify` on startup (before any agent registration or log commit) to confirm the key is live in the ledger. Fails fast with a clear error instead of a cryptic 401 on the first write. Silenceable via `verify_on_init=False`.

## Pointers

- **EU AI Act Article 12**: [Link to relevant EU AI Act documentation]
- **Drizzle ORM Documentation**: [Link to Drizzle ORM docs]
- **Zod Documentation**: [Link to Zod docs]
- **Orval Documentation**: [Link to Orval docs]
- **pnpm Workspaces Documentation**: [Link to pnpm workspaces docs]
- **Express.js Documentation**: [Link to Express docs]