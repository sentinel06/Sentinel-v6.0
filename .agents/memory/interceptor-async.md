---
name: Interceptor async refactor
description: Why interceptor.ts was refactored to async/await and how the pipeline steps are ordered.
---

The interceptor server uses a `void handleRequest(req, res, ...)` wrapper so the callback-based `http.createServer` can hand off to a fully async pipeline without unhandled-promise warnings.

**Pipeline order (interceptor.ts):**
1. Fail-closed gate — block if breaker is OPEN/HALF_OPEN (sync, no I/O)
2. **Node isolation check** (step 1.5) — `await checkNodeBlacklist(redis, nodeId)` — async Redis HGET; fail-open on error
3. `await collectBody(req)` — promisified body collection
4. `resolveTraceContext(req.headers, parsedBody)` — sync SHA-256 + depth parsing
5. Trust Decay gate — if `depth > MAX_RECURSION_DEPTH`: trip breaker, publish infraction frame, return 508
6. `void mirrorToLedger(...)` — fire-and-forget Redis publish
7. Forward to upstream — callback-based http.request (pipes response directly)

**Node ID resolution priority:** `x-sentinel-node-id` header → `MESH_NODE_ID` env var → null (no blacklist check).

**Why:** The blacklist check is async and needs to complete before the body is collected (to avoid consuming bytes from a known-bad actor). Promisifying body collection allows clean sequential await instead of nested callbacks across 4+ steps.

**Trust decay publishes TWO things:** `mirrorToLedger` (governance record) + `publishInfractionFrame` (blacklist delegation to API server). Both are fire-and-forget; the 508 response doesn't wait for either.
