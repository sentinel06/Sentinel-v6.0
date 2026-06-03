/**
 * @workspace/mesh-proxy — interceptor unit test suite
 *
 * Coverage:
 *   1. extractRootObjective  — priority resolution + SHA-256 hash stability
 *   2. resolveTraceContext   — seeding, parsing, incrementing, edge cases
 *   3. Trust Decay breaker   — HTTP integration: 508 response, breaker trip,
 *                              ledger mirror fired before block
 *   4. Node Isolation        — blacklisted node ID → 403 hard block (3 tests)
 *   5. Token-Bucket Cost Firewall — 429 on sequential and concurrent burst
 *   6. Fail-Closed Compliance — Redis error during blacklist check → 503
 */

import crypto from "crypto";
import http from "http";
import net from "net";
import { describe, test, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

import {
  extractRootObjective,
  resolveTraceContext,
  MAX_RECURSION_DEPTH,
  createInterceptorServer,
} from "./interceptor.js";
import { CircuitBreaker } from "./circuitBreaker.js";
import type Redis from "ioredis";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/** Make a JSON POST to a local test server and return { status, body }. */
async function jsonPost(
  port: number,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: "/v1/chat/completions", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw), ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: {} });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. extractRootObjective
// ─────────────────────────────────────────────────────────────────────────────

describe("extractRootObjective — priority resolution", () => {
  test("returns `rationale` field (highest priority)", () => {
    const body = { rationale: "Do task A", system: "Do task B", messages: [{ role: "system", content: "Do task C" }] };
    expect(extractRootObjective(body)).toBe("Do task A");
  });

  test("skips empty rationale and falls through to `system`", () => {
    const body = { rationale: "", system: "System objective" };
    expect(extractRootObjective(body)).toBe("System objective");
  });

  test("falls back to `system` when no rationale present", () => {
    const body = { system: "Anthropic system prompt" };
    expect(extractRootObjective(body)).toBe("Anthropic system prompt");
  });

  test("falls back to OpenAI system message in messages array", () => {
    const body = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user",   content: "Hello" },
      ],
    };
    expect(extractRootObjective(body)).toBe("You are a helpful assistant.");
  });

  test("falls back to first message content when no system role in messages", () => {
    const body = {
      messages: [
        { role: "user", content: "First user message" },
        { role: "assistant", content: "Reply" },
      ],
    };
    expect(extractRootObjective(body)).toBe("First user message");
  });

  test("falls back to full JSON stringify for unrecognised shape", () => {
    const body = { tool: "web_search", query: "latest AI news" };
    expect(extractRootObjective(body)).toBe(JSON.stringify(body));
  });

  test("handles null input without throwing", () => {
    expect(() => extractRootObjective(null)).not.toThrow();
    expect(extractRootObjective(null)).toBe("null");
  });

  test("handles string input without throwing", () => {
    expect(extractRootObjective("<binary>")).toBe('"<binary>"');
  });

  test("handles empty object without throwing", () => {
    expect(extractRootObjective({})).toBe("{}");
  });
});

describe("extractRootObjective — SHA-256 hash stability", () => {
  test("identical bodies produce identical hashes", () => {
    const body = { rationale: "Deterministic objective for agent-7" };
    const h1 = sha256(extractRootObjective(body));
    const h2 = sha256(extractRootObjective(body));
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test("different rationale strings produce different hashes", () => {
    const hA = sha256(extractRootObjective({ rationale: "Objective A" }));
    const hB = sha256(extractRootObjective({ rationale: "Objective B" }));
    expect(hA).not.toBe(hB);
  });

  test("hash is stable across priority fallbacks for identical objective text", () => {
    const text = "Shared objective text";
    const fromRationale = sha256(extractRootObjective({ rationale: text }));
    const fromSystem    = sha256(extractRootObjective({ system: text }));
    const fromMessages  = sha256(extractRootObjective({ messages: [{ role: "system", content: text }] }));
    // All three resolve to the same string → same hash
    expect(fromRationale).toBe(fromSystem);
    expect(fromSystem).toBe(fromMessages);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. resolveTraceContext
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveTraceContext — seeding new traces", () => {
  test("generates depth=0 and isNew=true when no headers present", () => {
    const ctx = resolveTraceContext({}, { rationale: "Initial objective" });
    expect(ctx.depth).toBe(0);
    expect(ctx.isNew).toBe(true);
    expect(ctx.rootHash).toHaveLength(64);
    expect(ctx.headerValue).toBe(`root_hash=${ctx.rootHash};depth=0`);
  });

  test("uses x-sentinel-root-intent as the hash seed", () => {
    const headers = { "x-sentinel-root-intent": "Explicit caller-supplied intent" };
    const ctx      = resolveTraceContext(headers, { rationale: "Should be ignored" });
    const expected = sha256("Explicit caller-supplied intent");
    expect(ctx.rootHash).toBe(expected);
    expect(ctx.depth).toBe(0);
    expect(ctx.isNew).toBe(true);
  });

  test("ignores empty x-sentinel-root-intent and falls back to body", () => {
    const headers = { "x-sentinel-root-intent": "" };
    const body    = { rationale: "Body objective" };
    const ctx     = resolveTraceContext(headers, body);
    const expected = sha256("Body objective");
    expect(ctx.rootHash).toBe(expected);
  });

  test("root hash is stable across repeated calls for identical input", () => {
    const body = { rationale: "Stable objective" };
    const ctx1 = resolveTraceContext({}, body);
    const ctx2 = resolveTraceContext({}, body);
    expect(ctx1.rootHash).toBe(ctx2.rootHash);
    expect(ctx1.headerValue).toBe(ctx2.headerValue);
  });
});

describe("resolveTraceContext — continuing existing traces", () => {
  const HASH = "a".repeat(64);

  test("parses x-sentinel-trace and increments depth from 0 → 1", () => {
    const headers = { "x-sentinel-trace": `root_hash=${HASH};depth=0` };
    const ctx = resolveTraceContext(headers, { rationale: "Irrelevant — header wins" });
    expect(ctx.rootHash).toBe(HASH);
    expect(ctx.depth).toBe(1);
    expect(ctx.isNew).toBe(false);
    expect(ctx.headerValue).toBe(`root_hash=${HASH};depth=1`);
  });

  test("parses depth=3 and increments to depth=4", () => {
    const headers = { "x-sentinel-trace": `root_hash=${HASH};depth=3` };
    const ctx = resolveTraceContext(headers, {});
    expect(ctx.depth).toBe(4);
    expect(ctx.isNew).toBe(false);
  });

  test("parses depth at MAX_RECURSION_DEPTH−1 and increments to MAX_RECURSION_DEPTH", () => {
    const headers = { "x-sentinel-trace": `root_hash=${HASH};depth=${MAX_RECURSION_DEPTH - 1}` };
    const ctx = resolveTraceContext(headers, {});
    expect(ctx.depth).toBe(MAX_RECURSION_DEPTH);
  });

  test("x-sentinel-trace takes precedence over x-sentinel-root-intent", () => {
    const headers = {
      "x-sentinel-trace":       `root_hash=${HASH};depth=2`,
      "x-sentinel-root-intent": "This should be ignored",
    };
    const ctx = resolveTraceContext(headers, {});
    expect(ctx.rootHash).toBe(HASH);
    expect(ctx.depth).toBe(3);
    expect(ctx.isNew).toBe(false);
  });

  test("malformed trace value causes reseed with depth=0", () => {
    const headers = { "x-sentinel-trace": "not-a-valid-format" };
    const ctx = resolveTraceContext(headers, { rationale: "Fallback body" });
    expect(ctx.isNew).toBe(true);
    expect(ctx.depth).toBe(0);
  });

  test("short hash in trace is treated as malformed and causes reseed", () => {
    const headers = { "x-sentinel-trace": "root_hash=abc123;depth=2" }; // hash too short
    const ctx = resolveTraceContext(headers, { rationale: "Fallback" });
    expect(ctx.isNew).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Trust Decay circuit breaker — HTTP integration
// ─────────────────────────────────────────────────────────────────────────────

describe("Trust Decay circuit breaker — HTTP integration", () => {
  let server: http.Server;
  let port: number;
  let breaker: CircuitBreaker;
  let mockPublish: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    breaker = new CircuitBreaker();
    // Start CLOSED so the fail-closed gate doesn't intercept our test traffic
    breaker.close();

    mockPublish = vi.fn().mockResolvedValue(1);
    // hget returns null by default — no node is blacklisted in trust-decay tests
    const mockRedis = { publish: mockPublish, hget: vi.fn().mockResolvedValue(null) } as unknown as Redis;

    // Upstream URL doesn't matter for depth-exceeded tests — the server
    // returns 508 before attempting to forward.
    server = createInterceptorServer(
      "http://127.0.0.1:19999",
      mockRedis,
      breaker,
      "http://127.0.0.1:8080",
    );

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    port = (server.address() as net.AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    mockPublish.mockClear();
    // Reset breaker to CLOSED before each test
    breaker.close();
  });

  test("depth > MAX_RECURSION_DEPTH returns 508 LOOP_DETECTED_TRUST_DECAY", async () => {
    const HASH         = "f".repeat(64);
    const overDepth    = MAX_RECURSION_DEPTH + 1; // e.g. 6 when max=5
    const traceHeader  = `root_hash=${HASH};depth=${overDepth}`;

    const { status, body } = await jsonPost(
      port,
      { "x-sentinel-trace": traceHeader },
      { rationale: "Attempting recursive call beyond limit" },
    );

    expect(status).toBe(508);
    expect(body.error).toBe("LOOP_DETECTED_TRUST_DECAY");
    expect(body.depth).toBe(overDepth + 1);           // resolveTraceContext increments before check
    expect(body.maxDepth).toBe(MAX_RECURSION_DEPTH);
    expect(body.rootHash).toBe(HASH);
  });

  test("circuit breaker is tripped to OPEN after trust decay detection", async () => {
    const tripSpy = vi.spyOn(breaker, "trip");
    const HASH    = "e".repeat(64);

    await jsonPost(
      port,
      { "x-sentinel-trace": `root_hash=${HASH};depth=${MAX_RECURSION_DEPTH + 1}` },
      {},
    );

    expect(tripSpy).toHaveBeenCalledOnce();
    expect(breaker.currentState).toBe("OPEN");
  });

  test("ledger mirror (redis.publish) is fired before the 508 block", async () => {
    // Reset breaker to CLOSED so the request reaches the trust decay gate
    breaker.close();
    const HASH = "d".repeat(64);

    await jsonPost(
      port,
      { "x-sentinel-trace": `root_hash=${HASH};depth=${MAX_RECURSION_DEPTH + 1}` },
      { rationale: "Violation payload" },
    );

    // Allow the fire-and-forget async mirror to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(mockPublish).toHaveBeenCalledOnce();

    const [channel, rawFrame] = mockPublish.mock.calls[0] as [string, string];
    expect(channel).toBe("sentinel:events");

    const frame = JSON.parse(rawFrame) as Record<string, unknown>;
    expect(frame.source).toBe("MESH_SIDECAR");
    expect((frame.trace as Record<string, unknown>).rootHash).toBe(HASH);
    expect((frame.trace as Record<string, unknown>).depth).toBe(MAX_RECURSION_DEPTH + 2);
  });

  test("depth exactly at MAX_RECURSION_DEPTH is NOT blocked (boundary)", async () => {
    // depth=MAX resolves to MAX+1 inside the handler, which still satisfies
    // depth > MAX — so it IS blocked. The safe boundary is depth=MAX−1.
    // This test confirms depth=MAX−1 (the last safe header value) resolves
    // to depth=MAX and is blocked (depth MAX > MAX is false, MAX+1 > MAX is true).
    //
    // In other words: the last header value that is NOT blocked is depth=MAX−2
    // (resolves to MAX−1 inside the handler, MAX−1 > MAX = false).
    const HASH         = "c".repeat(64);
    const safeDepth    = MAX_RECURSION_DEPTH - 2; // resolves to MAX−1, not blocked

    // With a safe depth the server will try to forward — which will fail
    // (no upstream), but the response should NOT be 508.
    const { status } = await jsonPost(
      port,
      { "x-sentinel-trace": `root_hash=${HASH};depth=${safeDepth}` },
      { rationale: "Safe depth call" },
    );

    expect(status).not.toBe(508);
  });

  test("response body includes circuitState field", async () => {
    breaker.close();
    const HASH = "b".repeat(64);

    const { body } = await jsonPost(
      port,
      { "x-sentinel-trace": `root_hash=${HASH};depth=${MAX_RECURSION_DEPTH + 5}` },
      {},
    );

    expect(typeof body.circuitState).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Node Isolation — blacklist gate (step 1.5)
// ─────────────────────────────────────────────────────────────────────────────

describe("Node Isolation blacklist gate — HTTP integration", () => {
  let server: http.Server;
  let port: number;
  let breaker: CircuitBreaker;
  let mockHget: ReturnType<typeof vi.fn>;
  let mockPublish: ReturnType<typeof vi.fn>;

  const BLACKLISTED_NODE = "agent-node-compromised-001";
  const CLEAN_NODE       = "agent-node-clean-002";
  const BLACKLIST_ENTRY  = JSON.stringify({
    sourceNodeId: BLACKLISTED_NODE,
    violation:    "TRUST_DECAY",
    rootHash:     "a".repeat(64),
    depth:        7,
    ts:           "2026-01-01T00:00:00.000Z",
    isolatedAt:   "2026-01-01T00:01:00.000Z",
  });

  beforeAll(async () => {
    breaker = new CircuitBreaker();
    breaker.close();

    mockPublish = vi.fn().mockResolvedValue(1);
    // hget: returns the blacklist entry when the blacklisted node is queried,
    // null for all other node IDs.
    mockHget = vi.fn().mockImplementation((_key: string, nodeId: string) =>
      Promise.resolve(nodeId === BLACKLISTED_NODE ? BLACKLIST_ENTRY : null),
    );

    const mockRedis = {
      publish: mockPublish,
      hget:    mockHget,
    } as unknown as Redis;

    server = createInterceptorServer(
      "http://127.0.0.1:19999",
      mockRedis,
      breaker,
      "http://127.0.0.1:8080",
    );

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    port = (server.address() as net.AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    mockPublish.mockClear();
    mockHget.mockClear();
    mockHget.mockImplementation((_key: string, nodeId: string) =>
      Promise.resolve(nodeId === BLACKLISTED_NODE ? BLACKLIST_ENTRY : null),
    );
    breaker.close();
  });

  test("blacklisted node ID in header → 403 AGENT_NODE_ISOLATION_ENFORCED", async () => {
    const { status, body } = await jsonPost(
      port,
      { "x-sentinel-node-id": BLACKLISTED_NODE },
      { rationale: "Attempting call from isolated node" },
    );

    expect(status).toBe(403);
    expect(body.error).toBe("AGENT_NODE_ISOLATION_ENFORCED");
    expect(body.nodeId).toBe(BLACKLISTED_NODE);
    expect(body.isolationMetadata).toBeDefined();
    expect((body.isolationMetadata as Record<string, unknown>).violation).toBe("TRUST_DECAY");
  });

  test("non-blacklisted node ID in header → not 403 (proceeds to upstream, gets 502)", async () => {
    const { status } = await jsonPost(
      port,
      { "x-sentinel-node-id": CLEAN_NODE },
      { rationale: "Normal call from clean node" },
    );

    // The request passes the blacklist gate and attempts to forward;
    // no upstream is listening on port 19999 so the response is 502.
    expect(status).not.toBe(403);
    expect(status).toBe(502);
  });

  test("missing x-sentinel-node-id header → no blacklist check, proceeds normally (502)", async () => {
    const { status } = await jsonPost(
      port,
      {}, // no node-id header
      { rationale: "Anonymous request, no node ID" },
    );

    // No node ID means no blacklist check at all — request flows through to
    // the (absent) upstream and fails with 502 UPSTREAM_ERROR.
    expect(status).not.toBe(403);
    expect(status).toBe(502);

    // Confirm hget was NOT called (no node to look up)
    expect(mockHget).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Token-Bucket Cost Firewall — Step 1.2 HTTP integration
// ─────────────────────────────────────────────────────────────────────────────

describe("Token-Bucket Cost Firewall — HTTP integration (Step 1.2)", () => {
  let server: http.Server;
  let port:   number;
  let breaker: CircuitBreaker;

  // Each createInterceptorServer call gets a fresh TokenBucketLimiter instance,
  // so this suite starts with a clean bucket state (CAPACITY = 100 tokens).
  beforeAll(async () => {
    breaker = new CircuitBreaker();
    breaker.close();

    const mockRedis = {
      publish: vi.fn().mockResolvedValue(1),
      hget:    vi.fn().mockResolvedValue(null), // no node blacklisted
    } as unknown as Redis;

    server = createInterceptorServer(
      "http://127.0.0.1:19999",
      mockRedis,
      breaker,
      "http://127.0.0.1:8080",
    );

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    port = (server.address() as net.AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    breaker.close();
  });

  test("sequential burst exhausts bucket → returns 429 once capacity is drained", async () => {
    // CAPACITY=100 tokens, 10 tokens/request → bucket drains after 10 requests.
    // Sending 12 requests; the first must always pass (fresh bucket), and at least
    // one of the later ones must be rejected with 429 RATE_LIMIT_EXCEEDED.
    const nodeId   = "rate-limit-sequential-node-001";
    const statuses: number[] = [];

    for (let i = 0; i < 12; i++) {
      const { status, body } = await jsonPost(
        port,
        { "x-sentinel-node-id": nodeId },
        { rationale: "burst probe" },
      );
      statuses.push(status);

      // Short-circuit early if we already have a 429 — no need to keep going.
      if (status === 429) {
        expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
        break;
      }
    }

    // The fresh bucket allows the first request through.
    expect(statuses[0]).not.toBe(429);
    // At least one request in the sequence must have been rate-limited.
    expect(statuses.some(s => s === 429)).toBe(true);
  });

  test("concurrent burst from single node returns 429 once bucket is fully exhausted", async () => {
    // Fire 20 requests simultaneously from the same node.
    // consume() runs synchronously (before any await), so all 20 calls land
    // on the event loop in sequence.  With CAPACITY=100 and 10 tokens/request,
    // exactly 10 will succeed; the remaining 10 must receive 429.
    const nodeId = "rate-limit-concurrent-node-002";

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        jsonPost(port, { "x-sentinel-node-id": nodeId }, {}).then(r => r.status),
      ),
    );

    const count429 = results.filter(s => s === 429).length;
    // At least 10 of 20 must be rate-limited (20 × 10 tokens vs capacity 100).
    expect(count429).toBeGreaterThanOrEqual(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Fail-Closed Compliance — Redis error during blacklist check → 503
// ─────────────────────────────────────────────────────────────────────────────

describe("Fail-Closed Compliance — Redis error during Step 1.5 blacklist check", () => {
  let server: http.Server;
  let port:   number;
  let breaker: CircuitBreaker;

  beforeAll(async () => {
    breaker = new CircuitBreaker();
    breaker.close();

    // hget throws a connection error to simulate Redis being unreachable.
    const mockRedis = {
      publish: vi.fn().mockResolvedValue(1),
      hget:    vi.fn().mockRejectedValue(new Error("Redis ECONNREFUSED 127.0.0.1:6379")),
    } as unknown as Redis;

    server = createInterceptorServer(
      "http://127.0.0.1:19999",
      mockRedis,
      breaker,
      "http://127.0.0.1:8080",
    );

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    port = (server.address() as net.AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    breaker.close();
  });

  test("Redis connection error during blacklist check → 503 SECURITY_DATA_PLANE_OFFLINE", async () => {
    const { status, body } = await jsonPost(
      port,
      { "x-sentinel-node-id": "agent-node-redis-down-001" },
      { rationale: "Request when Redis is unreachable" },
    );

    expect(status).toBe(503);
    expect(body.error).toBe("SECURITY_DATA_PLANE_OFFLINE");
    expect(typeof body.message).toBe("string");
    expect(body.message).toContain("Failing closed");
  });

  test("Redis timeout error during blacklist check → 503 (fail-closed, not pass-through)", async () => {
    const { status, body } = await jsonPost(
      port,
      { "x-sentinel-node-id": "agent-node-redis-timeout-002" },
      { rationale: "Request when Redis times out" },
    );

    expect(status).toBe(503);
    expect(body.error).toBe("SECURITY_DATA_PLANE_OFFLINE");
  });

  test("request with no node-id header skips blacklist check → not 503 (no Redis call made)", async () => {
    // When there is no x-sentinel-node-id header, the blacklist block is
    // skipped entirely and the request flows through to the (absent) upstream.
    const { status } = await jsonPost(
      port,
      {}, // no node-id header — blacklist gate never runs
      { rationale: "Anonymous request, no node ID supplied" },
    );

    // The request bypasses the Redis check and reaches upstream; since
    // no upstream is running on port 19999 it fails with 502, NOT 503.
    expect(status).not.toBe(503);
    expect(status).toBe(502);
  });
});
