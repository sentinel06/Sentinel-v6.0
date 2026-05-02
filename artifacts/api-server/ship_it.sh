#!/usr/bin/env bash
# =============================================================================
# Sentinel Gateway — ship it.
#
# Builds the container, pushes to ECR, and rolls the Fargate service.
#
# Phases:
#   1. terraform apply (creates ECR repo + CW logs first; safe to re-run)
#   2. docker build (workspace root context — required for pnpm monorepo)
#   3. docker login + tag + push (immutable :sha + mutable :latest)
#   4. terraform apply with image_tag=<sha> to update the task definition
#   5. aws ecs update-service --force-new-deployment to roll the service
#   6. wait for services-stable so this script's exit code reflects rollout
#
# Run from anywhere — the script resolves its own location.
# =============================================================================

set -Eeuo pipefail

# ── Resolve paths ───────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${SCRIPT_DIR}/deploy"
DOCKERFILE="${SCRIPT_DIR}/Dockerfile"

# ── Config (override via env) ───────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-us-east-1}"
PROJECT_NAME="${PROJECT_NAME:-sentinel-gateway}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Immutable tag = short git SHA (or epoch fallback if not in a git repo).
if git -C "${REPO_ROOT}" rev-parse --short HEAD >/dev/null 2>&1; then
  IMAGE_TAG="$(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
  if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
    IMAGE_TAG="${IMAGE_TAG}-dirty-$(date +%s)"
  fi
else
  IMAGE_TAG="t$(date +%s)"
fi

# ── Pretty logging ──────────────────────────────────────────────────────────
log() { printf "\033[1;36m[ship_it]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[ship_it ERROR]\033[0m %s\n" "$*" >&2; }
trap 'err "failed at line ${LINENO} (exit ${?})"' ERR

# ── Pre-flight ──────────────────────────────────────────────────────────────
log "pre-flight checks"
command -v docker     >/dev/null || { err "docker not found";     exit 1; }
command -v aws        >/dev/null || { err "aws cli not found";    exit 1; }
command -v terraform  >/dev/null || { err "terraform not found";  exit 1; }
aws sts get-caller-identity --output text >/dev/null || { err "AWS credentials not configured"; exit 1; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPO="${ECR_REGISTRY}/${PROJECT_NAME}-${ENVIRONMENT}"

log "region:     ${AWS_REGION}"
log "account:    ${ACCOUNT_ID}"
log "repo:       ${ECR_REPO}"
log "image tag:  ${IMAGE_TAG}"

# ── Phase 1: Terraform — ensure ECR + everything else exists ────────────────
log "phase 1/6 — terraform init + apply (initial / idempotent)"
pushd "${DEPLOY_DIR}" >/dev/null
terraform init -input=false -upgrade
terraform apply -input=false -auto-approve \
  -var "aws_region=${AWS_REGION}" \
  -var "project_name=${PROJECT_NAME}" \
  -var "environment=${ENVIRONMENT}" \
  -var "image_tag=${IMAGE_TAG}"
popd >/dev/null

# ── Phase 2: Docker build (workspace root context) ──────────────────────────
log "phase 2/6 — docker build (context = ${REPO_ROOT})"
docker build \
  --platform linux/amd64 \
  -f "${DOCKERFILE}" \
  -t "${PROJECT_NAME}:${IMAGE_TAG}" \
  -t "${PROJECT_NAME}:latest" \
  "${REPO_ROOT}"

# ── Phase 3: ECR login, tag, push ───────────────────────────────────────────
log "phase 3/6 — ECR login + push"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

docker tag "${PROJECT_NAME}:${IMAGE_TAG}" "${ECR_REPO}:${IMAGE_TAG}"
docker tag "${PROJECT_NAME}:${IMAGE_TAG}" "${ECR_REPO}:latest"
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:latest"

# ── Phase 4: Terraform — roll task definition with the new tag ──────────────
log "phase 4/6 — terraform apply (task def → ${IMAGE_TAG})"
pushd "${DEPLOY_DIR}" >/dev/null
terraform apply -input=false -auto-approve \
  -var "aws_region=${AWS_REGION}" \
  -var "project_name=${PROJECT_NAME}" \
  -var "environment=${ENVIRONMENT}" \
  -var "image_tag=${IMAGE_TAG}"

CLUSTER_NAME="$(terraform output -raw ecs_cluster_name)"
SERVICE_NAME="$(terraform output -raw ecs_service_name)"
TD_FAMILY="$(terraform output -raw task_definition_family)"
popd >/dev/null

# ── Phase 5: Force a new deployment with the just-built image ───────────────
log "phase 5/6 — force-rolling ECS service ${SERVICE_NAME}"
aws ecs update-service \
  --region "${AWS_REGION}" \
  --cluster "${CLUSTER_NAME}" \
  --service "${SERVICE_NAME}" \
  --task-definition "${TD_FAMILY}" \
  --force-new-deployment \
  --output table \
  --query 'service.{name:serviceName,desired:desiredCount,running:runningCount,td:taskDefinition}'

# ── Phase 6: Wait for stable ────────────────────────────────────────────────
log "phase 6/6 — waiting for service to reach steady state (up to 10 min)"
aws ecs wait services-stable \
  --region "${AWS_REGION}" \
  --cluster "${CLUSTER_NAME}" \
  --services "${SERVICE_NAME}"

log "✓ deploy complete — ${ECR_REPO}:${IMAGE_TAG} live on ${SERVICE_NAME}"
log "  tail logs:  aws logs tail /ecs/${PROJECT_NAME}-${ENVIRONMENT} --follow --region ${AWS_REGION}"
