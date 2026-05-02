/**
 * Sentinel Sovereign Crypto — FIPS-204 / ML-DSA-87 signing.
 *
 * Real post-quantum signing layer. Replaces the previous SENTINEL_SIG_*
 * placeholder constant.
 *
 * Provides:
 *   • One sovereign keypair per process (lazy, from SENTINEL_SIGNING_SEED
 *     env hex if present — deterministic — else 32 random bytes).
 *   • signWithContext(service, payload) — prepends the service name to
 *     the canonicalized payload before signing. This domain-separation
 *     defends against cross-service signature replay (an itasca heartbeat
 *     can never validate as a gatekeeper admission and vice versa).
 *   • getPublicKeyFingerprint() — SHA-256(publicKey), first 8 bytes,
 *     formatted XX:XX:XX:XX:XX:XX:XX:XX, for human-readable seal display.
 *
 * Why ML-DSA-87 (Dilithium5)?
 *   FIPS-204 standard, NIST-selected, ~256-bit post-quantum security level,
 *   ~4627-byte signatures. Used because the Sentinel seal must remain
 *   verifiable against future quantum-capable adversaries.
 */

import { ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";
import { createHash, randomBytes } from "node:crypto";
import { logger } from "./logger";

interface Keypair {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

let cachedKeypair: Keypair | null = null;
let cachedFingerprint: string | null = null;

/**
 * Resolve a 32-byte signing seed.
 *
 * Priority:
 *   1. SENTINEL_SIGNING_SEED env (64-char hex) — deterministic, key persists
 *      across restarts so attestations remain verifiable by callers who
 *      cached the public key.
 *   2. Random 32 bytes — keypair regenerates per process. Fingerprint
 *      changes on restart; fine for ephemeral dev, BAD for production.
 */
function resolveSeed(): Uint8Array {
  const hex = process.env["SENTINEL_SIGNING_SEED"];
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Uint8Array.from(Buffer.from(hex, "hex"));
  }
  if (hex) {
    logger.warn(
      "SENTINEL_SIGNING_SEED is set but not a 64-char hex string — ignoring and generating random seed.",
    );
  }
  logger.warn(
    "SENTINEL_SIGNING_SEED not set — generating ephemeral keypair. " +
      "Public-key fingerprint will change on every restart. " +
      "Set SENTINEL_SIGNING_SEED to a stable 64-char hex value for production.",
  );
  return Uint8Array.from(randomBytes(32));
}

function getKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;
  const seed = resolveSeed();
  const kp = ml_dsa87.keygen(seed);
  cachedKeypair = { publicKey: kp.publicKey, secretKey: kp.secretKey };
  return cachedKeypair;
}

/**
 * SHA-256(publicKey) truncated to 8 bytes, colon-separated, uppercased.
 *   e.g. "7A:F3:9C:21:E4:8B:5D:62"
 */
export function getPublicKeyFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;
  const { publicKey } = getKeypair();
  const digest = createHash("sha256").update(publicKey).digest();
  const bytes = digest.subarray(0, 8);
  cachedFingerprint = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
  return cachedFingerprint;
}

/**
 * Build the canonical message bound to a specific service.
 *
 *   "<service>|<JSON.stringify(payload)>"
 *
 * The service name is OUTSIDE the JSON envelope so it can never be confused
 * with a payload field. The pipe separator is reserved (not a valid JSON
 * character at top level) so an attacker cannot construct a payload that
 * collides with another service's message.
 */
function bindContext(service: string, payload: unknown): Uint8Array {
  const message = `${service}|${JSON.stringify(payload)}`;
  return new TextEncoder().encode(message);
}

/**
 * Sign a payload with sovereign sovereign-bound context.
 * Returns a base64 signature string suitable for transport.
 */
export function signWithContext(service: string, payload: unknown): string {
  const { secretKey } = getKeypair();
  const message = bindContext(service, payload);
  // @noble/post-quantum 0.6.x signature: sign(message, secretKey)
  const sig = ml_dsa87.sign(message, secretKey);
  return Buffer.from(sig).toString("base64");
}

/**
 * Verify a signature against a payload + service binding. Used by
 * downstream consumers / tests to validate the seal.
 */
export function verifyWithContext(
  service: string,
  payload: unknown,
  signatureBase64: string,
): boolean {
  try {
    const { publicKey } = getKeypair();
    const message = bindContext(service, payload);
    const sig = Uint8Array.from(Buffer.from(signatureBase64, "base64"));
    // @noble/post-quantum 0.6.x signature: verify(signature, message, publicKey)
    return ml_dsa87.verify(sig, message, publicKey);
  } catch {
    return false;
  }
}

/** Returns the public key as a base64 string for distribution. */
export function getPublicKeyBase64(): string {
  return Buffer.from(getKeypair().publicKey).toString("base64");
}

export const SENTINEL_ALGORITHM = "ML-DSA-87" as const;
export const SENTINEL_STANDARD = "FIPS-204" as const;
