import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function buildPoolConfig(connectionString: string): pg.PoolConfig {
  let sslmode: string | null = null;
  let host = "";
  try {
    const u = new URL(connectionString);
    sslmode = u.searchParams.get("sslmode");
    host = u.hostname;
  } catch {
  }

  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "helium" ||
    host === "::1";
  const sslDisabled = sslmode === "disable" || (isLocal && !sslmode);

  if (sslDisabled) {
    return { connectionString };
  }

  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
  };
}

export const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));

// Surface unexpected errors on idle clients so a transient network blip
// doesn't crash the process — pg's default behaviour is to throw uncaught.
pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db] idle client error:", err.message);
});

export const db = drizzle(pool, { schema });

/**
 * Warm up the connection pool with retry/backoff. Useful on cold-start when
 * a serverless Postgres (e.g. Neon) takes ~30–80 s to wake from suspend.
 * Resolves once the first SELECT succeeds; rejects only after exhausting
 * the schedule. Safe to call multiple times.
 */
export async function warmupDb(opts: {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
} = {}): Promise<void> {
  const attempts = opts.attempts ?? 8;
  const initialDelay = opts.initialDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 8_000;

  let delay = initialDelay;
  let lastErr: unknown = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
      return;
    } catch (err) {
      lastErr = err;
      if (i === attempts) break;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, maxDelay);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`db warmup failed after ${attempts} attempts`);
}

export * from "./schema";
