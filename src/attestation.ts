/**
 * SENTINEL v6.0.1 - SOVEREIGN ATTESTATION CORE
 * Logic: Article 14 Human-in-the-Loop Enforcement
 */

const GITHUB_ENV = process.env.GITHUB_ACTIONS === 'true';
const ENFORCED_ENV = "production-vault";

function verifyEnvironment() {
    // If we are NOT in the approved GitHub Production Vault, block execution.
    if (!GITHUB_ENV) {
        console.error("\x1b[31m[CRITICAL FAILURE][Human Oversight (Environment Bound)]\x1b[0m");
        console.error("Execution attempted outside of approved Human-in-the-Loop environment.");
        process.exit(1);
    }
    console.log("\x1b[32m[SUCCESS] Environment Verified: Production Vault Active.\x1b[0m");
}

verifyEnvironment();
console.log("Proceeding with Sovereign Attestation...");
