---
name: Audit-ledger chain-append serialization
description: Invariant for every audit_logs hash-chain append site + the version-gated canonical hashing scheme.
---

# Chain-append serialization invariant

**Rule:** Every site that appends to `audit_logs` via the SHA-256 `computeHash`
chain MUST run its full `getLastHash() → computeHash → sign → insert` section
inside `withChainLock()` (api-server `lib/chainLock.ts`), AND capture its row
`timestamp` (`new Date()`) INSIDE that lock.

**Why:** Two concurrent writers that both read the same chain tail before either
inserts will fork the chain (two rows with the same `previousHash`). Separately,
`getLastHash()` and `verifyHashChain()` both order by `timestamp`; if a timestamp
is captured before lock acquisition, lock order can invert timestamp order and the
verify cursor mismatches the stored `previousHash` → a FALSE tamper flag on
brand-new rows. The mutex is process-local only (single-instance deploy
assumption) — multiple server instances would still need a DB advisory lock.

**How to apply:** When adding any new ledger-append endpoint, wrap it like
`routes/logs.ts` / `routes/gateway.ts` / `routes/forensic.ts`. For multi-entry
appends (e.g. forensic dual-sig override writes 2 chained rows), wrap ALL entries
in ONE `withChainLock` call so the segment stays contiguous. The gateway path is
the exception that proves the rule: it uses its own SHA-512 `hashChainEntry` (not
`computeHash`), so `verifyHashChain` could never validate it anyway — those rows
stay legacy.

# Version-gated canonical hashing

`computeHash(ts, agentId, payload, prevHash, version = 1)`:
- version 1 / NULL = LEGACY = raw `JSON.stringify(payload)`. Every historical /
  demo / gateway row is legacy; the default keeps them byte-for-byte verifiable.
- version 2 = CANONICAL = recursively key-sorted serialization (arrays preserved,
  object keys sorted). Only the live ingest path (`logs.ts`) opts in and stamps
  `audit_logs.hash_version = 2`. Verify recomputes each row with
  `log.hashVersion ?? LEGACY_HASH_VERSION`.

**Why canonical:** Postgres JSONB reorders object keys on storage, so legacy
verification is key-order-fragile; v2 removes that fragility for new chains
without rewriting history.

**Pre-existing demo tamper:** A startup TAMPER alert flagging ~36 entries is
EXPECTED — the Apex-Fintech breach simulation intentionally seeds tampered rows.
Confirm via `integrity_checks` history (`tamper_detected`, count over time)
before assuming a code change caused it.
