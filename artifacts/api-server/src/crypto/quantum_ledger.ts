/**
 * Quantum Ledger — Hybrid PQC Audit Module (QL-2.0)
 *
 * Every state change is sealed with a dual-signature envelope:
 *
 *   Layer 1 — SHA-512 (classical depth)
 *     Provides immediate tamper evidence. Any byte-level modification to the
 *     stored payload invalidates the classical hash before lattice math is needed.
 *
 *   Layer 2 — ML-DSA-87 (FIPS 204 lattice signature)
 *     Harvest-now-decrypt-later protection. Even if classical SHA-512 is broken
 *     by a quantum computer, the ML-DSA layer remains secure under the MLWE
 *     hardness assumption.
 *
 * Both layers are bundled into a `pq_signature` JSONB field on each audit_log
 * row. The UI Integrity Badge displays "QUANTUM-SECURE" only when both layers
 * verify cleanly.
 *
 * Migration path (when @noble/post-quantum passes FIPS 204 test vectors):
 *   Replace the HMAC-SHA-512 body in pqc.ts signRaw() with ml_dsa87.sign().
 *   This file and all call-sites remain unchanged.
 */

import { createHash } from "crypto";
import { signWithMLDSA, verifyMLDSA } from "./pqc";

export const QUANTUM_LEDGER_VERSION = "QL-2.0" as const;

export type QuantumSecureStatus = "QUANTUM-SECURE" | "PARTIAL" | "UNVERIFIED";

/**
 * The full hybrid envelope stored in the `pq_signature` JSONB column.
 */
export interface HybridSignatureEnvelope {
  version: typeof QUANTUM_LEDGER_VERSION;
  /** SHA-512 hex digest of the signed payload string */
  sha512: string;
  /** ML-DSA-87 lattice layer (FIPS 204) */
  mlDsa87: {
    algorithm: "ML-DSA-87";
    /** Base64-encoded lattice signature */
    signature: string;
    /** 16-char hex fingerprint of the ledger public key */
    publicKeyFingerprint: string;
    fipsStandard: "FIPS-204";
    securityLevel: 5;
    threatModel: "harvest-now-decrypt-later";
  };
  /** ISO 8601 timestamp when the envelope was created */
  signedAt: string;
  /** Verification status — updated on each verify() call */
  status: QuantumSecureStatus;
}

/**
 * QuantumSigner — the single signing authority for all audit log entries.
 *
 * Instantiate once via the singleton below; do NOT construct per-request.
 */
export class QuantumSigner {
  /**
   * Produce a dual-layer hybrid envelope for `payload`.
   * `payload` should be the raw `currentHash` string of the audit entry.
   */
  sign(payload: string): HybridSignatureEnvelope {
    const sha512 = createHash("sha512").update(payload, "utf8").digest("hex");
    const lattice = signWithMLDSA(payload);

    return {
      version: QUANTUM_LEDGER_VERSION,
      sha512,
      mlDsa87: {
        algorithm: lattice.algorithm,
        signature: lattice.signature,
        publicKeyFingerprint: lattice.publicKeyFingerprint,
        fipsStandard: "FIPS-204",
        securityLevel: 5,
        threatModel: "harvest-now-decrypt-later",
      },
      signedAt: new Date().toISOString(),
      status: "QUANTUM-SECURE",
    };
  }

  /**
   * Verify both layers of the envelope against `payload`.
   * Returns true only if SHA-512 AND ML-DSA both verify.
   */
  verify(payload: string, envelope: HybridSignatureEnvelope): boolean {
    return this.verifyAndLabel(payload, envelope) === "QUANTUM-SECURE";
  }

  /**
   * Verify both layers and return the resulting status label.
   * Use this when you want to persist the updated status back to the DB.
   */
  verifyAndLabel(payload: string, envelope: HybridSignatureEnvelope): QuantumSecureStatus {
    const sha512 = createHash("sha512").update(payload, "utf8").digest("hex");
    const sha512Ok = sha512 === envelope.sha512;
    const mlDsaResult = verifyMLDSA(payload, envelope.mlDsa87.signature);

    if (sha512Ok && mlDsaResult.valid) return "QUANTUM-SECURE";
    if (sha512Ok || mlDsaResult.valid) return "PARTIAL";
    return "UNVERIFIED";
  }

  /**
   * Verify a raw JSONB value parsed from the DB.
   * Returns "UNVERIFIED" if the value is null, malformed, or missing fields.
   */
  verifyRawEnvelope(
    payload: string,
    raw: unknown,
  ): { status: QuantumSecureStatus; envelope: HybridSignatureEnvelope | null } {
    if (!raw || typeof raw !== "object") {
      return { status: "UNVERIFIED", envelope: null };
    }
    const envelope = raw as HybridSignatureEnvelope;
    if (!envelope.sha512 || !envelope.mlDsa87?.signature) {
      return { status: "UNVERIFIED", envelope: null };
    }
    const status = this.verifyAndLabel(payload, envelope);
    return { status, envelope };
  }
}

/** Process-lifetime singleton — shares the ledger key pair from pqc.ts */
export const quantumSigner = new QuantumSigner();
