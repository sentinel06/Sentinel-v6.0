/**
 * Sovereign environment detector.
 *
 * Identifies the host platform from process env signals so the gatekeeper
 * seal carries provenance about *where* the signature was minted. Keeps the
 * detection logic in one place — gatekeeper, itasca, and any future signed
 * route reuse the same source of truth.
 *
 * Detection precedence (top wins — order matters because some hosts set
 * overlapping signals; Fargate also exposes AWS_REGION, for example):
 *   1. AWS Fargate — ECS_CONTAINER_METADATA_URI_V4 (ECS agent injects this
 *      into every Fargate task) or AWS_EXECUTION_ENV === "AWS_ECS_FARGATE"
 *   2. Replit      — REPL_ID, REPLIT_SLUG, or REPLIT_DEV_DOMAIN
 *   3. AWS EC2     — AWS_EXECUTION_ENV, AWS_REGION, or EC2_INSTANCE_ID
 *   4. unknown     — anything else (bare metal, local dev outside Replit, etc.)
 */

export type Provider = "aws-fargate" | "replit" | "aws-ec2" | "unknown";

export interface EnvironmentMetadata {
  readonly provider: Provider;
  readonly region:   string;
  readonly platform: NodeJS.Platform;
}

function detectProvider(): Provider {
  // Fargate first — the ECS task agent injects ECS_CONTAINER_METADATA_URI_V4
  // into every running container; AWS_EXECUTION_ENV=AWS_ECS_FARGATE is the
  // documented secondary signal. Both also set AWS_REGION, so detecting
  // Fargate before generic AWS prevents misclassification as aws-ec2.
  if (
    process.env["ECS_CONTAINER_METADATA_URI_V4"] ||
    process.env["AWS_EXECUTION_ENV"] === "AWS_ECS_FARGATE"
  ) {
    return "aws-fargate";
  }
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
