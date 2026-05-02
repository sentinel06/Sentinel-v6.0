/**
 * Sovereign environment detector.
 *
 * Identifies the host platform from process env signals so the gatekeeper
 * seal carries provenance about *where* the signature was minted. Keeps the
 * detection logic in one place — gatekeeper, itasca, and any future signed
 * route reuse the same source of truth.
 *
 * Detection precedence:
 *   1. Replit  — REPL_ID, REPLIT_SLUG, or REPLIT_DEV_DOMAIN
 *   2. AWS EC2 — AWS_EXECUTION_ENV, AWS_REGION, or EC2_INSTANCE_ID
 *   3. unknown — anything else (bare metal, local dev outside Replit, etc.)
 */

export type Provider = "replit" | "aws-ec2" | "unknown";

export interface EnvironmentMetadata {
  readonly provider: Provider;
  readonly region:   string;
  readonly platform: NodeJS.Platform;
}

function detectProvider(): Provider {
  if (
    process.env["REPL_ID"] ||
    process.env["REPLIT_SLUG"] ||
    process.env["REPLIT_DEV_DOMAIN"]
  ) {
    return "replit";
  }
  if (
    process.env["AWS_EXECUTION_ENV"] ||
    process.env["AWS_REGION"] ||
    process.env["EC2_INSTANCE_ID"]
  ) {
    return "aws-ec2";
  }
  return "unknown";
}

function detectRegion(): string {
  return (
    process.env["REPLIT_REGION"] ||
    process.env["AWS_REGION"] ||
    process.env["AWS_DEFAULT_REGION"] ||
    "local"
  );
}

// Process env is immutable for the lifetime of the server, so we capture
// once at module load. Callers get a frozen snapshot.
export const ENVIRONMENT: EnvironmentMetadata = Object.freeze({
  provider: detectProvider(),
  region:   detectRegion(),
  platform: process.platform,
});

export const getEnvironment = (): EnvironmentMetadata => ENVIRONMENT;
