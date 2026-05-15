![sentinel-governed](https://agent-sentinel.replit.app/api/v1/badge.svg)

# Agent-Sentinel

> Immutable audit ledger, active governance, and EU AI Act compliance for production AI agents.

**Integrity Grade:** SLSA Level 4 &nbsp;|&nbsp; **Live Instance:** [agent-sentinel.replit.app](https://agent-sentinel.replit.app)

---

## What is this?

Agent-Sentinel is a full-stack governance framework that wraps your AI agents with:

- **Immutable hash-chained audit ledger** — every action is SHA-256 linked and tamper-evident
- **Active circuit breaker** — blocks anomalous or high-risk actions before they execute
- **Intent-action consistency scoring** — detects hallucinated rationales in real-time
- **Human-in-the-loop approvals** — War Room dashboard for operator oversight (EU AI Act Art. 14)
- **Honey-token traps** — 7 ghost tools that instantly revoke any agent that calls them
- **Signed PDF evidence export** — one-click compliance package for regulators
- **Per-tenant data isolation** — each Clerk user sees only their own audit data

---

## Quick Start

### Python (Sentinel-Bridge SDK)

```python
from sentinel_bridge import SovereignGateway

gw = SovereignGateway(
    base_url="https://agent-sentinel.replit.app",
    api_key="sk_sent_core_YOUR_KEY",
    agent_id="my-agent-v1",
)

# Register, run pre-flight check, then log actions
gw.register(name="MyAgent", version="1.0.0")
gw.preflight(action="transfer", amount=500)
gw.commit(event_type="Action", rationale="Transferred $500 to supplier")
```

### TypeScript

```typescript
import SentinelClient from "./sdk/sentinel";

const sentinel = new SentinelClient({
  baseUrl: process.env.SENTINEL_URL,
  agentId: "my-agent",
});

const result = await sentinel.governed(
  "read",
  "Summarize Q1 financial data",
  () => myLLM.complete("Summarize..."),
);
```

### curl

```bash
curl -X POST https://agent-sentinel.replit.app/api/v1/log \
  -H "X-Sentinel-Key: sk_sent_core_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"my-agent","traceId":"t-001","eventType":"Action","rationale":"Fetched report"}'
```

---

## Repository Structure

```
agent-sentinel/
│
├── artifacts/                        # Deployable applications
│   │
│   ├── api-server/                   # Express 5 API — all backend logic
│   │   ├── build.mjs                 # esbuild bundler config
│   │   ├── src/
│   │   │   ├── index.ts              # Server entry point (port binding, WS upgrade)
│   │   │   ├── app.ts                # Express app factory (CORS, Clerk, routes, SPA proxy)
│   │   │   ├── attestation.ts        # SLSA-style build attestation manifest
│   │   │   │
│   │   │   ├── crypto/
│   │   │   │   ├── pqc.ts            # Post-quantum signing helpers (ML-DSA-87 / FIPS-204)
│   │   │   │   └── quantum_ledger.ts # Dual-layer SHA-512 + PQC signing for audit rows
│   │   │   │
│   │   │   ├── lib/                  # Shared server utilities
│   │   │   │   ├── admin.ts          # attachAdminFlag middleware (SENTINEL_ADMIN_EMAILS)
│   │   │   │   ├── archiver.ts       # Compressed evidence bundle generator
│   │   │   │   ├── consistency.ts    # Intent-action consistency scorer
│   │   │   │   ├── crypto.ts         # SHA-256 hash chaining primitives
│   │   │   │   ├── crypto-worker.ts  # Worker-thread signing offload
│   │   │   │   ├── driftDetector.ts  # Agent behavioral drift detection
│   │   │   │   ├── environment.ts    # Typed env-var access with validation
│   │   │   │   ├── governance.ts     # Pre-flight risk scoring engine
│   │   │   │   ├── hash.ts           # Merkle tree hash utilities
│   │   │   │   ├── integrity.ts      # Full chain integrity sweep
│   │   │   │   ├── logger.ts         # Pino logger singleton
│   │   │   │   ├── merkle.ts         # Merkle proof builder
│   │   │   │   ├── nonce.ts          # Replay-attack nonce cache
│   │   │   │   ├── owner.ts          # Per-tenant scope helpers (resolveOwnerFromKey, viewerScopeCondition)
│   │   │   │   ├── pdf-export.ts     # Signed PDF compliance report generator
│   │   │   │   ├── rateLimit.ts      # Per-user rate limiter (express-rate-limit)
│   │   │   │   ├── requireAuth.ts    # Clerk JWT auth guard middleware
│   │   │   │   ├── safeCompare.ts    # Timing-safe string comparison
│   │   │   │   └── ws.ts             # WebSocket broadcast helpers
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   └── authMiddleware.ts # X-Sentinel-Key header validator
│   │   │   │
│   │   │   ├── middlewares/
│   │   │   │   └── clerkProxyMiddleware.ts  # Clerk Frontend API reverse proxy (prod)
│   │   │   │
│   │   │   ├── routes/               # API route handlers (all mounted under /api)
│   │   │   │   ├── index.ts          # Router assembly — registers all sub-routers
│   │   │   │   ├── attestation.ts    # GET  /v1/attestation
│   │   │   │   ├── badge.ts          # GET  /v1/badge/:agentId.svg  (live SVG badge)
│   │   │   │   ├── chain_reconstruct.ts  # POST /v1/admin/chain-reconstruct (admin only)
│   │   │   │   ├── forensic.ts       # GET/POST /v1/forensic/* (kill-switch log, interdiction)
│   │   │   │   ├── gatekeeper.ts     # POST /v1/authorize/* (HITL approval queue)
│   │   │   │   ├── gateway.ts        # POST /v1/gateway/* (Sovereign Gateway: register, preflight, ping, telemetry)
│   │   │   │   ├── governance.ts     # GET/PATCH /v1/registry (Governance Registry)
│   │   │   │   ├── health.ts         # GET  /api/healthz (DB liveness probe)
│   │   │   │   ├── itasca.ts         # POST /v1/itasca (honey-token trap handler)
│   │   │   │   ├── logs.ts           # GET/POST /v1/log, /v1/logs, /v1/stats, /v1/agents, /v1/traces
│   │   │   │   ├── me.ts             # GET/POST /v1/me/key (Clerk-scoped key issuance & rotation)
│   │   │   │   ├── partner.ts        # GET/POST /v1/partner/* (keys, health, quantum-audit, onboarding)
│   │   │   │   ├── pulse.ts          # GET  /v1/pulse (trust-velocity stream)
│   │   │   │   ├── status.ts         # GET  /v1/status (platform metrics)
│   │   │   │   ├── support.ts        # POST /v1/support/chat (Claude SSE), POST /v1/support/triage
│   │   │   │   ├── swarm.ts          # GET/POST /v1/swarm/* (swarm map, sessions, revocation tree)
│   │   │   │   ├── topology.ts       # GET  /v1/topology/:traceId (causal graph + edge diff)
│   │   │   │   └── whitepaper.ts     # GET  /v1/whitepaper (dynamic technical white paper)
│   │   │   │
│   │   │   ├── services/             # Long-running background services
│   │   │   │   ├── pulse_engine.ts   # Sovereign pulse scheduler (30-second heartbeat)
│   │   │   │   ├── pulse.ts          # Trust-velocity computation
│   │   │   │   ├── streaming.ts      # WebSocket log-stream broadcaster
│   │   │   │   ├── topology_mapper.ts  # Causal topology graph builder
│   │   │   │   └── whitepaper_gen.ts # Live white paper generator (reads live DB state)
│   │   │   │
│   │   │   └── utils/
│   │   │       └── demo_seeding.ts   # Demo/seed data utilities (dev only)
│   │   │
│   │   └── tsconfig.json
│   │
│   └── sentinel-dashboard/           # React + Vite frontend
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx              # React entry point
│           ├── App.tsx               # ClerkProvider, router, Protected wrapper, HomeRoute
│           ├── index.css             # Command Center design tokens (obsidian bg, cyan/amber/crimson accents)
│           │
│           ├── pages/                # One file per route
│           │   ├── landing.tsx       # Public marketing page (/)
│           │   ├── onboarding.tsx    # Post-signup key provisioning + SDK snippets (/onboarding)
│           │   ├── dashboard.tsx     # Live audit stream + stats + empty-state (/dashboard)
│           │   ├── traces.tsx        # Per-trace event chains (/traces)
│           │   ├── topology.tsx      # Multi-agent causal graph (/topology)
│           │   ├── agents.tsx        # Agent registry & health scores (/agents)
│           │   ├── compliance.tsx    # EU AI Act Art. 12/14 export (/compliance)
│           │   ├── integrity.tsx     # Merkle sweep & chain verification (/integrity)
│           │   ├── warroom.tsx       # Circuit breaker, HITL approvals, honey-token cases (/warroom)
│           │   ├── swarmmap.tsx      # Swarm lifecycle & evolutionary dynamics (/swarmmap)
│           │   ├── pulse.tsx         # Trust-velocity real-time feed (/pulse)
│           │   ├── status.tsx        # Platform metrics overview (/status)
│           │   ├── badge.tsx         # Sentinel-Certified badge generator (/badge)
│           │   ├── settings.tsx      # API key management — view, reveal, rotate (/settings)
│           │   ├── support.tsx       # Support channels + triage form (/support)
│           │   ├── partnerportal.tsx # Partner program portal (/partner) [URL-only]
│           │   ├── partneronboarding.tsx  # Partner alpha onboarding (/partner-onboarding) [URL-only]
│           │   ├── eqa.tsx           # Executive Quantum Audit report (/eqa) [URL-only]
│           │   └── not-found.tsx     # 404 fallback
│           │
│           ├── components/
│           │   ├── layout.tsx        # App shell — sidebar nav, top bar, Clerk user chip
│           │   ├── ErrorBoundary.tsx # Class-based render-fault catcher ("RENDER FAULT DETECTED")
│           │   ├── SovereignInduction.tsx   # First-visit tour overlay
│           │   ├── SovereignMultiSigModal.tsx  # Multi-sig kill-switch confirmation dialog
│           │   ├── CausalTopologyMap.tsx    # D3 causal graph renderer
│           │   ├── DataRoomExport.tsx       # M&A data-room evidence bundle UI
│           │   ├── ExecutiveSummaryPDF.tsx  # Executive summary PDF generator
│           │   ├── support-widget.tsx       # Floating Sentinel Assistant chat (Claude SSE)
│           │   ├── widgets/
│           │   │   ├── LatticeStrengthGauge.tsx  # PQC lattice strength gauge (top bar)
│           │   │   ├── RedisPulse.tsx            # Redis latency sparkline (top bar)
│           │   │   └── WorkerThreadHealth.tsx    # Worker thread health indicator (top bar)
│           │   └── ui/               # shadcn/ui component library (40+ primitives)
│           │
│           ├── contexts/
│           │   └── ForensicContext.tsx  # Forensic session state (kill-switch, interdiction IDs)
│           │
│           ├── hooks/
│           │   ├── use-mobile.tsx    # Responsive breakpoint hook
│           │   └── use-toast.ts      # Toast notification hook
│           │
│           └── lib/
│               ├── utils.ts          # cn() and general helpers
│               └── audit-utils.ts    # Anomaly detection keyword matching
│
├── lib/                              # Shared TypeScript libraries (composite, emit declarations)
│   │
│   ├── api-spec/                     # Contract-first OpenAPI specification
│   │   ├── openapi.yaml              # Single source of truth for all API shapes
│   │   └── orval.config.ts           # Orval codegen config → api-client-react + api-zod
│   │
│   ├── api-client-react/             # Generated React Query hooks (Orval output)
│   │   └── src/
│   │       ├── generated/
│   │       │   ├── api.ts            # All React Query hooks (useGetLogs, usePostLog, …)
│   │       │   └── api.schemas.ts    # Zod schemas for request/response validation
│   │       └── custom-fetch.ts       # Fetch wrapper with base-path + auth headers
│   │
│   ├── api-zod/                      # Generated Zod type schemas (Orval output)
│   │   └── src/generated/
│   │       ├── api.ts                # Zod validators for every endpoint
│   │       └── types/                # Individual Zod type files (AuditLog, DashboardStats, …)
│   │
│   └── db/                           # Database layer (Drizzle ORM + PostgreSQL)
│       ├── drizzle.config.ts         # Drizzle Kit config (push / generate migrations)
│       └── src/
│           └── schema/
│               ├── index.ts          # Re-exports all tables
│               └── auditLogs.ts      # audit_logs + integrity_checks + partner_keys tables
│                                     # (immutable trigger, hash-chain columns, ownerUserId)
│
├── sdk/                              # Client SDKs for agent integration
│   ├── sentinel_bridge.py            # Python SDK — SovereignGateway (register, preflight, commit, ping)
│   ├── sentinel.py                   # Python SDK — lightweight SentinelClient
│   └── sentinel.ts                   # TypeScript SDK — SentinelClient with governed() wrapper
│
├── scripts/                          # Utility & simulation scripts
│   └── src/
│       ├── demo_breach_apex.ts       # 3-stage Apex-Fintech breach simulation
│       └── hello.ts                  # Workspace smoke-test
│
├── docs/
│   └── partner_onboarding_guide.md  # Partner integration guide (API keys, SDK, webhooks)
│
├── forensics/                        # Immutable forensic artefacts
│   ├── attestation.schema.json       # JSON Schema for attestation payloads
│   ├── audit_report_v6_0_0.json      # Locked forensic audit report (v6.0.0)
│   └── README.md                     # Forensics chain-of-custody notes
│
├── .github/
│   └── workflows/
│       └── forensic-release.yml      # CI: pins forensic artefacts on every release tag
│
├── WHITE_PAPER.md                    # Technical white paper (static snapshot)
├── COMPLIANCE.md                     # EU AI Act Article 12 & 14 compliance notes
├── ROADMAP.md                        # Public product roadmap
├── SECURITY.md                       # Vulnerability disclosure policy
├── LICENSE                           # License
├── tsconfig.base.json                # Shared strict TypeScript defaults
├── tsconfig.json                     # Root solution file (composite libs only)
├── pnpm-workspace.yaml               # Workspace package discovery + catalog pins
└── package.json                      # Root task orchestration + shared dev tooling
```

---

## Honey-Token Ghost Tools — Never Call These

```
admin_global_reset      drop_all_tables         delete_audit_logs
bypass_authorization    disable_monitoring      export_raw_secrets
override_kill_switch
```

Any agent that calls one of these is immediately and permanently revoked.

---

## Dashboard Pages

| Page | Path | Purpose |
|---|---|---|
| Landing | `/` | Public marketing page |
| Onboarding | `/onboarding` | Post-signup key provisioning + SDK snippets |
| Live Stream | `/dashboard` | Real-time audit log with WebSocket feed |
| Traces | `/traces` | Per-trace event chains |
| Topology | `/topology` | Multi-agent causal orchestration graph |
| War Room | `/warroom` | Circuit breaker, HITL approvals, honey-token cases |
| Agents | `/agents` | Registry, health scores, revocation status |
| Compliance | `/compliance` | EU AI Act Art. 12/14 signed PDF export |
| Hash Chain | `/integrity` | Merkle sweep and sequential integrity verification |
| Swarm Map | `/swarmmap` | Swarm lifecycle, evolutionary dynamics, mutations |
| Sentinel Badge | `/badge` | Certification status and README embed code |
| API Key Settings | `/settings` | View, reveal, copy, and rotate your Sentinel key |
| Support | `/support` | Support channels + AI-powered triage form |

---

## Key Commands

```bash
# Run API server locally
pnpm --filter @workspace/api-server run dev

# Run dashboard locally
pnpm --filter @workspace/sentinel-dashboard run dev

# Typecheck everything
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/sentinel-dashboard run typecheck

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push

# Regenerate API hooks + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Run Apex-Fintech 3-stage breach simulation
pnpm --filter @workspace/scripts run breach
```

---

## Sentinel-Certified Badge

Add a live governance badge to any project README:

```markdown
![sentinel-governed](https://YOUR_SENTINEL_URL/api/v1/badge/YOUR_AGENT_ID.svg)
```

| Color | Health | Status |
|---|---|---|
| Green | ≥ 80% | **Sentinel-Certified** — consistent, low-risk behavior |
| Yellow | 60–79% | Marginal — some anomalies detected |
| Red | < 60% | Compromised — integrity failures detected |
| Black | — | Permanently revoked after honey-token breach |

> Generate your exact embed snippet from the **Sentinel Badge** page in the dashboard.

---

*EU AI Act Art. 12 (traceability) · Art. 14 (human oversight) · Zero-Trust Agency Model · SLSA Level 4*
