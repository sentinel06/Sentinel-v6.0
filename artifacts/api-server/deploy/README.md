# Sentinel Gateway — AWS Fargate deployment

Terraform that stands up the Sentinel API server on AWS Fargate with a
hardened post-quantum signing pipeline.

## What gets provisioned

| Resource              | Purpose                                                      |
|-----------------------|--------------------------------------------------------------|
| ECR repository        | Container image registry for the gateway                     |
| CloudWatch log group  | Fargate `awslogs` driver target, 30-day retention            |
| Secrets Manager       | Holds `SENTINEL_SIGNING_SEED` (set out-of-band, see below)   |
| ElastiCache (Redis)   | `cache.t4g.micro` — global nonce ledger for replay defense   |
| IAM execution role    | ECR pull, log push, `GetSecretValue` for the seed            |
| IAM task role         | Runtime AWS access (empty default — extend as needed)        |
| ECS cluster + service | Fargate (2 vCPU / 4 GB), 2 replicas, circuit-breaker rollback|
| Security groups       | Redis locked to the ECS task SG only                         |

## First-time bringup

```bash
# 0. Configure AWS auth (env vars / SSO / etc.)
export AWS_REGION=us-east-1

# 1. Provision infra (creates ECR, secret container, Redis, etc.)
cd artifacts/api-server/deploy
terraform init
terraform apply

# 2. Set the signing seed (NEVER commit this; ops controls it)
SEED=$(openssl rand -hex 32)
aws secretsmanager put-secret-value \
  --secret-id "$(terraform output -raw signing_seed_secret_arn)" \
  --secret-string "$SEED"

# 3. Build + push + roll the service
cd ../../..       # back to repo root
./artifacts/api-server/ship_it.sh
```

## Subsequent deploys

```bash
./artifacts/api-server/ship_it.sh
```

Builds, pushes a SHA-tagged image, and force-deploys the ECS service.
The deployment circuit breaker auto-rolls back on health-check failure.

## Production hardening — what to do BEFORE you trust this

The Terraform here is intentionally minimal so first-time bringup works in
a greenfield account. Before serving real traffic, address:

1. **Network**: default VPC + public subnets are easy mode. Set `vpc_id` and
   `subnet_ids` (private subnets, ≥2 AZs, with NAT egress) and flip
   `assign_public_ip = false` in `main.tf`.
2. **Front-end**: tasks accept `:8080` from `0.0.0.0/0`. Put an ALB + ACM
   cert in front, restrict the task SG to only the ALB SG.
3. **ECR immutability**: switch `image_tag_mutability = "IMMUTABLE"` once
   you're SHA-tagging exclusively (ship_it.sh already does this).
4. **Redis**: single-node `cache.t4g.micro` is fine for early traffic; bump
   to a replication group with auth + TLS for real prod.
5. **IAM scope**: the task runtime role is empty. Add only what you need.
6. **Seed rotation**: rotating `SENTINEL_SIGNING_SEED` is a full key roll
   (the public-key fingerprint changes). Plan downstream verifier updates
   before rotating.
7. **State**: configure a remote `backend "s3"` for terraform state. Local
   state is fine for one-off; not for a team.

## Tearing it down

```bash
cd artifacts/api-server/deploy
terraform destroy
```

The signing-seed secret has a 7-day recovery window — restore with
`aws secretsmanager restore-secret` if needed.
