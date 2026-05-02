import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Async destination for production: writes go through pino's SonicBoom
 * with sync: false, so log I/O never blocks the event loop. Critical for
 * tail-latency on the gatekeeper signing path.
 *
 * In development we use pino-pretty for readable console output. The
 * pretty transport runs in a worker (thread-stream) which is also async.
 */
const productionDestination = pino.destination({
  sync: false,
  // fd:1 = stdout. Replit captures stdout into the workflow log stream.
  fd: 1,
  // SonicBoom flushes a bit more aggressively than the default 4096
  // so latency-sensitive logs (errors, warns) don't sit in buffer.
  minLength: 0,
});

export const logger = isProduction
  ? pino(
      {
        level: process.env.LOG_LEVEL ?? "info",
        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers['set-cookie']",
        ],
      },
      productionDestination,
    )
  : pino({
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
      ],
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    });

// Flush on process exit so we don't lose the last few log lines.
// Only relevant for the async destination; pretty transport handles its own.
if (isProduction) {
  const flushAndExit = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Sentinel API shutting down — flushing logs");
    productionDestination.flushSync();
    process.exit(0);
  };
  process.once("SIGINT", flushAndExit);
  process.once("SIGTERM", flushAndExit);

  // Crash-path flush — the async destination buffers in memory; if we exit
  // without draining, the last few seconds of audit logs are lost. This is
  // a forensic gap for a security gateway, so we flush on uncaught faults
  // before exiting non-zero.
  process.once("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaughtException — flushing logs and exiting");
    productionDestination.flushSync();
    process.exit(1);
  });
  process.once("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "unhandledRejection — flushing logs and exiting");
    productionDestination.flushSync();
    process.exit(1);
  });
}
