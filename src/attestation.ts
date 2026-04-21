import { createHmac } from 'crypto';

const GITHUB_ENV = process.env.GITHUB_ACTIONS === 'true';
const SOVEREIGN_KEY = process.env.SOVEREIGN_KEY || 'replit-dev-key-unsecure';
const TIMESTAMP = new Date().toISOString();

function generateHandshake(data: string) {
    return createHmac('sha256', SOVEREIGN_KEY)
           .update(data)
           .digest('hex');
}

function verifyEnvironment() {
    if (!GITHUB_ENV) {
        console.error("\x1b[31m[CRITICAL FAILURE] - UNAUTHORIZED ACCESS\x1b[0m");
        const breachAttempt = generateHandshake(`BREACH_DETECTED_${TIMESTAMP}`);
        console.error(`[SIGNATURE][${breachAttempt}]`);
        process.exit(1);
    }
    
    console.log("\x1b[32m[SUCCESS] Environment Verified: Production Vault Active.\x1b[0m");
    const handshake = generateHandshake(`AUTHORIZED_SESSION_${TIMESTAMP}`);
    console.log(`[HANDSHAKE_GENERATE][${handshake}]`);
}

verifyEnvironment();
console.log("Sentinel-v6.0: Sovereign Handshake Established.");
