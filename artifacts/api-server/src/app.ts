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

export default app;
