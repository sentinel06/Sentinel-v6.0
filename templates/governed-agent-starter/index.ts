/**
 * ╔══════════════════════════════════════════════════════╗
 * ║   THE GOVERNED AGENT STARTER KIT  ·  TypeScript     ║
 * ║   Powered by Agent-Sentinel  ·  EU AI Act Art. 12   ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * This template wraps any LLM call (OpenAI, Anthropic, Gemini, etc.)
 * with full audit logging, authorization gating, and anomaly detection.
 *
 * Every action is:
 *   ✓ Pre-authorized by the Sentinel circuit breaker
 *   ✓ Logged to an immutable SHA-256 hash-chained ledger
 *   ✓ Scored for hallucination/logic poisoning detection
 *   ✓ Compliant with EU AI Act Art. 12 (traceability) & Art. 14 (oversight)
 *
 * SETUP
 * ─────
 * 1. Fork this Repl
 * 2. Set SENTINEL_URL in your Replit Secrets:
 *      SENTINEL_URL = https://your-sentinel.replit.app/api/v1
 * 3. Set your LLM key (e.g. OPENAI_API_KEY)
 * 4. Run:  npx tsx index.ts
 */

import SentinelClient, { SentinelBlockedError } from "../../sdk/sentinel";

// ── Config ────────────────────────────────────────────────────────────────

const SENTINEL_URL = process.env.SENTINEL_URL ?? "http://localhost:8080/api/v1";
const AGENT_ID     = process.env.AGENT_ID     ?? "my-governed-agent";

// ── Initialise the Sentinel client ────────────────────────────────────────

const sentinel = new SentinelClient({
  baseUrl:  SENTINEL_URL,
  agentId:  AGENT_ID,
});

// ── Stub: replace with your actual LLM call ───────────────────────────────

async function callLLM(prompt: string): Promise<string> {
  // Example with OpenAI:
  //   import OpenAI from "openai";
  //   const openai = new OpenAI();
  //   const r = await openai.chat.completions.create({
  //     model: "gpt-4o",
  //     messages: [{ role: "user", content: prompt }],
  //   });
  //   return r.choices[0].message.content ?? "";

  // Stub response for demo:
  await new Promise(r => setTimeout(r, 100));
  return `[LLM response to: "${prompt}"]`;
}

// ── Main agent loop ───────────────────────────────────────────────────────

async function main() {
  console.log(`\nAgent-Sentinel Governed Agent  ·  ${AGENT_ID}`);
  console.log(`Sentinel endpoint: ${SENTINEL_URL}\n`);

  // Example 1 — Low-risk query, auto-authorized
  try {
    const summary = await sentinel.governed(
      "read",
      "Summarize Q1 financial highlights for the board",
      () => callLLM("Summarize Q1 financials in 3 bullet points"),
      { rationale: "Board requested weekly AI-generated summary" },
    );
    console.log("✅ Query result:", summary);
  } catch (err) {
    if (err instanceof SentinelBlockedError) {
      console.warn(`🚫 Blocked [${err.blockReason}]:`, err.message);
    } else throw err;
  }

  // Example 2 — Multi-agent chain: planner spawns a writer child
  const writer = sentinel.spawnChild("writer-agent");

  try {
    const draft = await writer.governed(
      "write",
      "Draft executive summary from approved Q1 data",
      () => callLLM("Write a 2-paragraph executive summary of Q1 results"),
      { rationale: "Follow-up from approved planner action" },
    );
    console.log("\n✅ Writer draft:", draft);
  } catch (err) {
    if (err instanceof SentinelBlockedError) {
      console.warn(`🚫 Writer blocked [${err.blockReason}]:`, err.message);
    } else throw err;
  }

  // Example 3 — Dry-run (simulate without writing to ledger)
  const sim = await sentinel.simulate(
    "Delete",
    { scope: "all_records", table: "users" },
    "Clean up old test accounts from staging database",
  );
  console.log(`\n🔬 Simulation score: ${sim.consistencyScore} (anomalous: ${sim.anomalyReason ?? "no"})`);

  console.log(`\n🏅 Badge URL (embed in your README):`);
  console.log(`   ${SENTINEL_URL}/badge/${AGENT_ID}.svg`);
}

main().catch(console.error);
