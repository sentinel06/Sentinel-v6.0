# syntax=docker/dockerfile:1.7
#
# Sentinel Gateway — multi-stage container build.
#
# IMPORTANT: build context MUST be the workspace root (the directory
# containing pnpm-workspace.yaml), NOT artifacts/api-server. The pnpm
# monorepo install needs the full workspace graph and the root lockfile.
#
#   docker build -f artifacts/api-server/Dockerfile -t sentinel-gateway:latest .
#
# ----------------------------------------------------------------------------

# ============================================================================
# Stage 1 — Builder. Generates dist/index.mjs + dist/lib/crypto-worker.mjs
#           via the existing esbuild pipeline. Includes dev tooling.
# ============================================================================
FROM node:24-alpine AS builder

# Pin pnpm to match the host workspace (CI-reproducible).
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /repo

# Copy the entire workspace. .dockerignore excludes node_modules/dist/.git
# so this stays cache-friendly. We copy everything (rather than the usual
# package-jsons-first cache trick) because the workspace has many packages
# and enumerating each manifest is brittle as the repo evolves.
COPY . .

# Install all deps (includes esbuild + tsc — needed to build).
# --ignore-scripts: don't run any postinstall hooks on the build host.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Compile the api-server bundle.
RUN pnpm --filter @workspace/api-server run build

# ============================================================================
# Stage 2 — Runtime. Slim, non-root, no build tools, healthcheck-equipped.
# ============================================================================
FROM node:24-slim AS runtime

# Production defaults. SENTINEL_CRYPTO_POOL_SIZE is locked to 3 for the
# 2-vCPU Fargate task; can be overridden by the task definition's env.
ENV NODE_ENV=production \
    PORT=8080 \
    SENTINEL_CRYPTO_POOL_SIZE=3

# Drop into the api-server's working directory. We ship the whole installed
# /repo (preserves pnpm's symlinked node_modules layout — pdfkit pulls in
# native subdeps like brotli/unicode-trie that are externalized in build.mjs
# and resolved at runtime through the symlink graph). Image is ~200MB; the
# tradeoff vs. `pnpm deploy` is reliability over size.
COPY --from=builder --chown=node:node /repo /repo
WORKDIR /repo/artifacts/api-server

USER node
EXPOSE 8080

# Liveness: itasca is the cheapest signed endpoint (eager-refreshed buffer,
# ~3-5ms response) so a 200 here proves the worker pool + Express + sign
# pipeline are all functional. Pure node, no curl/wget needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/api/v1/itasca/status',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
