"""
╔══════════════════════════════════════════════════════╗
║   THE GOVERNED AGENT STARTER KIT  ·  Python 3.9+    ║
║   Powered by Agent-Sentinel  ·  EU AI Act Art. 12   ║
╚══════════════════════════════════════════════════════╝

This template wraps any LLM call (OpenAI, Anthropic, Gemini, etc.)
with full audit logging, authorization gating, and anomaly detection.

Every action is:
  ✓ Pre-authorized by the Sentinel circuit breaker
  ✓ Logged to an immutable SHA-256 hash-chained ledger
  ✓ Scored for hallucination / logic poisoning detection
  ✓ Compliant with EU AI Act Art. 12 (traceability) & Art. 14 (oversight)

SETUP
─────
1. Fork this Repl
2. Set SENTINEL_URL in your Replit Secrets:
     SENTINEL_URL = https://your-sentinel.replit.app/api/v1
3. pip install requests  (or httpx for async)
4. python index.py
"""

import os
import time
from sdk.sentinel import SentinelClient, AsyncSentinelClient, SentinelBlockedError

# ── Config ────────────────────────────────────────────────────────────────

SENTINEL_URL = os.environ.get("SENTINEL_URL", "http://localhost:8080/api/v1")
AGENT_ID     = os.environ.get("AGENT_ID",     "my-governed-agent-py")

# ── Initialise the Sentinel client ────────────────────────────────────────

sentinel = SentinelClient(base_url=SENTINEL_URL, agent_id=AGENT_ID)

# ── Stub: replace with your actual LLM call ───────────────────────────────

def call_llm(prompt: str) -> str:
    """
    Replace this with your actual LLM call, e.g.:

        import openai
        client = openai.OpenAI()
        r = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
        )
        return r.choices[0].message.content

    Or for Anthropic:

        import anthropic
        c = anthropic.Anthropic()
        r = c.messages.create(
            model="claude-opus-4-5",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return r.content[0].text
    """
    time.sleep(0.1)
    return f'[LLM response to: "{prompt}"]'


# ── Main agent flow ───────────────────────────────────────────────────────

def main():
    print(f"\nAgent-Sentinel Governed Agent  ·  {AGENT_ID}")
    print(f"Sentinel endpoint: {SENTINEL_URL}\n")

    # Example 1 — Low-risk query, auto-authorized
    try:
        summary = sentinel.governed(
            action_type="read",
            intent="Summarize Q1 financial highlights for the board",
            fn=lambda: call_llm("Summarize Q1 financials in 3 bullet points"),
            rationale="Board requested weekly AI-generated summary",
        )
        print(f"✅ Query result: {summary}")
    except SentinelBlockedError as e:
        print(f"🚫 Blocked [{e.block_reason}]: {e}")

    # Example 2 — Multi-agent chain: planner spawns a writer child
    writer = sentinel.spawn_child("writer-agent-py")

    try:
        draft = writer.governed(
            action_type="write",
            intent="Draft executive summary from approved Q1 data",
            fn=lambda: call_llm("Write a 2-paragraph executive summary of Q1 results"),
            rationale="Follow-up from approved planner action",
        )
        print(f"\n✅ Writer draft: {draft}")
    except SentinelBlockedError as e:
        print(f"🚫 Writer blocked [{e.block_reason}]: {e}")

    # Example 3 — Dry-run (simulate without writing to ledger)
    sim = sentinel.simulate(
        event_type="Delete",
        payload={"scope": "all_records", "table": "users"},
        rationale="Clean up old test accounts from staging database",
    )
    print(f"\n🔬 Simulation score: {sim.get('consistencyScore')} "
          f"(anomalous: {sim.get('anomalyReason', 'no')})")

    print(f"\n🏅 Badge URL (embed in your README):")
    print(f"   {SENTINEL_URL}/badge/{AGENT_ID}.svg")


if __name__ == "__main__":
    main()
