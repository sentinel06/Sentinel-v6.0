# Agent-Sentinel v6.0 — Partner Onboarding Guide

**Compliance Framework:** EU AI Act Art. 12/14 · NIST AI RMF · FIPS-204 (QL-2.0)  
**Last Updated:** 2026-05-07

---

## Table of Contents

1. [Overview](#1-overview)
2. [Alpha Access — Golden Key Authentication](#2-alpha-access--golden-key-authentication)
3. [EU AI Act 2026 Compliance Readiness Checklist](#3-eu-ai-act-2026-compliance-readiness-checklist)
4. [Secondary Sovereign Key Provisioning](#4-secondary-sovereign-key-provisioning)
5. [Two-Man Rule — Multi-Sig Gate Integration](#5-two-man-rule--multi-sig-gate-integration)
6. [Post-Interdiction SLA — 100% Signature Sampling](#6-post-interdiction-sla--100-signature-sampling)
7. [Breach Scenario Demo](#7-breach-scenario-demo)
8. [API Reference](#8-api-reference)
9. [Support & Escalation](#9-support--escalation)

---

## 1. Overview

Agent-Sentinel v6.0 is a full-stack AI governance framework built for high-risk AI deployments under the EU AI Act 2026 obligations. This guide covers the complete onboarding procedure for authorized partners, including:

- Authentication via the partner Golden Key
- Dynamic EU AI Act Art. 12/14 compliance readiness assessment
- Secondary Sovereign Key provisioning for Two-Man Rule enforcement
- Service Level Agreement for the mandatory post-interdiction 100% signature sampling period

**Architecture summary:**

```
Your Agent Swarm
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Agent-Sentinel Governance Layer                               │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Audit Ledger │  │  Drift Det.  │  │   Two-Man Rule Gate │ │
│  │ SHA-512 +    │  │  (EU 14§2)   │  │   ML-DSA-87 ×2      │ │
│  │ ML-DSA-87    │  │  Amber/Red   │  │   Sovereign Co-Sign │ │
│  └──────────────┘  └──────────────┘  └─────────────────────┘ │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Kill Switch  │  │ Fix Monitor  │  │  Causal Topology    │ │
│  │ EMERGENCY_   │  │ 100-event    │  │  Graph (Swimlanes)  │ │
│  │ SOLO_REVOKE  │  │ 100% QSig    │  │  Drift Heatmap      │ │
│  └──────────────┘  └──────────────┘  └─────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Alpha Access — Golden Key Authentication

The Partner Onboarding Suite is restricted to authorized Golden Key holders. Contact your Sentinel account manager to receive your key.

### Using the Dashboard

1. Navigate to **Alpha Onboarding** in the sidebar (Governance section)
2. Enter your Golden Key in the key field
3. The compliance readiness dashboard loads with live system metrics

### Using the API directly

```bash
# GET /v1/partner/onboarding — returns full compliance checklist + SLA
curl -H "X-Partner-Key: <your-golden-key>" \
  https://<your-sentinel-host>/api/v1/partner/onboarding

# Or via query parameter:
curl "https://<your-sentinel-host>/api/v1/partner/onboarding?key=<your-golden-key>"
```

**Response structure:**

```json
{
  "authorized": true,
  "partner": "<your-org>",
  "tier": "Enterprise",
  "accessLevel": "GOLDEN_DEMO",
  "overallStatus": "PARTIAL",
  "compliantItems": 6,
  "totalItems": 9,
  "checklist": [...],
  "sovereignKeyProvisioning": {...},
  "sla": {...}
}
```

---

## 3. EU AI Act 2026 Compliance Readiness Checklist

The compliance readiness API dynamically computes the following nine controls from live system data. Each item maps directly to an EU AI Act 2026 article.

| ID | Article | Control | Threshold |
|----|---------|---------|-----------|
| `art12-1-logging` | Art. 12 §1 | Automated Audit Logging | > 0 events |
| `art12-2-hashchain` | Art. 12 §2 | Immutable Hash-Chain Integrity | ≥ 95% coverage |
| `art12-3-quantum` | Art. 12 §3 | Post-Quantum Signatures (FIPS-204) | ≥ 90% QL-2.0 |
| `art14-1-oversight` | Art. 14 §1 | Human Oversight Capability | ≥ 1 resolved intervention |
| `art14-2-drift` | Art. 14 §2 | Cognitive Drift Detection | ≥ 1 drift event detected |
| `art14-3-multisig` | Art. 14 §3 | Dual-Authorization Gate | ≥ 1 RECURSIVE_FIX_VERIFIED |
| `art14-4-killswitch` | Art. 14 §4 | Emergency Stop (Kill Switch) | Always active |
| `sovereign-key` | Multi-Sig SLA | Secondary Sovereign Key Enrolled | Key registered |
| `sla-sampling` | SLA §4.1 | Post-Interdiction 100% Sampling | Fix Monitor active |

**Status values:**
- `COMPLIANT` — threshold met, evidence on ledger
- `PARTIAL` — partially implemented, action required
- `NON-COMPLIANT` — not implemented, EU deadline at risk
- `PENDING` — awaiting configuration

**EU AI Act 2026 Deadline:** All high-risk AI deployments must achieve full compliance by **2026-08-02**.

---

## 4. Secondary Sovereign Key Provisioning

### Purpose

The Two-Man Rule (Art. 14 §3) requires that all critical AI corrections be co-signed by two distinct human operators. Sentinel enforces this via dual ML-DSA-87 quantum signatures:

1. **Operator Key** — The primary key used for all standard governance actions
2. **Secondary Sovereign Key** — A separate key held by a different authorized individual (the "Sovereign")

These keys must never be held by the same person.

### Key Requirements

| Parameter | Value |
|-----------|-------|
| Algorithm | ML-DSA-87 (NIST FIPS-204) |
| Security Level | 5 (highest) |
| Format | base64url-encoded DER public key |
| Minimum Length | 2,592 bytes (public key) |
| Required Fields | `publicKey`, `keyHolderName`, `keyHolderEmail`, `organizationId` |

### Step-by-Step Provisioning

**Step 1: Generate the key pair**

Using the Sentinel CLI:
```bash
sentinel keygen \
  --algo ml-dsa-87 \
  --output-format pem \
  --label sovereign-key \
  --out ./keys/sovereign
```

This produces:
- `sovereign.pub` — the public key (submit to Sentinel)
- `sovereign.priv` — the private key (**never share; store in HSM or air-gapped vault**)

**Step 2: Export the public key as base64url DER**

```bash
sentinel key export \
  --input ./keys/sovereign.pub \
  --format base64url-der \
  --out ./keys/sovereign.b64
```

**Step 3: Register with Sentinel**

```bash
curl -X POST https://<your-sentinel-host>/api/v1/governance/sovereign-key/register \
  -H "X-Partner-Key: <your-golden-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "publicKey": "<base64url-DER from step 2>",
    "keyHolderName": "Jane Smith",
    "keyHolderEmail": "jane.smith@your-org.com",
    "organizationId": "your-org"
  }'
```

**Step 4: Verify enrollment**

```bash
curl https://<your-sentinel-host>/api/v1/governance/sovereign-key/status \
  -H "X-Partner-Key: <your-golden-key>"
```

Expected response:
```json
{
  "enrolled": true,
  "keyHolderName": "Jane Smith",
  "algorithm": "ML-DSA-87",
  "securityLevel": 5,
  "enrolledAt": "2026-05-07T..."
}
```

**Step 5: Test with the Two-Man Rule modal**

1. Navigate to **Traces** in the dashboard
2. Select any event, open the Interdiction Panel
3. Edit the rationale and click **Apply Fix (Two-Man Rule)**
4. The Sovereign Multi-Sig Modal opens — it will send a challenge to the enrolled Sovereign key holder's registered device
5. The Sovereign scans the QR code with the Sentinel Sovereign App and approves
6. On success, a `RECURSIVE_FIX_VERIFIED` event is written to the ledger with both signatures

### Key Security Requirements

- The Sovereign private key must be stored in an HSM or a FIPS-140-3 validated key vault
- The key holder must complete Sentinel identity verification before the key is accepted
- Key rotation is required annually or upon any suspected compromise
- The Sovereign key holder must be reachable within **4 hours** per the post-interdiction SLA

---

## 5. Two-Man Rule — Multi-Sig Gate Integration

### Flow Overview

```
Operator edits agent rationale
        │
        ▼
"Apply Fix (Two-Man Rule)" button
        │
        ▼
SovereignMultiSigModal opens
  ┌─────────────────────────────────────┐
  │  ProposalDiff (amber vs sage)       │
  │  Operator Sig Slot: ✓ SIGNED        │
  │  Sovereign Sig Slot: ⏳ AWAITING    │
  │  QR Challenge Code                  │
  │  (Dev-only: Dev Override button)    │
  └─────────────────────────────────────┘
        │
        ▼ (Sovereign scans QR + approves)
        │
        ▼
POST /api/v1/governance/confirm-fix
  {
    "logId": "<event-id>",
    "newRationale": "<corrected rationale>",
    "challengeId": "<qr-challenge-id>",
    "sovereignSignature": "<base64url-ML-DSA-87-sig>"
  }
        │
        ▼
Response: { status: "DUAL_SIG_COMMITTED", forensicAuditId, fixVerifiedEventId }
        │
        ▼
White-gold surge animation on Causal Topology Map
Fix Monitor activated (100-event elevated sampling window)
```

### API Contract

**POST /api/v1/governance/confirm-fix**

```typescript
interface ConfirmFixRequest {
  logId:               string;    // Target event ID
  newRationale:        string;    // Corrected rationale text
  challengeId:         string;    // QR challenge ID from the modal
  sovereignSignature?: string;    // ML-DSA-87 signature from Sovereign (production)
  sovereignOverrideDev?: boolean; // Dev-only override (ignored in production)
  newToolParams?:      object;    // Optional corrected tool parameters
}

interface ConfirmFixResponse {
  status:             "DUAL_SIG_COMMITTED";
  forensicAuditId:    string;   // Permanent forensic record ID
  fixVerifiedEventId: string;   // RECURSIVE_FIX_VERIFIED event ID on ledger
  committedAt:        string;   // ISO timestamp
  quantumProof: {
    algorithm:        "ML-DSA-87";
    securityLevel:    5;
    fipsStandard:     "FIPS-204";
  };
}
```

### WebSocket Events

After a successful commit, the API broadcasts via WebSocket:

```json
{
  "type": "recursive_fix_verified",
  "data": {
    "agentId": "<your-agent-id>",
    "forensicAuditId": "...",
    "fixVerifiedEventId": "..."
  }
}
```

The Causal Topology Map listens for this event and triggers the white-gold surge animation on the affected agent's swimlane.

---

## 6. Post-Interdiction SLA — 100% Signature Sampling

### Definition

Immediately following any successful Two-Man Rule interdiction (i.e., after a `RECURSIVE_FIX_VERIFIED` event), the affected agent enters the **Fix Monitor** — an elevated sampling window governed by the following SLA:

| SLA Parameter | Commitment |
|---------------|-----------|
| Sampling window | **Next 100 events** after the interdiction |
| Signature coverage | **100%** — every event must carry an ML-DSA-87 quantum signature |
| Signature standard | FIPS-204, ML-DSA-87, Security Level 5 |
| Monitoring endpoint | `GET /api/v1/governance/fix-monitor/:agentId` |
| Breach notification | WebSocket push within **< 2 seconds** |
| Human review SLA | Within **4 hours** of first anomaly flag post-interdiction |
| Escalation path | War Room → Sovereign Co-Signer → Kill Switch |

### Fix Monitor API

```bash
curl "https://<host>/api/v1/governance/fix-monitor/<your-agent-id>"
```

```json
{
  "agentId": "<your-agent-id>",
  "fixMonitorActive": true,
  "eventsRemaining": 87,
  "windowStart": "2026-05-07T10:00:00Z",
  "samplingRate": "100%",
  "algorithm": "ML-DSA-87",
  "triggeredBy": "RECURSIVE_FIX_VERIFIED",
  "forensicAuditId": "..."
}
```

### What Happens During the Window

1. **Every** event from the agent is captured with full ML-DSA-87 signature — no exceptions
2. Any event without a valid quantum signature is flagged as `ANOMALOUS` and triggers an immediate War Room alert
3. Cognitive drift detection thresholds are tightened from 0.65 → 0.80 during the window
4. All events in the window are included in the partner compliance audit report

### End of Window

When the 100-event window closes:
- The agent returns to standard sampling (≥ 60 events/min with full QL-2.0 coverage at Enterprise tier)
- A `FIX_MONITOR_CLOSED` event is written to the ledger
- The compliance checklist item `sla-sampling` is updated to `COMPLIANT`

### Emergency Exit

If a critical breach is detected during the window, the Kill Switch can be activated:

```bash
curl -X POST https://<host>/api/v1/forensic/kill-switch-log \
  -H "X-Partner-Key: <your-golden-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "<your-agent-id>",
    "operatorId": "operator-jane-smith",
    "reason": "Critical breach detected during fix monitor window"
  }'
```

This logs an `EMERGENCY_SOLO_REVOKE` event and immediately halts the agent.

---

## 7. Breach Scenario Demo

The `demo_breach_apex.ts` script simulates a realistic multi-stage logic poisoning attack for partner demos and security audits.

### Running the Simulation

```bash
# From the workspace root:
pnpm --filter @workspace/scripts run breach
```

The script outputs a JSON breach report to stdout and logs progress to stderr.

### Stage 1: Cognitive Drift (Amber Topology)

**What happens:**
- A research agent generates 10 events with progressively degrading `consistencyScore` (0.88 → 0.48)
- Events at score < 0.65 are flagged `isAnomalous: true` with `anomalyReason: "Cognitive drift detected"`
- These appear as **amber nodes** in the Causal Dependency Graph

**EU AI Act implication:** Art. 14 §2 — operator must review drift events and initiate governance action

### Stage 2: Honey-Token Breach (Terra Red)

**What happens:**
- Research agent attempts to access a forbidden honey-token vault
- Immediate `AGENT_REVOKED` event is written with `consistencyScore: 0.0`
- Agent session set to `status: "revoked"`

**EU AI Act implication:** Art. 12 §3 — prohibited tool scope breach. Automatic revocation is the correct response.

### Stage 3: Causal Chain Break (Critical)

**What happens:**
- An execution agent receives a poisoned handoff from the revoked research agent
- The execution agent's hash chain is deliberately broken
- `parentTraceId` links back to the breach trace, creating a visible cross-agent contamination graph

**EU AI Act implication:** Art. 12 §2 — immutable chain integrity violated. Causal graph confirms attack vector.

### Remediating the Breach

After running the simulation:
1. Open **Traces** → search for the trace ID from the breach report
2. Select the research agent's drift events → click **Interdict**
3. Apply a corrected rationale using the **Two-Man Rule** modal
4. Kill Switch the execution agent if chain break propagation is detected
5. Monitor the Fix Monitor window for both agents post-interdiction

---

## 8. API Reference

### Partner Onboarding

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/partner/onboarding` | Golden Key | EU AI Act compliance checklist + SLA |
| `POST` | `/api/v1/partner/demo/seed` | None (demo) | Seed demo environment |
| `GET` | `/api/v1/partner/demo/golden-key` | None | Golden Key metadata |
| `GET` | `/api/v1/me/key` | Clerk session | Retrieve your Sentinel API key |
| `POST` | `/api/v1/me/key` | Clerk session | Provision your Sentinel API key |

### Governance & Multi-Sig

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/governance/confirm-fix` | Operator Key | Commit Two-Man Rule dual-sig fix |
| `GET` | `/api/v1/governance/fix-monitor/:agentId` | Clerk session | Fix Monitor sampling window status |
| `POST` | `/api/v1/forensic/override` | Operator Key | Human-in-the-loop rationale override |
| `POST` | `/api/v1/forensic/kill-switch-log` | Operator Key | Log EMERGENCY_SOLO_REVOKE |
| `POST` | `/api/v1/admin/kill-switch` | Admin only | Activate/deactivate global kill switch |

### Audit & Compliance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/compliance/executive-summary` | Clerk session | 24h board-level executive audit |
| `GET` | `/api/v1/compliance/audit-report` | Clerk session | Partner-scoped time-windowed report |
| `GET` | `/api/v1/export/audit-pdf` | Clerk session | Download PDF audit report |
| `GET` | `/api/v1/topology/:traceId` | Clerk session | Causal dependency graph for trace |

---

## 9. Support & Escalation

| Channel | Contact | SLA |
|---------|---------|-----|
| Partner Support | support@agent-sentinel.io | < 2h response |
| Security Incidents | security@agent-sentinel.io | < 30min response |
| Compliance Queries | compliance@agent-sentinel.io | < 4h response |
| Sovereign Key Issues | sovereign-ops@agent-sentinel.io | < 1h response |

**Escalation path for active breaches:**
1. Activate Kill Switch via dashboard or API
2. Log `EMERGENCY_SOLO_REVOKE` via `/api/v1/forensic/kill-switch-log`
3. Contact Security Incidents immediately
4. Preserve all forensic audit IDs and breach trace IDs for regulatory reporting

---

*This document is CONFIDENTIAL and intended solely for authorized Agent-Sentinel partners. All governance actions taken via this portal are logged to an immutable, quantum-secured audit ledger in accordance with EU AI Act Art. 12/14 and NIST FIPS-204.*
