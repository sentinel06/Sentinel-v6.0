/**
 * Sentinel ML-DSA-87 signing worker.
 *
 * Spawned by lib/crypto.ts as part of a 4-worker pool. Each worker holds
 * its own copy of the secret key (cloned through workerData). The pool
 * uses round-robin dispatch so the Express event loop never blocks on
 * the ~3-5ms ML-DSA-87 signing op.
 *
 * Wire protocol:
 *   parent → worker:  { id: number, message: Uint8Array }
 *   worker → parent:  { id: number, signature: string (base64) }
 *                  |  { id: number, error: string }
 */

import { parentPort, workerData } from "node:worker_threads";
import { ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";

if (!parentPort) {
  throw new Error("crypto-worker.ts must be spawned as a Worker thread");
}

interface WorkerInit {
  secretKey: Uint8Array | Buffer;
}

interface SignRequest {
  id: number;
  message: Uint8Array;
}

const init = workerData as WorkerInit;
// workerData clones the buffer through structuredClone — convert to a plain
// Uint8Array so noble's `abytes` length check passes (it accepts Uint8Array,
// not Node Buffer subclasses in older versions).
const secretKey: Uint8Array = Uint8Array.from(init.secretKey);

parentPort.on("message", (req: SignRequest) => {
  try {
    const message = Uint8Array.from(req.message);
    const sig = ml_dsa87.sign(message, secretKey);
    const signature = Buffer.from(sig).toString("base64");
    parentPort!.postMessage({ id: req.id, signature });
  } catch (err) {
    parentPort!.postMessage({
      id: req.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
