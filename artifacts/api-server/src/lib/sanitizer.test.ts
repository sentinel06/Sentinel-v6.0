/**
 * Sentinel Data Sanitization Engine — unit test suite
 *
 * Covers every rule in sanitizerCore.ts:
 *   1. Compound-key detection via isSensitiveKey()
 *   2. Standard "Bearer <token>" value scrubbing
 *   3. Non-standard bearer_<word> / bearer-<word> value scrubbing
 *   4. Recursive object sweeps — clean data preserved, sensitive data redacted
 *   5. Additional pattern coverage (sk_, pk_, JWT, password=, arrays, depth guard)
 */

import { describe, test, expect } from "vitest";
import {
  isSensitiveKey,
  maskSensitiveFields,
  REDACTED,
  CREDENTIAL_PATTERNS,
  SENSITIVE_KEY_TRIGGERS,
} from "./sanitizerCore";

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — Compound key detection
// ─────────────────────────────────────────────────────────────────────────────
describe("Sentinel Data Sanitization Engine", () => {
  describe("TEST 1 · isSensitiveKey — compound key detection", () => {
    // Positive: keys that contain a sensitive trigger word as a substring
    test('isSensitiveKey("secret_token") → true', () => {
      expect(isSensitiveKey("secret_token")).toBe(true);
    });

    test('isSensitiveKey("system_password") → true', () => {
      expect(isSensitiveKey("system_password")).toBe(true);
    });

    test('isSensitiveKey("jwt_auth_token") → true (contains "token")', () => {
      expect(isSensitiveKey("jwt_auth_token")).toBe(true);
    });

    test('isSensitiveKey("my_api_key_value") → true (contains "api_key")', () => {
      expect(isSensitiveKey("my_api_key_value")).toBe(true);
    });

    test('isSensitiveKey("BEARER_TOKEN") → true (case-insensitive)', () => {
      expect(isSensitiveKey("BEARER_TOKEN")).toBe(true);
    });

    test('isSensitiveKey("authorization") → true (exact trigger word)', () => {
      expect(isSensitiveKey("authorization")).toBe(true);
    });

    test('isSensitiveKey("user-password-hash") → true (hyphen-separated)', () => {
      expect(isSensitiveKey("user-password-hash")).toBe(true);
    });

    test('isSensitiveKey("client_credentials") → true (contains "credential")', () => {
      expect(isSensitiveKey("client_credentials")).toBe(true);
    });

    // Negative: safe field names that must not trigger redaction
    test('isSensitiveKey("clean_field") → false', () => {
      expect(isSensitiveKey("clean_field")).toBe(false);
    });

    test('isSensitiveKey("action") → false', () => {
      expect(isSensitiveKey("action")).toBe(false);
    });

    test('isSensitiveKey("timestamp") → false', () => {
      expect(isSensitiveKey("timestamp")).toBe(false);
    });

    test('isSensitiveKey("user_id") → false', () => {
      expect(isSensitiveKey("user_id")).toBe(false);
    });

    test('isSensitiveKey("agent_status") → false', () => {
      expect(isSensitiveKey("agent_status")).toBe(false);
    });

    test('isSensitiveKey("trace_id") → false', () => {
      expect(isSensitiveKey("trace_id")).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2 — Standard "Bearer eyJ..." token redaction
  // ───────────────────────────────────────────────────────────────────────────
  describe("TEST 2 · maskSensitiveFields — standard Bearer tokens", () => {
    test("Bearer token in plain string is fully redacted", () => {
      const input = "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig";
      const result = maskSensitiveFields(input) as string;
      expect(result).not.toContain("eyJhbGciOiJSUzI1NiJ9");
      expect(result).toContain(REDACTED);
    });

    test("Bearer token value in object is redacted, surrounding text preserved", () => {
      const input = {
        action: "query",
        authHeader: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def",
      };
      const result = maskSensitiveFields(input) as Record<string, unknown>;
      // "action" is safe — must remain untouched
      expect(result.action).toBe("query");
      // "authHeader" is a safe key (doesn't contain trigger words) but its
      // VALUE contains a Bearer token that the pattern scrubber must catch
      expect(result.authHeader as string).toContain(REDACTED);
      expect(result.authHeader as string).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    });

    test("nested authorization key with Bearer value is double-redacted (key rule)", () => {
      const input = { nested: { authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.x.y" } };
      const result = maskSensitiveFields(input) as { nested: Record<string, unknown> };
      // Key "authorization" hits SENSITIVE_KEY_TRIGGERS → entire value replaced
      expect(result.nested.authorization).toBe(REDACTED);
    });

    test("multiple Bearer tokens in a single string are all redacted", () => {
      const input =
        "first=Bearer eyJhbGciOiJSUzI1NiJ9.x.y second=Bearer eyJhbGciOiJIUzI1NiJ9.a.b";
      const result = maskSensitiveFields(input) as string;
      expect(result).not.toContain("eyJhbGciOiJSUzI1NiJ9");
      expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3 — Non-standard / snake-case / hyphen-case bearer tokens
  // ───────────────────────────────────────────────────────────────────────────
  describe("TEST 3 · maskSensitiveFields — non-standard bearer_<word> tokens", () => {
    test('"bearer_jwt_to_wipe_12345" is redacted (the original leak-test value)', () => {
      const result = maskSensitiveFields("bearer_jwt_to_wipe_12345") as string;
      expect(result).toBe(REDACTED);
    });

    test('"bearer-token-value-abc123" (hyphen variant) is redacted', () => {
      const result = maskSensitiveFields("bearer-token-value-abc123") as string;
      expect(result).toBe(REDACTED);
    });

    test("bearer_<word> inside rationale text: surrounding text preserved", () => {
      const input = "Testing masking with bearer_jwt_to_wipe_12345 in free text";
      const result = maskSensitiveFields(input) as string;
      expect(result).toContain("Testing masking with");
      expect(result).toContain("in free text");
      expect(result).toContain(REDACTED);
      expect(result).not.toContain("bearer_jwt_to_wipe_12345");
    });

    test("short bearer_x value (< 6 chars) is NOT redacted (below minimum length)", () => {
      // The regex requires 6+ chars after the separator to avoid false positives
      const result = maskSensitiveFields("bearer_ab") as string;
      expect(result).not.toBe(REDACTED);
    });

    test("compound key 'secret_token' with bearer value — key rule fires first", () => {
      const input = { secret_token: "bearer_jwt_to_wipe_12345" };
      const result = maskSensitiveFields(input) as Record<string, unknown>;
      expect(result.secret_token).toBe(REDACTED);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4 — Recursive object sweeps
  // ───────────────────────────────────────────────────────────────────────────
  describe("TEST 4 · maskSensitiveFields — recursive object sweeps", () => {
    test("clean data returns completely un-mutated", () => {
      const input = {
        agentId: "agent-001",
        action: "query",
        timestamp: "2026-05-24T00:00:00Z",
        metrics: { latencyMs: 120, success: true },
        tags: ["production", "v2"],
      };
      const result = maskSensitiveFields(input);
      expect(result).toEqual(input);
    });

    test("mixed payload: clean fields survive, all sensitive keys are redacted", () => {
      const input = {
        action: "data_access",
        token: "sk_sent_live_supersecret1234abcd",         // sensitive key: "token"
        nested: {
          authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.x.y", // sensitive key: "authorization"
          clean_meta: "this is fine",
        },
        secret_token: "bearer_jwt_to_wipe_12345",          // compound sensitive key
        system_password: "cleartext_password_test",         // compound sensitive key
        rationale: "Agent performed normal data access",    // safe value
      };

      const result = maskSensitiveFields(input) as Record<string, unknown>;
      const nested = result.nested as Record<string, unknown>;

      // Safe fields — must be completely unchanged
      expect(result.action).toBe("data_access");
      expect(result.rationale).toBe("Agent performed normal data access");
      expect(nested.clean_meta).toBe("this is fine");

      // Sensitive keys — values must be exactly REDACTED
      expect(result.token).toBe(REDACTED);
      expect(nested.authorization).toBe(REDACTED);
      expect(result.secret_token).toBe(REDACTED);
      expect(result.system_password).toBe(REDACTED);
    });

    test("deeply nested sensitive key is redacted at any depth", () => {
      const input = {
        level1: {
          level2: {
            level3: {
              api_key: "some_secret_value",
              visible: "still visible",
            },
          },
        },
      };
      const result = maskSensitiveFields(input) as {
        level1: { level2: { level3: Record<string, unknown> } };
      };
      expect(result.level1.level2.level3.api_key).toBe(REDACTED);
      expect(result.level1.level2.level3.visible).toBe("still visible");
    });

    test("arrays of objects are each recursed and sanitised", () => {
      const input = [
        { action: "ok", token: "secret_value_here_long" },
        { action: "ok2", safe_field: "harmless" },
      ];
      const result = maskSensitiveFields(input) as Array<Record<string, unknown>>;
      expect(result[0].action).toBe("ok");
      expect(result[0].token).toBe(REDACTED);
      expect(result[1].action).toBe("ok2");
      expect(result[1].safe_field).toBe("harmless");
    });

    test("array of mixed strings — credential strings redacted, others preserved", () => {
      const input = ["safe string", "Bearer eyJhbGciOiJSUzI1NiJ9.x.y", "also safe"];
      const result = maskSensitiveFields(input) as string[];
      expect(result[0]).toBe("safe string");
      expect(result[1]).toContain(REDACTED);
      expect(result[2]).toBe("also safe");
    });

    test("non-string primitives pass through unchanged", () => {
      expect(maskSensitiveFields(42)).toBe(42);
      expect(maskSensitiveFields(true)).toBe(true);
      expect(maskSensitiveFields(null)).toBeNull();
    });

    test("original input object is NOT mutated (sanitise returns a new object)", () => {
      const input = { token: "super_secret", action: "read" };
      const result = maskSensitiveFields(input) as Record<string, unknown>;
      // result.token is redacted
      expect(result.token).toBe(REDACTED);
      // original is untouched
      expect(input.token).toBe("super_secret");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Additional coverage — pattern-based value scrubbing
  // ───────────────────────────────────────────────────────────────────────────
  describe("Additional · CREDENTIAL_PATTERNS value scrubbing", () => {
    test("sk_ sentinel key format is redacted from string values", () => {
      const result = maskSensitiveFields(
        "key=sk_sent_core_Lkoe05smlkMb6BF6pZax-TNt5yOwVso3",
      ) as string;
      expect(result).toContain(REDACTED);
      expect(result).not.toContain("sk_sent_core");
    });

    test("pk_ public-key format is redacted from string values", () => {
      const result = maskSensitiveFields("pk_live_abcdefghijklmnopqrstuvwx") as string;
      expect(result).toContain(REDACTED);
      expect(result).not.toContain("pk_live_");
    });

    test("password=<value> assignment literal is redacted", () => {
      // \S+ is intentionally greedy — it consumes everything after the = up to
      // the next whitespace, including any trailing &key=val pairs.  This is
      // deliberate over-redaction: we prefer losing adjacent params to leaking
      // any part of a credential value.
      const result = maskSensitiveFields(
        "POST /login password=cleartext_password_test&user=alice",
      ) as string;
      expect(result).toContain(REDACTED);
      expect(result).not.toContain("cleartext_password_test");
      // Text before the match is preserved; text after is consumed by \S+
      expect(result).toContain("POST /login");
    });

    test("JWT three-segment value is redacted from a free-form string", () => {
      const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4";
      const result = maskSensitiveFields(`Token found: ${jwt}`) as string;
      expect(result).toContain(REDACTED);
      expect(result).not.toContain("eyJhbGciOiJSUzI1NiJ9");
    });

    test("REDACTED constant equals the exact sentinel string", () => {
      expect(REDACTED).toBe("[REDACTED_BY_SENTINEL]");
    });

    test("SENSITIVE_KEY_TRIGGERS contains all core risk categories", () => {
      const triggers = SENSITIVE_KEY_TRIGGERS as readonly string[];
      expect(triggers).toContain("password");
      expect(triggers).toContain("secret");
      expect(triggers).toContain("token");
      expect(triggers).toContain("authorization");
      expect(triggers).toContain("bearer");
      expect(triggers).toContain("api_key");
    });

    test("CREDENTIAL_PATTERNS array is non-empty and contains RegExp instances", () => {
      expect(CREDENTIAL_PATTERNS.length).toBeGreaterThan(0);
      for (const p of CREDENTIAL_PATTERNS) {
        expect(p).toBeInstanceOf(RegExp);
      }
    });
  });
});
