/**
 * sanitizerCore — pure redaction engine, zero external dependencies.
 *
 * Exported so the unit-test suite can import and exercise each primitive
 * in isolation without Express, Pino, or any DB connection.
 *
 * Public API
 * ──────────
 *   REDACTED               — canonical replacement sentinel string
 *   SENSITIVE_KEY_TRIGGERS — words that classify a key as sensitive
 *   CREDENTIAL_PATTERNS    — compiled regexes for value scrubbing
 *   isSensitiveKey(key)    — returns true when key contains a trigger word
 *   maskSensitiveFields(v) — recursively sanitises objects / arrays / strings
 */

// ── Replacement sentinel ──────────────────────────────────────────────────────
export const REDACTED = "[REDACTED_BY_SENTINEL]";

// ── Sensitive key trigger words ───────────────────────────────────────────────
// A JSON key is classified as sensitive when its normalised form (lowercase +
// hyphens/spaces → underscores) contains any of these substrings.
// This catches compound names like "secret_token", "system_password",
// "jwt_auth_token", "my_api_key_value", etc. without enumerating every variant.
export const SENSITIVE_KEY_TRIGGERS: readonly string[] = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "private_key",
  "privatekey",
  "credential",
  "bearer",
  "sentinel_key",
  "api_secret",
  "apisecret",
];

/**
 * Returns true when a key name contains any sensitive trigger word.
 *
 * Normalisation: lowercase + replace hyphens/spaces with underscores.
 * Examples that evaluate to true:
 *   "secret_token"   — contains "secret" and "token"
 *   "system_password"— contains "password"
 *   "BEARER_TOKEN"   — normalises to "bearer_token", contains "bearer"
 *   "jwt-auth-token" — normalises to "jwt_auth_token", contains "token"
 *   "my_api_key"     — contains "api_key"
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-\s]/g, "_");
  return SENSITIVE_KEY_TRIGGERS.some((trigger) => normalized.includes(trigger));
}

// ── Credential pattern regexes ────────────────────────────────────────────────
// Compiled once at module load — never inside a hot path.
// NOTE: avoid any literal "*/" inside this array — it would close the JSDoc.
export const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  // "Bearer <token>" with whitespace separator (header-value style)
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // "bearer_<word>" or "bearer-<word>" — underscore/hyphen variant (no space)
  /\bbearer[_\-][A-Za-z0-9_\-]{6,}/gi,
  // Sentinel / Stripe-style secret keys: sk_<tier>_<payload>
  /\bsk_[a-z]+_[A-Za-z0-9_\-]{16,}/g,
  // Public-key equivalents: pk_<tier>_<payload>
  /\bpk_[a-z]+_[A-Za-z0-9_\-]{16,}/g,
  // password=<value> / token=<value> in query-string-style literals
  /\b(?:password|passwd|secret|token)=\S+/gi,
  // JWT shape — three base64url segments separated by dots
  /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
];

// Internal recursive worker — depth guard prevents stack overflow on circular /
// pathologically deep structures. Kept private; callers use maskSensitiveFields.
function sanitise(value: unknown, depth: number): unknown {
  if (depth > 20) return value;

  if (Array.isArray(value)) {
    return value.map((el) => sanitise(el, depth + 1));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = isSensitiveKey(k) ? REDACTED : sanitise(v, depth + 1);
    }
    return result;
  }

  if (typeof value === "string") {
    let s = value;
    for (const pattern of CREDENTIAL_PATTERNS) {
      // Clone the pattern so resetting lastIndex is safe even if the same
      // compiled regex is reused across concurrent requests.
      const p = new RegExp(pattern.source, pattern.flags);
      s = s.replace(p, REDACTED);
    }
    return s;
  }

  // Numbers, booleans, null — pass through unchanged.
  return value;
}

/**
 * Recursively sanitise an arbitrary value.
 *
 * - Objects : sensitive keys → REDACTED; all others recursed into.
 * - Arrays  : each element recursed into.
 * - Strings : CREDENTIAL_PATTERNS applied; surrounding text preserved.
 * - Other   : returned as-is (number, boolean, null, undefined).
 */
export function maskSensitiveFields(value: unknown): unknown {
  return sanitise(value, 0);
}
