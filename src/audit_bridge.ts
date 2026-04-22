import { exec } from 'child_process';

console.log("[AUDIT_BRIDGE]: Monitoring for Agentic Drift...");

// Every 10 seconds, simulate an event and pipe it to the dashboard logic
setInterval(() => {
  exec('npx ts-node --esm src/simulator.ts', (error, stdout) => {
    if (stdout) console.log(stdout.trim());
  });
}, 10000);
