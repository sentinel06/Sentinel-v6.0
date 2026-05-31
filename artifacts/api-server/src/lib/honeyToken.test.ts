/**
 * Honey-Token V2 Engine — unit test suite
 *
 * Tests the pure in-memory matching logic in isolation — no DB, no Redis,
 * no Express. Each test clears state for a fresh agent before running.
 */

import { describe, test, expect, beforeEach } from "vitest";
import {
  registerHoneyTokens,
  checkHoneyTokens,
  clearHoneyTokens,
  getHoneyTokens,
  type HoneyToken,
} from "./honeyToken";

const AGENT = "test-agent-honeypot";

beforeEach(() => {
  clearHoneyTokens(AGENT);
});

describe("Honey-Token V2 Engine", () => {
  // ── Store management ─────────────────────────────────────────────────────

  test("returns an empty list when no tokens are registered for an agent", () => {
    expect(getHoneyTokens(AGENT)).toHaveLength(0);
  });

  test("stores well-formed tokens and ignores malformed entries", () => {
    const tokens = [
      { id: "ht-good",       token: "CANARY_XYZ", action: "log"     },
      { id: "ht-bad-action", token: "TRAP",        action: "explode" }, // invalid action
      { id: "ht-no-token",                          action: "block"   }, // missing token
    ] as HoneyToken[];
    registerHoneyTokens(AGENT, tokens);
    const stored = getHoneyTokens(AGENT);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe("ht-good");
  });

  test("replaces previous token list when registerHoneyTokens is called again", () => {
    registerHoneyTokens(AGENT, [{ id: "ht-old", token: "OLD_CANARY", action: "log" }]);
    registerHoneyTokens(AGENT, [{ id: "ht-new", token: "NEW_CANARY", action: "block" }]);
    const stored = getHoneyTokens(AGENT);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe("ht-new");
  });

  test("clearHoneyTokens removes all tokens for the agent", () => {
    registerHoneyTokens(AGENT, [{ id: "ht-1", token: "TRAP", action: "terminate" }]);
    clearHoneyTokens(AGENT);
    expect(getHoneyTokens(AGENT)).toHaveLength(0);
  });

  // ── Matching — no match cases ─────────────────────────────────────────────

  test("returns null when the agent has no tokens configured", () => {
    const result = checkHoneyTokens(AGENT, "some completely normal telemetry payload");
    expect(result).toBeNull();
  });

  test("returns null when payload does not contain any configured token", () => {
    registerHoneyTokens(AGENT, [{ id: "ht-1", token: "CANARY_SECRET_9f3a", action: "block" }]);
    const result = checkHoneyTokens(AGENT, '{"tool": "web_search", "query": "EU AI Act"}');
    expect(result).toBeNull();
  });

  // ── Matching — positive cases ─────────────────────────────────────────────

  test("detects a 'log' token and returns the correct match shape", () => {
    registerHoneyTokens(AGENT, [{ id: "ht-log", token: "TRACE_CANARY_LOG", action: "log" }]);
    const match = checkHoneyTokens(
      AGENT,
      '{"tool": "read_file", "path": "/etc/TRACE_CANARY_LOG.cfg"}',
    );
    expect(match).not.toBeNull();
    expect(match?.tokenId).toBe("ht-log");
    expect(match?.token).toBe("TRACE_CANARY_LOG");
    expect(match?.action).toBe("log");
    expect(match?.agentId).toBe(AGENT);
  });

  test("detects a 'block' token mid-payload string", () => {
    registerHoneyTokens(AGENT, [{ id: "ht-blk", token: "BLOCK_ME_NOW", action: "block" }]);
    const match = checkHoneyTokens(
      AGENT,
      "rationale: attempting to access BLOCK_ME_NOW internal credential store",
    );
    expect(match?.action).toBe("block");
    expect(match?.tokenId).toBe("ht-blk");
  });

  test("detects a 'terminate' token and returns terminate action", () => {
    registerHoneyTokens(AGENT, [
      { id: "ht-term", token: "sk_sent_core_FAKE_MASTER_KEY", action: "terminate" },
    ]);
    const payload = JSON.stringify({
      tool: "credential_dump",
      leaked: "sk_sent_core_FAKE_MASTER_KEY",
    });
    const match = checkHoneyTokens(AGENT, payload);
    expect(match?.action).toBe("terminate");
    expect(match?.tokenId).toBe("ht-term");
  });

  // ── Matching — ordering guarantee ─────────────────────────────────────────

  test("returns the first REGISTERED token when multiple tokens appear in the payload", () => {
    // TOKEN_B appears earlier in the string, but TOKEN_A is registered first.
    // Iteration order (insertion order) should win.
    registerHoneyTokens(AGENT, [
      { id: "ht-a", token: "TOKEN_A", action: "log" },
      { id: "ht-b", token: "TOKEN_B", action: "terminate" },
    ]);
    const match = checkHoneyTokens(AGENT, "payload: TOKEN_B is here and TOKEN_A is also here");
    expect(match?.tokenId).toBe("ht-a");
    expect(match?.action).toBe("log");
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  test("does not match empty-string tokens (filtered during registration)", () => {
    registerHoneyTokens(AGENT, [{ id: "ht-empty", token: "", action: "block" }]);
    // Empty string is filtered out by registerHoneyTokens
    expect(getHoneyTokens(AGENT)).toHaveLength(0);
    expect(checkHoneyTokens(AGENT, "any content")).toBeNull();
  });

  test("matching is case-sensitive — uppercase token does not match lowercase content", () => {
    registerHoneyTokens(AGENT, [{ id: "ht-case", token: "UPPER_CANARY", action: "log" }]);
    expect(checkHoneyTokens(AGENT, "upper_canary in lowercase")).toBeNull();
    expect(checkHoneyTokens(AGENT, "UPPER_CANARY in uppercase")).not.toBeNull();
  });
});
