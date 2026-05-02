/**
 * Sentinel v6.0 — Sovereign Attestation envelope.
 *
 * Static-ish seal carrier. The `signature` field here is the public-key
 * fingerprint (an identity for the signing keypair, NOT a per-payload
 * signature). Real cryptographic signatures over request payloads are
 * produced by lib/crypto's signWithContext() at the route layer.
 *
 * Surfaces consuming this module:
 *   • routes/badge.ts        — embeds fingerprint in SVG <metadata> + <title>
 *   • routes/attestation.ts  — JSON endpoint (adds real signature on top)
 *   • CLI (`tsx src/attestation.ts`) — operator inspection
 */

import { getPublicKeyFingerprint } from "./lib/crypto";

export const getAttestation = () => ({
  status: "verified" as const,
  signature: getPublicKeyFingerprint(), // public-key identifier
  timestamp: new Date().toISOString(),
});

// CLI entry — only executes when invoked directly (e.g. `tsx src/attestation.ts`)
const isDirect = (() => {
  try {
    const invoked = process.argv[1] ?? "";
    return invoked.endsWith("attestation.ts") || invoked.endsWith("attestation.js");
  } catch {
    return false;
  }
})();

if (isDirect) {
  const env = process.env.GITHUB_ENVIRONMENT ?? "(unset)";
  const seal = getAttestation();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ environment: env, ...seal }, null, 2));
}
