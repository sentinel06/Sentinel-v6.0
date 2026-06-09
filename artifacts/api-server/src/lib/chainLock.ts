/**
 * In-process serialization mutex for the audit-ledger append path.
 *
 * The hash chain is linear: each new entry's `previousHash` must point at the
 * `currentHash` of the row that immediately precedes it. Under concurrent
 * writes two requests could both call `getLastHash()`, read the same tail, and
 * then each insert a row pointing at it — forking the chain. This serializer
 * forces every `getLastHash() → insert` critical section to run to completion
 * before the next one begins, so a write fully commits and finalizes its hash
 * before the next concurrent writer can query the tail.
 *
 * Scope: a single Node process. A multi-instance deployment sharing one
 * Postgres would additionally need a database-level lock (e.g.
 * `pg_advisory_xact_lock`) inside the same critical section; this queue closes
 * the in-process race only. The codebase is currently single-instance, so this
 * is sufficient — the upgrade path is isolated to this one helper.
 */

let tail: Promise<unknown> = Promise.resolve();

/**
 * Run `critical` only after every previously-enqueued critical section has
 * settled. Returns the result (or rejection) of `critical` to the caller while
 * keeping the internal queue alive regardless of success or failure.
 */
export function withChainLock<T>(critical: () => Promise<T>): Promise<T> {
  // Chain onto the tail. We pass `critical` as BOTH handlers so the queue
  // advances whether the previous section resolved or rejected.
  const result = tail.then(critical, critical);

  // The tail must never reject (an unhandled rejection would wedge the queue),
  // so swallow the settlement here. Callers still observe the real outcome via
  // `result`.
  tail = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}
