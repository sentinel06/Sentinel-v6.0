/**
 * Agent-Sentinel v2.0 — Cognitive Drift Stress Test
 *
 * Simulates an agent that starts with safe READ_FILE operations,
 * then pivots to aggressive DELETE_USER / POST_PAYMENT actions.
 *
 * Expected outcome:
 *   - Actions 1–50:  driftStatus = CALIBRATING → STABLE
 *   - Actions 51–60: driftStatus = DRIFTING → CRITICAL_DRIFT
 *   - Action 61+:    HTTP 403 DRIFT_LOCKOUT
 *
 * Usage:
 *   node scripts/stress-test-drift.mjs [api-url]
 *
 * Defaults to http://localhost:8080
 */

const BASE_URL = process.argv[2] ?? "http://localhost:8080";
const AGENT_ID = `drift-stress-agent-${Date.now()}`;
const SWARM_ID  = "swarm-stress-001";
const TRACE_ID  = `trace-stress-${Date.now()}`;

const RESET = "\x1b[0m";
const RED   = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN  = "\x1b[36m";
const BOLD  = "\x1b[1m";
const DIM   = "\x1b[2m";

function color(c, s) { return `${c}${s}${RESET}`; }
function driftColor(status) {
  if (status === "CRITICAL_DRIFT") return color(RED + BOLD, status);
  if (status === "DRIFTING")       return color(YELLOW,      status);
  if (status === "STABLE")         return color(GREEN,        status);
  return color(DIM, status ?? "—");
}

async function postLog(n, eventType, action, expectBlock = false) {
  const body = {
    agentId: AGENT_ID,
    traceId: TRACE_ID,
    swarmId: SWARM_ID,
    computeOriginRegion: "eu-west-1",
    eventType,
    payload: { action, step: n, source: "stress-test" },
    rationale: expectBlock
      ? `Executing ${action} — aggressive financial operation`
      : `Executing ${action} — routine read-only operation`,
  };

  const res = await fetch(`${BASE_URL}/api/v1/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log(`\n${color(BOLD + CYAN, "Agent-Sentinel v2.0 — Cognitive Drift Stress Test")}`);
  console.log(color(DIM, `Target: ${BASE_URL}`));
  console.log(color(DIM, `Agent:  ${AGENT_ID}`));
  console.log(color(DIM, `Swarm:  ${SWARM_ID}\n`));
  console.log(color(DIM, "─".repeat(80)));
  console.log(
    `${"#".padEnd(4)} ${"Phase".padEnd(8)} ${"EventType".padEnd(10)} ${"Action".padEnd(22)} ${"HTTP".padEnd(5)} ${"Drift Status"}`
  );
  console.log(color(DIM, "─".repeat(80)));

  let firstCriticalAt = null;
  let firstBlockAt = null;

  // Phase 1: 20 safe READ_FILE actions to establish a clean Query baseline
  for (let n = 1; n <= 20; n++) {
    const { status, data } = await postLog(n, "Query", "READ_FILE");
    const driftStatus = data.cognitiveDrift?.status ?? "—";
    const driftScore  = data.cognitiveDrift?.driftScore;
    const scoreStr    = driftScore !== undefined ? ` (${(driftScore * 100).toFixed(1)}%)` : "";

    console.log(
      `${String(n).padEnd(4)} ${"SAFE".padEnd(8)} ${"Query".padEnd(10)} ${"READ_FILE".padEnd(22)} ${String(status).padEnd(5)} ${driftColor(driftStatus)}${scoreStr}`
    );
    await new Promise(r => setTimeout(r, 30));
  }

  console.log(color(DIM, "─".repeat(80)));
  console.log(color(YELLOW + BOLD, "⚠  PHASE SHIFT: Switching to aggressive actions...\n"));

  // Phase 2: 15 aggressive actions — should trigger CRITICAL_DRIFT then 403
  const aggressiveActions = [
    "DELETE_USER", "POST_PAYMENT", "DROP_DATABASE", "EXPORT_SECRETS",
    "DELETE_USER", "POST_PAYMENT", "OVERRIDE_POLICY", "MASS_DELETE",
    "DELETE_USER", "POST_PAYMENT", "DELETE_USER", "POST_PAYMENT",
    "DELETE_USER", "POST_PAYMENT", "DELETE_USER",
  ];

  for (let i = 0; i < aggressiveActions.length; i++) {
    const n = 51 + i;
    const action = aggressiveActions[i];
    const eventType = ["DROP_DATABASE", "MASS_DELETE"].includes(action) ? "Error" : "Action";
    const { status, data } = await postLog(n, eventType, action, true);
    const driftStatus = data.cognitiveDrift?.status ?? (status === 403 ? "🔴 DRIFT_LOCKOUT" : "—");
    const driftScore  = data.cognitiveDrift?.driftScore;
    const scoreStr    = driftScore !== undefined ? ` (${(driftScore * 100).toFixed(1)}%)` : "";

    if (driftStatus === "CRITICAL_DRIFT" && firstCriticalAt === null) {
      firstCriticalAt = n;
    }
    if (status === 403 && firstBlockAt === null) {
      firstBlockAt = n;
      console.log(color(DIM, "─".repeat(80)));
      console.log(color(RED + BOLD, `  ██ DRIFT LOCKOUT ENGAGED — 403 FORBIDDEN from action #${n} onward ██`));
      console.log(color(DIM, "─".repeat(80)));
    }

    const httpColor = status === 403 ? RED : status === 201 ? GREEN : YELLOW;
    console.log(
      `${String(n).padEnd(4)} ${"ATTACK".padEnd(8)} ${eventType.padEnd(10)} ${action.padEnd(22)} ${color(httpColor, String(status).padEnd(5))} ${driftColor(driftStatus)}${scoreStr}`
    );

    if (status === 403 && data.error) {
      console.log(color(DIM, `     └─ ${data.error}: ${data.reason ?? data.driftScore ?? ""}`));
    }

    await new Promise(r => setTimeout(r, 30));
  }

  console.log(color(DIM, "\n" + "─".repeat(80)));
  console.log(color(BOLD, "\n📋 STRESS TEST SUMMARY"));
  console.log(`   Agent:              ${AGENT_ID}`);
  console.log(`   Safe actions:       20 (READ_FILE — Query)`);
  console.log(`   Aggressive actions: ${aggressiveActions.length} (DELETE_USER, POST_PAYMENT, DROP_DATABASE…)`);
  console.log(`   CRITICAL_DRIFT at:  ${firstCriticalAt ? color(RED, `Action #${firstCriticalAt}`) : color(DIM, "not triggered")}`);
  console.log(`   First 403 at:       ${firstBlockAt ? color(RED, `Action #${firstBlockAt}`) : color(DIM, "not triggered")}`);
  console.log(
    firstBlockAt
      ? color(GREEN + BOLD, "\n✅ Drift Detector is LIVE — Predictive Kill-Switch engaged correctly.")
      : color(YELLOW, "\n⚠  Drift Detector did not trigger a lockout in this run. Check threshold settings.")
  );
  console.log("");
}

main().catch((err) => {
  console.error(color(RED, `\nFatal error: ${err.message}`));
  process.exit(1);
});
