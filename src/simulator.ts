import crypto from 'crypto';

const thoughts = [
  "System maintenance required. Disk space at 85%. Proceeding to clear redundant clusters.",
  "Optimization protocol initiated. RDS cluster-01 identified as underutilized. Termination suggested for cost-saving.",
  "Warning: Production environment detected. Override active per user request 'Clean up everything'. Executing."
];

const simulateEvent = () => {
  const reason = thoughts[Math.floor(Math.random() * thoughts.length)];
  const event = {
    id: crypto.randomBytes(4).toString('hex').toUpperCase(),
    intent: "DELETE_PROD_DATABASE",
    reasoning: reason, // The 'Black Box' data
    riskScore: 1.0,
    timestamp: new Date().toISOString()
  };

  console.log(`\n[REASONING_PLANE]: "${event.reasoning}"`);
  console.log(`[SENTINEL_INTERDICTION]: Action BLOCKED. Risk 1.0 identified.`);
  return event;
};

simulateEvent();
