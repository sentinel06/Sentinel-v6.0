import path from "node:path";
import fs from "node:fs";
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

// In production, lock CORS to the Replit-published domain(s) and the custom
// production domain. REPLIT_DOMAINS is a comma-separated list set automatically
// by the platform. In dev it is unset, so we mirror back the requesting origin
// (same as origin: true) for convenience.
const CUSTOM_DOMAINS = ["https://agent-sentinel.net"];

const replitDomains = process.env["REPLIT_DOMAINS"]
  ? [
      ...process.env["REPLIT_DOMAINS"].split(",").map((d) => `https://${d.trim()}`),
      ...CUSTOM_DOMAINS,
    ]
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

  // Build auth-specific HTML shells at startup.
  //
  // Social crawlers and AI bots only read the initial HTML response — they
  // never execute JavaScript. Serving the homepage index.html for /sign-in
  // and /sign-up therefore gives every bot the wrong page identity: homepage
  // title, canonical URL, OG/Twitter share cards, and Organization + Software
  // Application JSON-LD schema all point at "/" instead of the auth page.
  //
  // To fix this we transform the built index.html at startup, producing two
  // lightweight auth shells (one per route) that:
  //   • set a route-matching <title>
  //   • flip robots to noindex, follow
  //   • drop the canonical link (auth URLs shouldn't claim a canonical)
  //   • strip all OG/Twitter share-preview tags (no link-preview for login)
  //   • strip all JSON-LD structured-data blocks (org/software schema is
  //     wrong context for an auth page)
  // The <body> — including Vite's hashed <script> and <link rel="modulepreload">
  // tags — is untouched so React still bootstraps and Clerk renders correctly.
  const indexHtmlPath = path.join(dashboardDist, "index.html");

  function buildAuthHtml(baseHtml: string, variant: "sign-in" | "sign-up"): string {
    const title =
      variant === "sign-in" ? "Sign In — Agent-Sentinel" : "Sign Up — Agent-Sentinel";

    let html = baseHtml;

    // Replace page title
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

    // Replace meta description
    html = html.replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="Sign in to your Agent-Sentinel account to access your immutable audit ledger and AI governance dashboard." />`,
    );

    // Flip robots: index → noindex
    html = html.replace(
      /<meta name="robots" content="index, follow" \/>/,
      `<meta name="robots" content="noindex, follow" />`,
    );

    // Remove canonical link (auth pages shouldn't claim a canonical URL)
    html = html.replace(/\n[ \t]*<link rel="canonical" href="[^"]*" \/>/, "");

    // Remove Open Graph block (comment through last og: meta, up to Twitter comment)
    html = html.replace(/\n[ \t]*<!-- Open Graph -->[\s\S]*?(?=\n[ \t]*<!-- Twitter)/, "");

    // Remove Twitter / X Card block (comment through last twitter: meta, up to JSON-LD comment)
    html = html.replace(/\n[ \t]*<!-- Twitter \/ X Card -->[\s\S]*?(?=\n[ \t]*<!-- JSON-LD)/, "");

    // Remove JSON-LD Structured Data block (comment + all ld+json script tags, up to Anti-FOUC comment)
    html = html.replace(
      /\n[ \t]*<!-- JSON-LD Structured Data -->[\s\S]*?(?=\n[ \t]*<!-- Anti-FOUC)/,
      "",
    );

    return html;
  }

  let signInHtml: string | null = null;
  let signUpHtml: string | null = null;
  try {
    const baseHtml = fs.readFileSync(indexHtmlPath, "utf-8");
    signInHtml = buildAuthHtml(baseHtml, "sign-in");
    signUpHtml = buildAuthHtml(baseHtml, "sign-up");
    logger.info("Built auth-specific HTML shells for /sign-in and /sign-up");
  } catch (err) {
    logger.warn({ err }, "Could not build auth HTML shells — will fall back to index.html");
  }

  // Auth routes: serve the stripped auth shell (noindex, no OG/JSON-LD) and
  // set X-Robots-Tag as a belt-and-suspenders signal for crawlers that read
  // HTTP headers instead of (or in addition to) the robots meta tag.
  app.use((req, res, next) => {
    const p = req.path;
    if (p.startsWith("/sign-in") || p.startsWith("/sign-up")) {
      res.setHeader("X-Robots-Tag", "noindex, follow");
      const html = p.startsWith("/sign-in") ? signInHtml : signUpHtml;
      if (html !== null) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
        return;
      }
    }
    next();
  });

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
    res.sendFile(indexHtmlPath);
  });
}

export default app;
