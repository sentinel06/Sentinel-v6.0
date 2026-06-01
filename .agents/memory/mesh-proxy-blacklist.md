---
name: Mesh-proxy blacklist architecture
description: How node isolation is split between mesh-proxy sidecar and api-server, and why the publisher connection handles writes.
---

The blacklist spans two packages with distinct roles:

**lib/mesh-proxy/src/blacklist.ts** (sidecar — read + publish side)
- `checkNodeBlacklist(redis, nodeId)` — HGET against `sentinel:blacklist:nodes`; fail-open on error (returns null), never blocks traffic due to Redis unavailability.
- `publishInfractionFrame(redis, nodeId, metadata)` — publishes `{ type: "NODE_INFRACTION", data: { source_node_id, ... } }` to `sentinel:events`; delegates actual HSET to the API server subscriber.

**artifacts/api-server/src/lib/nodeIsolation.ts** (server — write side)
- `addToBlacklist(redis, nodeId, metadata)` — HSET + EXPIRE (3600s TTL refreshed on every infraction).
- `processIncomingFrame(redis, rawMessage)` — handles `NODE_INFRACTION` and `kill_switch` frame types.

**Critical: use `redisPublisher` for HSET calls in ws.ts**, not `redisSubscriber`. ioredis puts the subscriber connection into a mode where it can only subscribe/unsubscribe — any other command (including HSET) will error. The publisher connection is a normal Redis connection that happens to also publish.

**Why fail-open:** The circuit breaker (step 1) already handles Redis loss by tripping to OPEN and blocking all traffic. The blacklist check (step 1.5) should never cascade Redis unavailability into a service outage — if Redis is down, the breaker has already fired.

**Test pattern:** Mock `hget` as `vi.fn().mockImplementation((_key, nodeId) => Promise.resolve(nodeId === BLACKLISTED ? entry : null))` — don't mock at the module level, inject into the Redis mock object.
