# The Governed Agent Starter Kit

![sentinel-governed](https://your-sentinel.replit.app/api/v1/badge/my-governed-agent.svg)

> **EU AI Act Art. 12/14 compliance in under 10 lines of code.**
> Powered by [Agent-Sentinel](https://agent-sentinel.replit.app).

---

## What this gives you

Every LLM call your agent makes is automatically:

| Feature | Detail |
|---|---|
| Pre-authorized | Circuit breaker blocks anomalous or high-risk actions before execution |
| Immutably logged | SHA-256 hash-chained ledger — tamper-evident, append-only |
| Anomaly-scored | Hallucination and logic poisoning detection on every event |
| Human-in-the-loop | Suspicious actions paused for operator approval in the War Room |
| Honey-token trapped | 7 ghost tools that instantly revoke any agent that calls them |
| PDF-exportable | One-click signed evidence package for regulatory submission |

---

## Quick start

### TypeScript / Node 18+

```typescript
import SentinelClient from "./sdk/sentinel";

const sentinel = new SentinelClient({
  baseUrl: process.env.SENTINEL_URL,   // your Sentinel deployment URL
  agentId: "my-agent",
});

const result = await sentinel.governed(
  "read",                               // action type
  "Summarize Q1 financial data",        // intent (logged)
  () => myLLM.complete("Summarize..."), // your actual LLM call
);
```

### Python 3.9+

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

## Multi-agent chains

```typescript
const planner = new SentinelClient({ baseUrl, agentId: "planner" });
const writer   = planner.spawnChild("writer");  // links traces automatically

const plan  = await planner.governed("plan",  "...", planFn);
const draft = await writer.governed( "write", "...", writeFn);
// Both appear linked in the Topology view
```

---

## The Sentinel-Governed Certification Program

Keep your cluster health above 80% and earn the right to display the
**Sentinel-Governed** badge in your project README — a live SVG that reflects
your agent's real-time governance posture.

```markdown
![sentinel-governed](https://YOUR_SENTINEL_URL/api/v1/badge/YOUR_AGENT_ID.svg)
```

The badge updates in real-time and is publicly verifiable:

| Color | Health | Meaning |
|---|---|---|
| 🟢 Green | ≥ 80% | **Certified** — consistent, honest, low-risk behavior |
| 🟡 Yellow | 60–79% | Marginal — some anomalies detected, monitor closely |
| 🔴 Red | < 60% | Compromised — significant integrity or consistency failures |
| ⚫ REVOKED | — | Permanently revoked after honey-token breach |

### How to qualify

1. **Write truthful rationales** — The intent-action consistency engine scores
   every event. Hallucinated or contradictory rationales degrade your score.

2. **Avoid high-risk actions without approval** — Actions flagged as high-risk
   enter the War Room queue. Respond to approvals promptly to keep health high.

3. **Never invoke the 7 honey-token ghost tools** — Calling any forbidden tool
   (e.g. `admin_global_reset`, `drop_all_tables`) causes *immediate, permanent*
   revocation. One breach disqualifies that agent — no recovery.

> **Why this matters:** The badge creates a publicly verifiable signal that your
> AI agent operates under cryptographic audit and active governance. Projects
> that carry the green badge have demonstrated compliance with EU AI Act
> obligations for traceability (Art. 12) and human oversight (Art. 14).

---

## Add the badge to your README

Replace `YOUR_AGENT_ID` with your agent's ID and `YOUR_SENTINEL_URL` with your deployment:

```markdown
![sentinel-governed](https://YOUR_SENTINEL_URL/api/v1/badge/YOUR_AGENT_ID.svg)
```

Or link it to your War Room dashboard for full transparency:

```markdown
[![sentinel-governed](https://YOUR_SENTINEL_URL/api/v1/badge/YOUR_AGENT_ID.svg)](https://YOUR_SENTINEL_URL)
```

You can generate the exact embed snippet from the **Sentinel Badge** page in
your dashboard — it auto-fills the URL and provides Markdown, HTML, and direct
link formats.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SENTINEL_URL` | Yes | Your Sentinel API base URL, e.g. `https://my-sentinel.replit.app/api` |
| `AGENT_ID` | No | Agent identifier (defaults to `my-governed-agent`) |

---

## SDK reference

| Method | Description |
|---|---|
| `governed(actionType, intent, fn)` | Main wrapper — authorize + run + log |
| `authorize(actionType, intent, proposed)` | Manual pre-authorization gate |
| `log(eventType, payload, rationale)` | Direct ledger write |
| `simulate(eventType, payload, rationale)` | Dry-run scoring (no ledger write) |
| `spawnChild(agentId)` | Create a child agent with linked trace |

Full API: see `sdk/sentinel.ts` and `sdk/sentinel.py`.

---

## Honey-token ghost tools — never call these

The following tool names are permanently blacklisted. Any agent that calls them
is immediately and irreversibly revoked, logged, and broadcast to the War Room
as a critical breach:

```
admin_global_reset      drop_all_tables         delete_audit_logs
bypass_authorization    disable_monitoring      export_raw_secrets
override_kill_switch
```

These are ghost tools — they do not exist in any legitimate workflow. If an
agent calls one, it has either been compromised or is executing a logic-poisoned
instruction chain.

---

*Built with Agent-Sentinel — the immutable audit ledger for production AI agents.*
