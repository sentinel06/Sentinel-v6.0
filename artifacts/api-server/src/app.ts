import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middleware/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Sentinel admin guard ────────────────────────────────────────────────────
// Any request whose URL path contains "/admin/" must carry a valid
// X-Sentinel-Key header (validated against the SENTINEL_KEY env var).
// Registered BEFORE the main router so it short-circuits before any
// /v1/admin/* handler executes. We use an explicit path predicate (rather
// than a RegExp path) because Express 5 changed RegExp-path semantics in
// path-to-regexp v8 and a literal RegExp no longer matches reliably.
app.use((req, res, next) => {
  if (req.path.includes("/admin/")) {
    authMiddleware(req, res, next);
    return;
  }
  next();
});

app.use("/api", router);

// ── Production: serve the bundled dashboard from the same process ──────────
// Replit autoscale (Cloud Run) wants ONE container with ONE process exposing
// ONE port. In dev the path-router proxies "/" → dashboard:25417 and "/api"
// → api-server:8080, but production cannot disambiguate two artifacts. So
// we unify: in production the api-server also serves the dashboard's vite
// build output. /api/* hits the API; everything else falls through to the
// SPA shell with client-side routing.
if (process.env["NODE_ENV"] === "production") {
  // The production run command launches from the workspace root
  // (`node --enable-source-maps artifacts/api-server/dist/index.mjs`),
  // so process.cwd() is reliably the repo root.
  const dashboardDist = path.resolve(
    process.cwd(),
    "artifacts/sentinel-dashboard/dist/public",
  );
  logger.info({ dashboardDist }, "Serving bundled dashboard from api-server");

  // Real assets (hashed JS/CSS, fonts, etc.) — long cache, no auto-index so
  // the SPA fallback below owns the `/` route exclusively.
  app.use(
    express.static(dashboardDist, {
      index: false,
      maxAge: "1h",
      fallthrough: true,
    }),
  );

  // SPA fallback. Anything that isn't /api/* and isn't a real static asset
  // gets index.html so React Router can resolve client-side. Use a middleware
  // (not a RegExp route) because Express 5's path-to-regexp v8 changed
  // RegExp route semantics — middleware ordering is the safe contract.
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
}

export default app;
