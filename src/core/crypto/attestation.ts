// ML-DSA-87 Post-Quantum Signing Demo

import { createHash } from 'crypto';

export function hash_event(event: object): string {
  return createHash('sha256')
    .update(JSON.stringify(event))
    .digest('hex');
}

// MOCK: Replace with real PQ signature logic.
export function sign_event(event: object, privateKey: string = 'demo-key'): string {
  const hash = hash_event(event);
  // Demo: Concatenate for traceability (real: PQ signature with EQA key referencing)
  return `ML-DSA87:${hash}.${Buffer.from(privateKey).toString('base64')}`;
}