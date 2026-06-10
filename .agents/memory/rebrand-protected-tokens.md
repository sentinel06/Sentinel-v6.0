---
name: Rebrand protected tokens
description: Which "Sentinel" strings are safe to rename vs which break crypto/auth/DB/SDK during a brand rename.
---

When renaming the product brand in this repo, the token's SHAPE/CASING tells you whether it is safe to touch.

- **Safe to rename (brand display copy):** title-case `Agent-Sentinel`, `AgentSentinel`, spaced `Agent Sentinel`, and the all-caps hyphenated banner token `AGENT-SENTINEL`. These are user-facing headers/copy/log strings.
- **NEVER rename (breaks runtime):**
  - `AGENT_SENTINEL_*` (underscore) — crypto domain separators / signed telemetry markers (e.g. `AGENT_SENTINEL_v4_DOMAIN_SEP` in `crypto/pqc.ts`, the pulse-engine signing marker). They are inside signed/hashed payloads; renaming invalidates signature + hash-chain verification.
  - `X-Sentinel-*` HTTP headers, env vars `SENTINEL_KEY` / `SENTINEL_SIGNING_SEED`, the `sk_sent_core_` key prefix, DB columns.
  - SDK identifiers `Sentinel` / `SentinelClient` / `SentinelConfig` / `SentinelError` / `SovereignGateway`; the `sentinel:events` Redis channel; the `sentinel_operator_hex` localStorage key; variable props like `ownerUserId`.
  - The "missing/invalid Sentinel-Key" error strings — they name the real header.

**Why:** a naive global replace of bare "Sentinel" silently breaks signature verification, auth headers, and SDK/storage contracts.

**How to apply:** never global-replace bare "Sentinel". Replace specific cased phrases only; after each pass re-count protected tokens (`X-Sentinel-Key`, `sk_sent_core`, `SENTINEL_KEY`, `AGENT_SENTINEL`, `DOMAIN_SEPARATOR`) and confirm the counts are unchanged, then run the full typecheck (`tsc -b` libs, then `pnpm -r run typecheck`).

**Live infra (separate decision, not a code-only rename):** the domain `agent-sentinel.net`, `@agent-sentinel.io` emails, the `@agentsentinel` handle, and asset filenames embed the old name but point at real external infrastructure.
