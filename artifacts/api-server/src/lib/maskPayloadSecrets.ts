/**
 * maskPayloadSecrets — pre-ingest sanitisation middleware.
 *
 * Intercepts incoming audit-log submissions and scrubs req.body.payload (and
 * the optional req.body.metadata block) before any Zod validation or DB write.
 * Prevents raw authentication credentials, secret keys, and bearer tokens from
 * being persisted to the immutable ledger.
 *
 * Sanitisation strategy
 * ─────────────────────
 * 1. Sensitive-key replacement — any JSON key whose name matches the list below
 *    has its entire value replaced with the "[REDACTED]" sentinel string.
 *    Keys are matched case-insensitively.
 *
 * 2. Pattern scrubbing — for all other string values, a set of regexes strips
 *    sub-string credential patterns (Bearer tokens, sk_ and pk_ API keys, and
 *    common password-assignment literals). The surrounding text is preserved.
 *
 * The middleware is intentionally fail-open: if an unexpected error occurs
 * during sanitisation the request is allowed through unmodified and a warning
 * is emitted so the incident can be investigated without dropping legitimate
 * audit events.
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// ── Sensitive key names (case-insensitive exact match) ────────────────────────
const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "pass",
  "secret",
  "secret_key",
  "secretkey",
  "api_key",
  "apikey",
  "api_secret",
  "apisecret",
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "auth_token",
  "authtoken",
  "authorization",
  "private_key",
  "privatekey",
  "client_secret",
  "clientsecret",
  "bearer",
  "credential",
  "credentials",
  "x-sentinel-key",
  "x-api-key",
]);

// ── Credential pattern regexes ────────────────────────────────────────────────
// Each regex targets a well-known credential shape in free-form string values.
// Compiled once at module load — never inside the request hot path.
// NOTE: avoid any literal "*/" inside this array — it would close the JSDoc block.
const CREDENTIAL_PATTERNS: RegExp[] = [
  // "Bearer <token>" in header-value strings
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // Sentinel / Stripe-style secret keys: sk_<tier>_<payload>
  /\bsk_[a-z]+_[A-Za-z0-9_\-]{16,}/g,
  // Public-key equivalents: pk_<tier>_<payload>
  /\bpk_[a-z]+_[A-Za-z0-9_\-]{16,}/g,
  // password=<value> / token=<value> in query-string-style literals
  /\b(?:password|passwd|secret|token)=\S+/gi,
  // JWT shape — three base64url segments separated by dots
  /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
];

const REDACTED = "[REDACTED_BY_SENTINEL]";

/**
 * Recursively sanitise a value.
 *   Objects  — inspect each key; sensitive keys get full value replacement;
 *              non-sensitive keys are recursed into.
 *   Arrays   — each element is recursed into.
 *   Strings  — all CREDENTIAL_PATTERNS are applied.
 *   Other    — returned as-is (numbers, booleans, null).
 */
function sanitise(value: unknown, depth = 0): unknown {
  // Guard against pathologically deep structures.
  if (depth > 20) return value;

  if (Array.isArray(value)) {
    return value.map((el) => sanitise(el, depth + 1));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : sanitise(v, depth + 1);
    }
    return result;
  }

  if (typeof value === "string") {
    let s = value;
    for (const pattern of CREDENTIAL_PATTERNS) {
      // Reset lastIndex on every pass — patterns use the `g` flag.
      pattern.lastIndex = 0;
      s = s.replace(pattern, REDACTED);
    }
    return s;
  }

  return value;
}

/**
 * Express middleware — sanitises req.body.payload, req.body.metadata, and
 * req.body.rationale in place before the route handler writes to the DB.
 * Must be mounted after express.json() so req.body is already a parsed object.
 */
export function maskPayloadSecrets() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (req.body && typeof req.body === "object") {
        if ("payload" in req.body) {
          req.body.payload = sanitise(req.body.payload);
        }
        if ("metadata" in req.body) {
          req.body.metadata = sanitise(req.body.metadata);
        }
        if ("rationale" in req.body && typeof req.body.rationale === "string") {
          req.body.rationale = sanitise(req.body.rationale);
        }
      }
    } catch (err) {
      // Fail-open: log and continue — never drop a legitimate audit event.
      logger.warn({ err }, "maskPayloadSecrets: sanitisation error; passing body unmodified");
    }
    next();
  };
}
