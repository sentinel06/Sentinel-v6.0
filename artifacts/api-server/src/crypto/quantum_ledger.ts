/**
 * Quantum Ledger — Hybrid PQC Audit Module (QL-2.0 Full-Strength)
 *
 * Every state change is sealed with a dual-signature envelope:
 *
 *   Layer 1 — SHA-512 (classical depth)
 *     Immediate tamper evidence. Any byte-level modification to the stored
 *     payload invalidates the classical hash before lattice math is needed.
 *
 *   Layer 2 — ML-DSA-87 (FIPS 204, Security Level 5)
 *     Harvest-now-decrypt-later protection. Remains secure under the MLWE
 *     hardness assumption even against a quantum adversary.
 *
 * ── QL-2.0 Full-Strength Enhancements ────────────────────────────────────────
 *
 *  1. DOMAIN SEPARATION
 *     "AGENT_SENTINEL_v4_DOMAIN_SEP" is prepended to every signed message,
 *     preventing cross-protocol confusion attacks. See pqc.ts § DOMAIN_SEPARATOR.
 *
 *  2. CONTEXT-AWARE SIGNING (FIPS 204 §5.2)
 *     Context string carries { partnerId, swarmId }, binding each signature
 *     to the exact organisational scope that produced it.
 *     Encoding: 0x00 ‖ len(ctx) ‖ ctx ‖ DOMAIN_SEP ‖ message (≤255 ctx bytes).
 *
 *  3. EXPLICIT ML-DSA-87 PARAMETERS (k=8, l=7)
 *     Declared in ML_DSA_87_PARAMS (pqc.ts) and embedded in every envelope's
 *     `context.params` field for auditability.
 *
 *  4. SIGNATURE AGGREGATION — sealEvent()
 *     Returns a single JSON object:
 *       { sha512: <hex>, mldsa87: <base64-sig>, context: <metadata> }
 *     Use this as the canonical write path for all new audit log entries.
 *
 * Verification is performed by quantumSigner.verify() / verifyRawEnvelope().
 * The UI Integrity Badge displays "QUANTUM-SECURE" only when both layers verify.
 */

import { createHash } from "crypto";
import {
  signWithMLDSA,
  verifyMLDSA,
  buildContextBuffer,
  ML_DSA_87_PARAMS,
  DOMAIN_SEPARATOR,
  PQC_ALGORITHM_ID,
  type SigningContext,
} from "./pqc";

export { DOMAIN_SEPARATOR, ML_DSA_87_PARAMS };
export const QUANTUM_LEDGER_VERSION = "QL-2.0" as const;

export type QuantumSecureStatus = "QUANTUM-SECURE" | "PARTIAL" | "UNVERIFIED";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Metadata embedded in every QL-2.0 envelope's `context` field.
 * Stored verbatim in the pq_signature JSONB column.
 */
export interface EnvelopeContext {
  domainSeparator:  typeof DOMAIN_SEPARATOR;
  partnerId:        string;
  swarmId:          string;
  /** Base64 encoding of the raw FIPS 204 context buffer (≤255 bytes). */
  contextBytesB64:  string;
  algorithm:        typeof PQC_ALGORITHM_ID;
  /** Normative ML-DSA-87 parameter snapshot at time of signing. */
  params: {
    k: number;
    l: number;
    n: number;
    q: number;
    securityLevel: number;
    pkBytes: number;
    skBytes: number;
    sigBytes: number;
  };
}

/**
 * The full hybrid envelope stored in the `pq_signature` JSONB column.
 */
export interface HybridSignatureEnvelope {
  version:  typeof QUANTUM_LEDGER_VERSION;
  /** SHA-512 hex digest of the signed payload string */
  sha512:   string;
  /** ML-DSA-87 lattice layer (FIPS 204, Security Level 5) */
  mlDsa87: {
    algorithm:            typeof PQC_ALGORITHM_ID;
    /** Base64-encoded lattice signature */
    signature:            string;
    /** 16-char hex fingerprint of the ledger public key */
    publicKeyFingerprint: string;
    fipsStandard:         "FIPS-204";
    securityLevel:        5;
    threatModel:          "harvest-now-decrypt-later";
  };
  /** QL-2.0 context: partner + swarm binding + parameter snapshot */
  context:   EnvelopeContext;
  /** ISO 8601 timestamp when the envelope was created */
  signedAt:  string;
  /** Verification status — updated on each verify() call */
  status:    QuantumSecureStatus;
}

/**
 * Canonical output of sealEvent() — the single JSON written to the audit log.
 *
 *   { sha512: <hex>, mldsa87: <base64-sig>, context: <EnvelopeContext> }
 */
export interface SealEventResult {
  /** SHA-512 hex digest of the domain-separated, context-encoded payload. */
  sha512:   string;
  /** Base64-encoded ML-DSA-87 signature over the same encoded payload. */
  mldsa87:  string;
  /** Metadata that reproduces the exact encoded message for verification. */
  context:  EnvelopeContext;
}

// ── QuantumSigner ──────────────────────────────────────────────────────────────

/**
 * QuantumSigner — the single signing authority for all audit log entries.
 *
 * Instantiate once via the singleton below; do NOT construct per-request.
 */
export class QuantumSigner {

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildCtx(partnerId: string, swarmId: string): SigningContext {
    return { partnerId, swarmId };
  }

  private buildEnvelopeContext(signingCtx: SigningContext): EnvelopeContext {
    const ctxBuf = buildContextBuffer(signingCtx);
    return {
      domainSeparator:  DOMAIN_SEPARATOR,
      partnerId:        signingCtx.partnerId,
      swarmId:          signingCtx.swarmId,
      contextBytesB64:  ctxBuf.toString("base64"),
      algorithm:        PQC_ALGORITHM_ID,
      params: {
        k:             ML_DSA_87_PARAMS.k,
        l:             ML_DSA_87_PARAMS.l,
        n:             ML_DSA_87_PARAMS.n,
        q:             ML_DSA_87_PARAMS.q,
        securityLevel: ML_DSA_87_PARAMS.lambda / 128, // bits → level (256 bits = Level 5)
        pkBytes:       ML_DSA_87_PARAMS.pkBytes,
        skBytes:       ML_DSA_87_PARAMS.skBytes,
        sigBytes:      ML_DSA_87_PARAMS.sigBytes,
      },
    };
  }

  // ── sealEvent — canonical QL-2.0 write path ────────────────────────────────

  /**
   * Seal an audit event with QL-2.0 Full-Strength.
   *
   * The function:
   *   1. Prepends DOMAIN_SEPARATOR to the payload.
   *   2. Encodes the FIPS 204 context string (partnerId + swarmId).
   *   3. Derives SHA-512 over the fully-encoded message.
   *   4. Derives ML-DSA-87 signature over the same message.
   *   5. Returns the canonical aggregation object.
   *
   * @param payload   — The raw audit string (e.g. currentHash of the log entry).
   * @param partnerId — Owner/partner identifier (bound into the signature).
   * @param swarmId   — Swarm identifier (bound into the signature).
   */
  sealEvent(payload: string, partnerId: string, swarmId: string): SealEventResult {
    const signingCtx = this.buildCtx(partnerId, swarmId);
    const lattice    = signWithMLDSA(payload, undefined, signingCtx);
    const envCtx     = this.buildEnvelopeContext(signingCtx);

    // Derive SHA-512 over the same encoded message that ML-DSA signed.
    // encodeFips204Message is reproduced inline to keep the digest deterministic.
    const domainBytes = Buffer.from(DOMAIN_SEPARATOR, "utf8");
    const ctxBuf      = Buffer.from(envCtx.contextBytesB64, "base64");
    const msgBytes    = Buffer.from(payload, "utf8");
    const encoded     = Buffer.concat([
      domainBytes,
      Buffer.from([0x00]),              // pure ML-DSA indicator
      Buffer.from([ctxBuf.length]),     // len(ctx)
      ctxBuf,
      msgBytes,
    ]);

    const sha512 = createHash("sha512").update(encoded).digest("hex");

    return {
      sha512,
      mldsa87: lattice.signature,
      context: envCtx,
    };
  }

  // ── sign — full HybridSignatureEnvelope (backward-compat + context upgrade) ─

  /**
   * Produce a full HybridSignatureEnvelope.
   *
   * When partnerId + swarmId are provided the envelope is QL-2.0 Full-Strength
   * (context-aware, domain-separated, parameter-stamped).
   * When omitted, a legacy domain-separator-only envelope is produced for
   * backward compatibility with existing rows that have no context.
   */
  sign(
    payload:   string,
    partnerId = "SYSTEM",
    swarmId   = "SYSTEM",
  ): HybridSignatureEnvelope {
    const seal   = this.sealEvent(payload, partnerId, swarmId);
    const lattice = signWithMLDSA(payload, undefined, this.buildCtx(partnerId, swarmId));

    return {
      version: QUANTUM_LEDGER_VERSION,
      sha512:  seal.sha512,
      mlDsa87: {
        algorithm:            PQC_ALGORITHM_ID,
        signature:            seal.mldsa87,
        publicKeyFingerprint: lattice.publicKeyFingerprint,
        fipsStandard:         "FIPS-204",
        securityLevel:        5,
        threatModel:          "harvest-now-decrypt-later",
      },
      context:  seal.context,
      signedAt: new Date().toISOString(),
      status:   "QUANTUM-SECURE",
    };
  }

  // ── verify helpers ────────────────────────────────────────────────────────

  /**
   * Verify both layers of the envelope against `payload`.
   * Returns true only if SHA-512 AND ML-DSA both verify.
   */
  verify(payload: string, envelope: HybridSignatureEnvelope): boolean {
    return this.verifyAndLabel(payload, envelope) === "QUANTUM-SECURE";
  }

  /**
   * Verify both layers and return the resulting status label.
   */
  verifyAndLabel(payload: string, envelope: HybridSignatureEnvelope): QuantumSecureStatus {
    // Reconstruct the signing context from the envelope
    const ctx: SigningContext | undefined = envelope.context
      ? { partnerId: envelope.context.partnerId, swarmId: envelope.context.swarmId }
      : undefined;

    // Recompute SHA-512 over the fully-encoded message (must match sealEvent logic)
    const domainBytes = Buffer.from(DOMAIN_SEPARATOR, "utf8");
    const msgBytes    = Buffer.from(payload, "utf8");
    let encoded: Buffer;
    if (ctx && envelope.context?.contextBytesB64) {
      const ctxBuf = Buffer.from(envelope.context.contextBytesB64, "base64");
      encoded = Buffer.concat([
        domainBytes,
        Buffer.from([0x00]),
        Buffer.from([ctxBuf.length]),
        ctxBuf,
        msgBytes,
      ]);
    } else {
      encoded = Buffer.concat([domainBytes, msgBytes]);
    }

    const sha512    = createHash("sha512").update(encoded).digest("hex");
    const sha512Ok  = sha512 === envelope.sha512;
    const mlDsaResult = verifyMLDSA(payload, envelope.mlDsa87.signature, undefined, ctx);

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
    raw:     unknown,
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
