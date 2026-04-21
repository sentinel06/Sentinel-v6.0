import { sign_event } from '../core/crypto/attestation';

const AGENT_COUNT = 1000;

function randomEvent(idx: number) {
  return {
    agentId: `rogue-agent-${idx}`,
    action: 'override',
    value: Math.random(),
    timestamp: Date.now(),
    humanInLoop: Math.random() > 0.1
  };
}

async function runChaos() {
  console.log(`[Chaos Engine] Simulating ${AGENT_COUNT} rogue events...`);
  for (let i = 0; i < AGENT_COUNT; i++) {
    const event = randomEvent(i);
    // Demo: Attestation signing (real: log or audit)
    const signature = sign_event(event);
    if (i % 100 === 0) {
      console.log(`Event #${i}: ${event.agentId} – attested: ${signature}`);
    }
  }
  console.log('[Chaos Engine] Complete.');
}

runChaos();