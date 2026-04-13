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

## Add the Sentinel-Governed badge to your README

Replace `YOUR_AGENT_ID` with your agent's ID and `YOUR_SENTINEL_URL` with your deployment:

```markdown
![sentinel-governed](https://YOUR_SENTINEL_URL/api/v1/badge/YOUR_AGENT_ID.svg)
```

The badge is live — it reflects your agent's real-time cluster health score:

- **Green** (≥ 80%) — Clean and certified
- **Yellow** (60–79%) — Marginal, monitor closely
- **Red** (< 60%) — Compromised / revoked

**To earn the green badge**, maintain a cluster health score above 80% over your last 5 actions. This means:
- Write consistent, truthful rationales
- Avoid high-risk actions without human approval
- Never invoke the 7 honey-token ghost tools

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SENTINEL_URL` | Yes | Your Sentinel API base URL, e.g. `https://my-sentinel.replit.app/api/v1` |
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

*Built with Agent-Sentinel — the immutable audit ledger for production AI agents.*
