/**
 * maskPayloadSecrets — pre-ingest sanitisation middleware.
 *
 * Intercepts incoming audit-log submissions and scrubs req.body.payload (and
 * the optional req.body.metadata / req.body.rationale blocks) before any Zod
 * validation or DB write.  Prevents raw authentication credentials, secret
 * keys, and bearer tokens from being persisted to the immutable ledger.
 *
 * The redaction logic lives in sanitizerCore.ts (zero dependencies) so it can
 * be unit-tested independently of Express, Pino, or any DB connection.
 *
 * The middleware is intentionally fail-open: if an unexpected error occurs
 * during sanitisation the request is allowed through unmodified and a warning
 * is emitted so the incident can be investigated without dropping events.
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";
import { maskSensitiveFields } from "./sanitizerCore";

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
          req.body.payload = maskSensitiveFields(req.body.payload);
        }
        if ("metadata" in req.body) {
          req.body.metadata = maskSensitiveFields(req.body.metadata);
        }
        if ("rationale" in req.body && typeof req.body.rationale === "string") {
          req.body.rationale = maskSensitiveFields(req.body.rationale);
        }
      }
    } catch (err) {
      // Fail-open: log and continue — never drop a legitimate audit event.
      logger.warn({ err }, "maskPayloadSecrets: sanitisation error; passing body unmodified");
    }
    next();
  };
}
