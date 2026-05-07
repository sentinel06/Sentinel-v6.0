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
- **Per-Tenant Data Isolation**: `audit_logs.owner_user_id` (nullable, indexed) carries the Clerk userId of whoever owns each row. Stamped on insert in `routes/logs.ts` (POST /v1/log) and `routes/gateway.ts` (registration + telemetry) via `lib/owner.ts:resolveOwnerFromKey()` (looks up `X-Sentinel-Key` in `partner_keys`). Read endpoints (`/v1/logs`, `/v1/logs/:id`, `/v1/traces/:traceId`, `/v1/stats`, `/v1/agents`, `/v1/compliance/export`) compose `viewerScopeCondition(req)` from `lib/owner.ts` into their WHERE clause. Rule: signed-in viewer → `owner_user_id = userId`; anonymous viewer → `owner_user_id IS NULL` (public demo slice). Demo data (Apex-Fintech, etc.) was seeded with NULL owner and is therefore only visible on the public landing/marketing surface, never to a signed-in user. Per-user keys are issued by `routes/me.ts` via `POST /v1/me/key` (idempotent; reuses `partner_keys` with `partnerId = clerk userId`). System metrics that describe the platform itself (integrity, swarm map, status, forensic) intentionally remain global.
- **Onboarding**: Sign-up `fallbackRedirectUrl` points at `/onboarding`. The page (`pages/onboarding.tsx`) auto-provisions the user's Sentinel key on mount, shows it once with copy buttons, plus tabbed Python SDK + curl snippets. Dashboard renders an empty-state ("Connect your first agent" → `/onboarding`) when `stats.totalLogs === 0`.
- **Sentinel Assistant (AI support)**: Floating chat widget (`components/support-widget.tsx`) mounted globally inside `Layout`. Streams responses from `POST /api/v1/support/chat` (SSE, `routes/support.ts`) backed by Claude (`claude-sonnet-4-6`) via Replit AI Integrations (`AI_INTEGRATIONS_ANTHROPIC_*` env vars, `@anthropic-ai/sdk`). Stateless — full conversation history is sent on every turn (capped to last 20 turns). System prompt embeds product knowledge (onboarding flow, SDK + curl snippets, hash chain, gateway, common errors) so the assistant can resolve most user issues without escalation.
- **Admin Override**: `lib/admin.ts` exposes `attachAdminFlag` middleware (mounted in `app.ts` after Clerk) which stamps `req.isAdmin` when the signed-in user's email is on the `SENTINEL_ADMIN_EMAILS` allowlist (comma-separated env var, defaults to `afaiz9078@gmail.com`). `viewerScopeCondition` in `lib/owner.ts` returns `sql\`true\`` (no row filter) when `req.isAdmin === true`, so admins see every tenant's data plus the public demo slice. Email→admin lookup is cached per Clerk userId for the process lifetime.
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