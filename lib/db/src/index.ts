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
export const db = drizzle(pool, { schema });

export * from "./schema";
