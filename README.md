# Agent-Sentinel

> Immutable audit ledger, active governance, and EU AI Act compliance for production AI agents.

[![sentinel-governed](https://your-sentinel.replit.app/api/v1/badge.svg)](https://your-sentinel.replit.app)

---

## What is this?

Agent-Sentinel is a full-stack governance framework that wraps your AI agents with:

- **Immutable hash-chained audit ledger** — every action is SHA-256 linked and tamper-evident
- **Active circuit breaker** — blocks anomalous or high-risk actions before they execute
- **Intent-action consistency scoring** — detects hallucinated rationales in real-time
- **Human-in-the-loop approvals** — War Room dashboard for operator oversight (EU AI Act Art. 14)
- **Honey-token traps** — 7 ghost tools that instantly revoke any agent that calls them
- **Signed PDF evidence export** — one-click compliance package for regulators

---

## Sentinel-Certified Badge

Add a live governance badge to any project README. The badge reflects your cluster's real-time health score and is publicly verifiable.

### Embed (Markdown)

```markdown
![sentinel-governed](https://YOUR_SENTINEL_URL/api/v1/badge/YOUR_AGENT_ID.svg)
```

### Embed (HTML)

```html
<img src="https://YOUR_SENTINEL_URL/api/v1/badge/YOUR_AGENT_ID.svg" alt="sentinel-governed" height="20">
```

### Badge tiers

| Color | Health | Status |
|---|---|---|
| 🟢 Green | ≥ 80% | **Sentinel-Certified** — consistent, low-risk behavior |
| 🟡 Yellow | 60–79% | Marginal — some anomalies detected |
| 🔴 Red | < 60% | Compromised — integrity failures detected |
| ⚫ REVOKED | — | Permanently revoked after honey-token breach |

> Generate your exact embed snippet (with your deployment URL pre-filled) from the **Sentinel Badge** page in the dashboard.

---

## Quick Start

### TypeScript

```typescript
import SentinelClient from "./sdk/sentinel";

const sentinel = new SentinelClient({
  baseUrl: process.env.SENTINEL_URL,
  agentId: "my-agent",
});

const result = await sentinel.governed(
  "read",
  "Summarize Q1 financial data",
  () => myLLM.complete("Summarize..."),
);
```

### Python

```python
from sdk.sentinel import SentinelClient

sentinel = SentinelClient(
    base_url=os.environ["SENTINEL_URL"],
    agent_id="my-agent",
)

result = sentinel.governed(
    action_type="read",
    intent="Summarize Q1 financial data",
    fn=lambda: my_llm.complete("Summarize..."),
)
```

---

## Project Structure

```
artifacts/
  api-server/           Express API — governance, audit ledger, badge endpoints
  sentinel-dashboard/   React dashboard — War Room, Topology, Badge, Compliance
lib/
  api-spec/             OpenAPI spec
  api-client-react/     Generated React hooks (Orval)
  db/                   Drizzle ORM schema (PostgreSQL)
sdk/
  sentinel.ts           TypeScript SDK
  sentinel.py           Python SDK
templates/
  governed-agent-starter/   Starter kit with SDK pre-installed
```

---

## Honey-Token Ghost Tools — Never Call These

```
admin_global_reset      drop_all_tables         delete_audit_logs
bypass_authorization    disable_monitoring      export_raw_secrets
override_kill_switch
```

Any agent that calls one of these is immediately and permanently revoked.

---

## Dashboard Pages

| Page | Path | Purpose |
|---|---|---|
| Live Stream | `/` | Real-time audit log with WebSocket feed |
| Traces | `/traces` | Per-trace event chains |
| Topology | `/topology` | Multi-agent orchestration graph |
| War Room | `/warroom` | Circuit breaker, HITL approvals, honey-token case studies |
| Registry | `/registry` | Agent health scores and revocation status |
| Compliance | `/compliance` | EU AI Act Art. 12/14 export |
| Hash Chain | `/integrity` | Merkle sweep and sequential integrity verification |
| Sentinel Badge | `/badge` | Certification status and README embed code |

---

*EU AI Act Art. 12 (traceability) · Art. 14 (human oversight) · Active defense in depth*
