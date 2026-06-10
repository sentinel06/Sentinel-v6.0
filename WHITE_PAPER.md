# WHITE PAPER: MaroShield v6.0
**The Sovereign Infrastructure for Agentic Governance**

---

## 1. Executive Summary

By 2026, autonomous agents have moved from experimental prompts to production-grade orchestration. However, the "Agentic Gap" — the delta between autonomous action and human accountability — remains the primary barrier to global adoption. MaroShield provides a Zero-Trust Governance Layer that bridges this gap through active circuit breaking, cryptographic integrity, and post-quantum audit provenance.

The platform is engineered for compliance with the **EU AI Act 2026** (Art. 12 audit logging, Art. 14 human oversight), **NIST AI RMF 2026**, and **FIPS-204 ML-DSA-87** post-quantum signature standards.

---

## 2. The Governance Stack

### 2.1 Phase 1: The Integrity Ledger (Current — v6.0)

The foundation of MaroShield is the SHA-512 + ML-DSA-87 Hash Chain. Every intent, tool call, and result is chained in a WORM (Write-Once, Read-Many) ledger with post-quantum signatures.

**Immutable Audit Ledger:** Every agent action is committed with a SHA-512 hash over the previous entry, forming a tamper-evident chain. Any retroactive mutation breaks all subsequent hashes — immediately detectable by the chain verifier.

**Post-Quantum Signatures (FIPS-204 SL5):** Each event carries an ML-DSA-87 lattice-based signature (the highest NIST security level), resistant to CRQC-class quantum adversaries.

**Art. 14 Evidence Bags:** Sentinel generates cryptographically signed PDF audit reports providing a verifiable audit trail for regulatory bodies.

**Honey-Token Traps:** A proactive defense layer utilizing forbidden "Ghost Tools." Any attempt to invoke these triggers an immediate protocol revocation and writes an `AGENT_REVOKED` event to the ledger.

### 2.2 Phase 2: Swarm Ancestry Tracking (2027)

In multi-agent environments, a "Logic Poisoning" event in a sub-agent can cascade. MaroShield implements Swarm Ancestry Tracking, assigning a `parentTraceId` to every cross-agent handoff.

**Causal Topology Graph:** The forensic Causal Dependency Graph reconstructs the exact attack vector from initial stimulus to harmful action — making cross-agent contamination immediately visible without requiring operators to inspect raw hashes.

**Trust Decay Algorithms:** Sentinel monitors the cognitive consistency score of the entire swarm. If one node's integrity fails, the mesh identifies "Patient Zero" and quarantines the specific logic branch.

---

## 3. Advanced Security Protocols

### 3.1 Two-Man Rule — Sovereign Multi-Sig Gate

The Sovereign Multi-Sig Gate enforces the **Two-Man Rule** at every AI governance correction event (EU AI Act Art. 14 §3). No single operator can unilaterally alter a committed rationale or tool parameter.

Both the Operator and an independent Sovereign key holder must co-sign every correction using ML-DSA-87 dual signatures. On success, a `RECURSIVE_FIX_VERIFIED` event is permanently written to the ledger, and the Causal Topology Map triggers a White-Gold Surge confirmation animation.

### 3.2 Kill Switch (Emergency Solo Revoke)

For critical breaches where the Two-Man Rule cannot be satisfied within acceptable time, the Kill Switch bypasses the dual-sig gate and immediately revokes an agent by writing an `EMERGENCY_SOLO_REVOKE` event. This action is itself permanently audited and included in all subsequent compliance reports.

### 3.3 Post-Interdiction Fix Monitor

After any successful interdiction, the affected agent enters the Fix Monitor — a 100-event window of 100% ML-DSA-87 signature sampling. Any event during this window without a valid quantum signature is immediately flagged as anomalous and triggers a War Room alert.

---

## 4. Post-Quantum Signing — ML-DSA-87 (FIPS-204 SL5)

MaroShield uses the **ML-DSA-87** variant of the Module Lattice-Based Digital Signature Algorithm, standardised as **NIST FIPS-204** at Security Level 5 — the highest available, providing 256-bit collision resistance equivalent to AES-256.

Every signature is **context-bound** to `{ partnerId, swarmId }` — preventing cross-tenant signature replay attacks. Signatures are wrapped in a **Hybrid Signature Envelope (QL-2.0)** combining SHA-512-HMAC and ML-DSA-87, providing harvest-now-decrypt-later resistance.

---

## 5. EU AI Act 2026 Compliance Mapping

| Feature | EU AI Act Article | Requirement |
|---------|------------------|-------------|
| Hash-Chained Audit Ledger | **Art. 12 §1** | Automatic logging of high-risk AI decisions |
| Immutable Chain Integrity | **Art. 12 §2** | Tamper-evident, irreversible records |
| Post-Quantum Signatures | **Art. 12 §3** | Long-term cryptographic non-repudiation |
| Human Oversight Dashboard | **Art. 14 §1** | Meaningful human oversight capability |
| Cognitive Drift Detection | **Art. 14 §2** | Automated anomaly flagging |
| Two-Man Rule Gate | **Art. 14 §3** | Dual-authorization for corrections |
| Kill Switch | **Art. 14 §4** | Emergency stop capability |

**EU AI Act 2026 Deadline:** All high-risk AI deployments must achieve full compliance by **2026-08-02**.

---

## 6. Roadmap

| Phase | Target | Feature |
|-------|--------|---------|
| **v6.0** | Now | ML-DSA-87 hybrid signatures, Two-Man Rule gate, Causal Topology, Swarm Map, per-tenant isolation |
| **v6.1** | Q3 2026 | `@noble/post-quantum` full ML-DSA-87 integration (replace HMAC abstraction layer) |
| **v6.2** | Q3 2026 | Hardware Security Module (HSM) integration for sovereign key storage |
| **v6.3** | Q4 2026 | Multi-jurisdiction ledger replication (EU data residency) |
| **v7.0** | Q1 2027 | ML-KEM-1024 session encryption (full PQC transport layer) |
| **v7.1** | Q2 2027 | SLSA Level 4 supply-chain provenance for all agent model weights |

---

*MaroShield v6.0 · EU AI Act Art. 12/14 · NIST AI RMF 2026 · FIPS-204 ML-DSA-87 · QL-2.0*
