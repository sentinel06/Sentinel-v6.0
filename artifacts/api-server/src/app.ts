import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middleware/authMiddleware";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { attachAdminFlag } from "./lib/admin";

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

// ── Clerk Frontend API proxy ────────────────────────────────────────────────
// Streams raw bytes to Clerk's frontend API on our own domain so prod can
// authenticate without a CNAME. MUST be mounted before any body parser.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// In production, lock CORS to the Replit-published domain(s) only.
// REPLIT_DOMAINS is a comma-separated list set automatically by the platform
// (e.g. "agent-sentinel.replit.app"). In dev it is unset, so we mirror back
// the requesting origin (same as origin: true) for convenience.
const replitDomains = process.env["REPLIT_DOMAINS"]
  ? process.env["REPLIT_DOMAINS"]
      .split(",")
      .map((d) => `https://${d.trim()}`)
  : null;

app.use(
  cors({
    credentials: true,
    origin: replitDomains
      ? (incomingOrigin, callback) => {
          // Allow same-origin requests (no Origin header) and listed domains.
          if (!incomingOrigin || replitDomains.includes(incomingOrigin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        }
      : true,
  }),
);
// Cap request bodies at 512 KB. Prevents a single large payload from
// monopolising memory or the event loop on the log-ingest hot path.
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

// Resolve the publishable key from the request host so the same server can
// serve multiple Clerk custom domains; falls back to CLERK_PUBLISHABLE_KEY.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env["CLERK_PUBLISHABLE_KEY"],
    ),
  })),
);

// ── Admin flag resolution ───────────────────────────────────────────────────
// Stamps `req.isAdmin` based on the signed-in user's email matching
// SENTINEL_ADMIN_EMAILS. Must run after clerkMiddleware so getAuth() works.
app.use(attachAdminFlag);

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

// ── Development: proxy non-API requests to the dashboard's Vite dev server ──
// In dev the api-server claims "/" at the proxy layer (so prod has a single
// upstream for the SPA). To preserve HMR locally, forward everything that is
// NOT /api/* to the dashboard's standalone Vite workflow on port 25417.
if (process.env["NODE_ENV"] !== "production") {
  const dashboardDevTarget = "http://localhost:25417";
  app.use(
    createProxyMiddleware({
      target: dashboardDevTarget,
      changeOrigin: true,
      ws: true,
      pathFilter: (pathname) => !pathname.startsWith("/api"),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    }),
  );
}

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
