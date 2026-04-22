/**
 * safeCompare — constant-time string comparison.
 *
 * Defends against timing-oracle attacks where an attacker measures the
 * server's response time to discover signature/key bytes one-by-one.
 *
 * `===` and `Buffer.compare` exit early on the first byte mismatch.
 * `crypto.timingSafeEqual` always walks the full buffer length, so the
 * elapsed time leaks no information about the matching prefix.
 *
 * Length mismatches are returned as `false` immediately because they
 * leak only the *length* of the expected value (not its content), and
 * the timingSafeEqual API itself throws on unequal-length buffers.
 */

import crypto from "node:crypto";

export const safeCompare = (received: string, expected: string): boolean => {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export default safeCompare;
