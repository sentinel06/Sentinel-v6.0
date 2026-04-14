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
- **CRISPR White-Gold Surge**: Right-click → "Apply CRISPR White-Gold Surge" dispatches `recursiveFixVerified` event. BFS enumerates all descendants. Gold/white-gold particle animates along each vine arc using `bezierPt()` interpolation. Surging nodes display "RECODING" badge + #fg-white filter.
- **Spawn Sparks**: New offspring nodes trigger gold spark travelling from parent → child along vine arc over 1.6s.
- **Lineage Hover**: Hovering vine → BFS avg fitness tooltip. Vine turns gold on hover.
- **6-KPI Board**: Swarm Fertility · Apex Fitness · Genetic Drift · Natural Selection · Active Population · Calcification.

## Technical White Paper Engine

- **`GET /v1/whitepaper`** — Dynamically generates a full Technical White Paper from live system state. Returns JSON with `markdown`, `pulseSeal`, `quantumManifest`, and `hmacSeal` fields.
- **`artifacts/api-server/src/services/whitepaper_gen.ts`** — Service that pulls ML-DSA-87 lattice params (k=8, l=7, q=8,380,417), FIPS-204 SL5 status from Sovereign Pulse, anonymized drift/surge topology snippets, and assembles 9-section Markdown white paper.
- **Download White Paper button** on `/status` page — fetches whitepaper JSON, renders Sentinel Zen A4 Landscape print HTML, opens in new window with `window.print()`.
- **`docs/partner_onboarding_guide.md`** — Full Apex-Fintech alpha partner documentation (9 sections, EU AI Act compliance guide, sovereign key provisioning, breach scenario walkthrough).
- **`pnpm --filter @workspace/scripts run breach`** — Runs 3-stage Apex-Fintech breach simulation script (cognitive drift, honey-token vault breach, causal chain break).

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/sentinel-dashboard run dev` — run dashboard locally
- `pnpm --filter @workspace/scripts run breach` — run Apex-Fintech 3-stage breach simulation
