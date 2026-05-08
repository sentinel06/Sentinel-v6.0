import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  try {
    // Actual DB round-trip — proves the connection pool is live, not just
    // that the process started. Fails fast (single lightweight query).
    await db.execute(sql`SELECT 1`);
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json({ ...data, db: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "unreachable", error: String(err) });
  }
});

export default router;
