# Agent-Sentinel

## Overview

Agent-Sentinel is an immutable audit ledger system for AI agents, designed to meet EU AI Act Article 12 standards for traceability and accountability.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **WebSockets**: ws package
- **Frontend**: React + Vite (sentinel-dashboard artifact)

## Architecture

### Backend (artifacts/api-server)

- `POST /api/v1/log` — Submit audit log with API key auth (X-Sentinel-Key header)
- `GET /api/v1/logs` — Paginated logs with filtering (agentId, traceId, eventType, time range, anomaliesOnly)
- `GET /api/v1/logs/:id` — Single log entry
- `GET /api/v1/traces/:traceId` — Full trace lifecycle grouped by traceId
- `GET /api/v1/stats` — Dashboard statistics (total logs, agents, traces, anomaly count, event type breakdown)
- `GET /api/v1/agents` — All agents with event counts, last seen, anomaly counts
- `GET /api/v1/compliance/export` — Compliance report for an agent within a time range
- `GET /api/v1/integrity/status` — Hash chain integrity status
- `POST /api/v1/integrity/verify` — Trigger manual hash chain verification
- `WS /api/v1/ws` — WebSocket live stream of new log entries

### Database (lib/db)

- `audit_logs` table — Immutable via PostgreSQL trigger (blocks UPDATE and DELETE)
- `integrity_checks` table — Records of hash chain verification runs
- SHA-256 hash chain: each entry hashes `timestamp|agentId|payload|previousHash`

### Frontend (artifacts/sentinel-dashboard)

- `/` — Live stream dashboard with WebSocket feed, stats, anomaly feed
- `/traces` — Trace explorer showing full lifecycle (Intent → Action → Result/Error)
- `/agents` — Agent registry with event counts and anomaly flags
- `/compliance` — Compliance report export (JSON download)
- `/integrity` — Hash chain integrity status with manual verify trigger

## Compliance Features (EU AI Act Article 12)

- **Immutability**: PostgreSQL trigger prevents any UPDATE or DELETE on audit_logs
- **Hash Chaining**: Each log entry includes SHA-256 of (timestamp + agentId + payload + previousHash)
- **Anomaly Detection**: Auto-flags Error events and rationale containing ["Access Denied", "Financial Transfer", "Data Export", "Unauthorized", "Permission"]
- **Hourly Integrity Check**: Background scheduler verifies entire hash chain every hour
- **Compliance Export**: Generate and download JSON reports per agent per time range

## Security

- API key authentication via `X-Sentinel-Key` header and `SENTINEL_KEY` environment variable
- If `SENTINEL_KEY` is not set, all POST requests are allowed (dev mode)
- Sensitive headers redacted from logs

## Swarm Map: Project Darwin — Evolutionary Prosperity Engine (v3)

`artifacts/sentinel-dashboard/src/pages/swarmmap.tsx` — Major upgrade from "Spatial Swarm Map" to "Evolutionary Prosperity Engine":

- **Radial Vessel Physics**: LUCA nucleus at center; generations orbit on concentric rings driven by `forceRadial(generationDepth × RING_SPACING)`. Phylogenetic vines use `radialVine()` — polar-arc curved paths (not straight beziers) so arcs naturally wrap around LUCA. High-fitness = tight bond to LUCA; low-fitness = loose, drifting outward.
- **Fitness Gradient (1.5× scale)**: `fitnessRadius(f, isRoot)` = base * (1.0 + f × 0.5) — max 1.5× growth. `fitness_score = (1 − drift/100)/(1 + drift/100)`. Bio-luminescent sage glow (#4EC9A5) for <5% drift nodes. Inner nucleus brightness = 0.55 + f × 0.35.
- **feTurbulence Maladaptive Mutation**: drift >15% → `#mutation-warp` SVG filter (feTurbulence fractalNoise baseFreq=0.065 + feDisplacementMap scale=8 + violet tint). drift >30% → `#mutation-warp-severe` (turbulence scale=14, more octaves). Turbulence seed updates every 8 ticks for organic animation.
- **Calcification Shader**: Agents idle >300s → `#calcify` SVG filter (feColorMatrix saturate=0.08, 20% opacity), grey ❄ icon, "CALCIFIED" badge. 6th KPI card tracks count.
- **Cellular Dissolution**: Revoke triggers 10-particle radial burst + expanding extinction ring over 1s, vine withers to grey dashed `2,5` line.
- **Prosperity Pulse**: 4 concentric breath rings, amplitude = swarmFertility, 5s oscillation cycle. Darwin background radial gradient aura.
- **Sovereign CRISPR — Genetic Recoding Surge (v4)**:
  - Listens for `recursiveFixVerified` CustomEvent from Multi-Sig Gate OR right-click menu
  - `bezierLength(sx,sy,cpx,cpy,tx,ty, samples=24)` — integrates 24-point quadratic bezier arc length in pixels
  - `buildSurgeTimings(targets, nodeMap, _links, cx, cy)` — computes `arrivalMs[]` per node at exactly 800 px/s (0.8 px/ms), plus pre-computed `segmentCps[]` bezier control points for each vine
  - Surge particle uses `arrivalMs` binary-search to find active segment, `segmentCps` for exact vine arc matching — particle position is frame-accurate to 800 px/s
  - **Metamorphosis** on node contact: `isMetamorphosed(id)` kills `feTurbulence` warp filters, snaps `effectiveDrift` below 15% threshold → node color transitions from Violet (#C084FC) → Sage Teal (#40B595). Node icon changes from ⚡ → ◉ (restored cell symbol)
  - **Afterglow — 60-second Active Monitoring**: `afterglowRef<Map<nodeId, contactTimestamp>>` stamped at first contact. `afterglowIntensity()` returns 1.0→0.4 (0–2s flash) then 0.4→0 (2–60s decay). Afterglow nodes show: faint pulsing gold outer ring, warm gold nucleus tint, "☀ MONITORING" badge. Healed vines show gold `rgba(255,215,0,intensity)` tint fading over 60s.
  - Expired afterglow (>62s) auto-purged from Map to prevent memory growth
- **Spawn Sparks**: New offspring nodes trigger gold spark travelling from parent → child along vine arc over 1.6s.
- **Lineage Hover**: Hovering vine → BFS avg fitness tooltip. Vine turns gold on hover.
- **6-KPI Board**: Swarm Fertility · Apex Fitness · Genetic Drift · Natural Selection · Active Population · Calcification.

## Technical White Paper Engine

- **`GET /v1/whitepaper`** — Dynamically generates a full Technical White Paper from live system state. Returns JSON with `markdown`, `pulseSeal`, `quantumManifest`, and `hmacSeal` fields.
- **`artifacts/api-server/src/services/whitepaper_gen.ts`** — Service that pulls ML-DSA-87 lattice params (k=8, l=7, q=8,380,417), FIPS-204 SL5 status from Sovereign Pulse, anonymized drift/surge topology snippets, and assembles 9-section Markdown white paper.
- **Download White Paper button** on `/status` page — fetches whitepaper JSON, renders Sentinel Zen A4 Landscape print HTML, opens in new window with `window.print()`.
- **`docs/partner_onboarding_guide.md`** — Full Apex-Fintech alpha partner documentation (9 sections, EU AI Act compliance guide, sovereign key provisioning, breach scenario walkthrough).
- **`pnpm --filter @workspace/scripts run breach`** — Runs 3-stage Apex-Fintech breach simulation script (cognitive drift, honey-token vault breach, causal chain break).

## Project Genesis — Sentinel-Bridge SDK (v5.0)

The infrastructure-level governance layer that connects any external Multi-Agent System to Agent-Sentinel.

### Sovereign Gateway API (`artifacts/api-server/src/routes/gateway.ts`)

- **`POST /api/v1/gateway/register`** — Register an external agent. Upserts `agent_registry` + `agent_sessions` (appears on Swarm Map), issues an ML-DSA-87 Signed Identity Token (24 h expiry), commits `GATEWAY_REGISTRATION` to immutable ledger, broadcasts `GATEWAY_SPARK` birth event to Swarm Map.
- **`POST /api/v1/gateway/preflight`** — Sovereign Interceptor pre-flight clearance. Returns `403 SOVEREIGN_INTERDICTION` if agent is revoked or drift-locked. Returns `CLEARED` + `clearanceId` otherwise.
- **`POST /api/v1/gateway/telemetry`** — Ingest agent action packet. Computes consistency/drift score, commits hash-chained entry to immutable ledger, broadcasts `GATEWAY_SPARK` (success), `GATEWAY_MUTATION` (drift > threshold → Violet/Mutant node), or `GATEWAY_DISSOLUTION` (policy violation → Cellular Dissolution). Sovereign mode auto-locks drifting agents.
- **`POST /api/v1/gateway/heartbeat`** — Liveness ping; returns current governance status (ACTIVE | REVOKED | DRIFT_LOCKED).
- **`GET /api/v1/gateway/agents`** — List all Gateway-registered agents with token metadata.
- **`GET /api/v1/gateway/token/:tokenId`** — Verify and inspect an Identity Token.

### Sentinel-Bridge Python SDK (`sdk/sentinel_bridge.py`)

- **`SovereignGateway`** — Synchronous client. Methods: `register(dna)`, `pre_verify(dna, prompt)`, `commit_evolution(dna, result, ...)`, `heartbeat(dna)`.
- **`AsyncSovereignGateway`** — Async variant for LangGraph / FastAPI agents. Full async/await with httpx.
- **`@gateway.sovereign_interceptor(dna)`** — Decorator implementing the full Sovereign Proxy: pre-flight → execute → commit. Raises `SovereignInterdictionError` (403) if blocked.
- **`gateway.build_protected_llm(dna, llm_fn)`** — Wraps a bare `str → str` LLM function with the full interceptor.
- **`SovereignInterdictionError`** — Carries `status`, `agent_id`, `reason` from the War Room.
- **`AgentDNA`** — Dataclass holding agent identity + governance profile (risk_threshold, interdiction_mode).
- **`connect(api_key, endpoint)`** — Module-level factory shortcut.
- Works with `httpx` (preferred) or `requests` — auto-detected at runtime.

### Swarm Map Gateway Animations (`artifacts/sentinel-dashboard/src/pages/swarmmap.tsx`)

Three new WS message handlers in the swarm map:
- **`GATEWAY_SPARK`** → `ZEN_GOLD_SPARK`: triggers spawn-spark arc animation from parent → new node on agent birth, or nudges sim on successful task completion.
- **`GATEWAY_DISSOLUTION`** → `CELLULAR_DISSOLUTION`: triggers the 10-particle radial burst + extinction ring animation, marks node as revoked.
- **`GATEWAY_MUTATION`** → Violet/Mutant jitter: updates node status to `mutant`, raises drift score to trigger `feTurbulence` filter and violet node color.

### Mobile Sovereign ART Optimizations (swarmmap.tsx)

Full mobile-first physics and UX for the Swarm Map:

**D3 Simulation (Cascading Tree layout)**
- LUCA root pinned at `H × 10%` from top (not screen center).
- `VERT_SPACING` derived from `H × 85%` so descendants cascade evenly.
- `forceCollide` radius = `base × 3 + 8` on mobile (3× desktop) preventing overlap.
- `phylo_x` strength `0.45`, `phylo_y` strength `0.75` (vs desktop's 0.18/0.55).
- `velocityDecay` `0.55` on mobile (vs `0.44` desktop) for quicker settling.

**Mutation Filters — 60 FPS safe**
- Desktop: full `feTurbulence` fractal warp (3–4 octaves).
- Mobile: static violet-tint pulse using `feFlood` + `feComposite` + `feBlend` only (zero turbulence cost).

**Touch / Zoom Constraints**
- Pinch-zoom: min `0.8×` on mobile (vs `0.5×` desktop), max `4×`.
- Single-touch pan via `panStartRef` with `clampPan()` preventing elastic bounce.
- Swipe-up / swipe-down on vitality sheet handle: swipe `>30px` up → open, down → close.

**Label Filtering**
- Mobile shows labels only for Mutant, Revoked, and Drift-Locked nodes.
- Mobile label font: `5px` (40% of desktop `8px`); colored in `P.mutation` for alarm states.

**Vitality Sheet — 15vh peek state**
- Collapsed: `maxHeight: 15vh` — always visible at bottom with handle + compact KPI ticker (4 metrics).
- Expanded: `maxHeight: 58vh` — full KPI grid, selected node info, CRISPR + Trace quick-action buttons.
- CSS `max-height` transition `0.32s cubic-bezier(0.22,1,0.36,1)` for smooth open/close.

## Tone & Copy

The dashboard underwent a "warming pass" (May 2026) shifting all-caps mono "sovereign" jargon to mixed-case Inter, benefit-led copy:
- `SovereignInduction.tsx` persona-gate: "Welcome to Agent-Sentinel / Let's give you a quick tour" + "Start the tour →" / "Maybe later"
- Page headers warmed: War Room, Audit Reports (was "Professional Audit Report"), Ledger Integrity (was "Hash Chain Integrity"), Your Agents (was "Agent Registry"), Welcome partner (was "Restricted Access")
- Landing page CTAs: "Explore the Live Dashboard" / "Read the White Paper"
- Step body copy in induction tour intentionally kept (already plain-English, persona-aware via `lex` adapter)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/sentinel-dashboard run dev` — run dashboard locally
- `pnpm --filter @workspace/scripts run breach` — run Apex-Fintech 3-stage breach simulation
