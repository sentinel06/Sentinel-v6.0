# =============================================================================
# Sentinel Gateway — AWS Fargate deployment
#
# Provisions:
#   • ECR repository for the container image
#   • CloudWatch log group (Fargate awslogs driver target)
#   • Secrets Manager secret for SENTINEL_SIGNING_SEED (value set out-of-band)
#   • ElastiCache (Redis OSS) cache.t4g.micro for the global nonce ledger
#   • IAM task-execution role (ECR pull, log push, secret read)
#   • IAM task role (runtime AWS access — empty by default; extend as needed)
#   • ECS cluster + Fargate task definition (2 vCPU / 4 GB) + service
#   • Security groups locking Redis to the ECS task SG
#
# Network: by default uses the account's default VPC + its subnets so first-
# time bringup works in any greenfield account. For real prod set vpc_id +
# subnet_ids to your private network. ECS service runs with assign_public_ip
# = true on the default-VPC path because Fargate needs egress to ECR; if you
# move to private subnets put a NAT in front and flip that flag to false.
# =============================================================================

# ── Network discovery ────────────────────────────────────────────────────────
data "aws_vpc" "selected" {
  id      = var.vpc_id != "" ? var.vpc_id : null
  default = var.vpc_id == "" ? true : null
}

data "aws_subnets" "selected" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected.id]
  }
}

locals {
  # Use caller-provided subnets when set, otherwise fall back to discovered VPC subnets.
  effective_subnet_ids = length(var.subnet_ids) > 0 ? var.subnet_ids : data.aws_subnets.selected.ids
  name_prefix          = "${var.project_name}-${var.environment}"
}

data "aws_caller_identity" "current" {}
data "aws_region"          "current" {}

# ── ECR ──────────────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "sentinel" {
  name                 = local.name_prefix
  image_tag_mutability = "MUTABLE" # use IMMUTABLE in true prod once SHA-tagging is wired
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "sentinel" {
  repository = aws_ecr_repository.sentinel.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 images; expire the rest."
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ── CloudWatch Logs ──────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "sentinel" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days
}

# ── Secrets Manager — SENTINEL_SIGNING_SEED ──────────────────────────────────
# Value is set out-of-band (see deploy/README.md) so the seed never enters
# Terraform state. Terraform only manages the secret container + IAM access.
resource "aws_secretsmanager_secret" "signing_seed" {
  name                    = "${local.name_prefix}/signing-seed"
  description             = "ML-DSA-87 signing seed (64-char hex). Provisioned out-of-band; rotation = full key roll."
  recovery_window_in_days = 7
}

# ── Security groups ──────────────────────────────────────────────────────────
resource "aws_security_group" "ecs_task" {
  name        = "${local.name_prefix}-ecs-task"
  description = "Sentinel ECS task — egress all, inbound 8080 from world (front with ALB for prod)."
  vpc_id      = data.aws_vpc.selected.id

  ingress {
    description = "API port"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # TODO prod: restrict to ALB SG
  }

  egress {
    description = "All egress (ECR pull, secrets API, CloudWatch, Redis)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis"
  description = "Sentinel Redis (nonce ledger) — only reachable from ECS task SG."
  vpc_id      = data.aws_vpc.selected.id

  ingress {
    description     = "Redis from Sentinel ECS tasks only"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_task.id]
  }
}

# ── ElastiCache (Redis OSS) — nonce ledger ───────────────────────────────────
resource "aws_elasticache_subnet_group" "sentinel" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = local.effective_subnet_ids
}

resource "aws_elasticache_cluster" "nonce_ledger" {
  cluster_id           = "${local.name_prefix}-nonces"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.sentinel.name
  security_group_ids   = [aws_security_group.redis.id]
  apply_immediately    = true
}

# ── IAM ──────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Task EXECUTION role — used by the ECS agent to start the container
# (pull image, push logs, fetch the secret to inject as env var).
resource "aws_iam_role" "task_execution" {
  name               = "${local.name_prefix}-task-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    sid       = "ReadSigningSeed"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.signing_seed.arn]
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "${local.name_prefix}-task-exec-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}

# Task RUNTIME role — what the application code itself can call. Empty by
# default (the gateway has no AWS-side dependencies at runtime). Extend with
# additional inline policies if the service ever calls AWS APIs directly.
resource "aws_iam_role" "task_runtime" {
  name               = "${local.name_prefix}-task-runtime"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# ── ECS cluster + task definition + service ──────────────────────────────────
resource "aws_ecs_cluster" "sentinel" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "sentinel" {
  family                   = local.name_prefix
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task_runtime.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "sentinel"
      image     = "${aws_ecr_repository.sentinel.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
          name          = "api"
          appProtocol   = "http"
        }
      ]

      environment = [
        { name = "NODE_ENV",                   value = var.environment },
        { name = "PORT",                       value = "8080" },
        # Lock at 3 for the 2-vCPU Fargate task — see crypto.ts comment.
        { name = "SENTINEL_CRYPTO_POOL_SIZE",  value = "3" },
        # ioredis URL for the global nonce ledger.
        { name = "REDIS_URL",                  value = "redis://${aws_elasticache_cluster.nonce_ledger.cache_nodes[0].address}:6379" },
      ]

      secrets = [
        {
          name      = "SENTINEL_SIGNING_SEED"
          valueFrom = aws_secretsmanager_secret.signing_seed.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.sentinel.name
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "sentinel"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('http').get('http://127.0.0.1:8080/api/v1/itasca/status',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 15
      }
    }
  ])
}

resource "aws_ecs_service" "sentinel" {
  name            = local.name_prefix
  cluster         = aws_ecs_cluster.sentinel.id
  task_definition = aws_ecs_task_definition.sentinel.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"

  # Rolling deploy with circuit breaker — auto-rollback on failed deploys.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = local.effective_subnet_ids
    security_groups  = [aws_security_group.ecs_task.id]
    # Fargate needs egress to ECR. In default-VPC bringup we attach a public
    # IP so it can reach the internet directly. Move to private subnets +
    # NAT for prod and flip this to false.
    assign_public_ip = true
  }

  lifecycle {
    # The image_tag is what changes between deploys — let ship_it.sh own it
    # via aws ecs update-service --force-new-deployment, not Terraform.
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [
    aws_iam_role_policy.task_execution_secrets,
    aws_elasticache_cluster.nonce_ledger,
  ]
}
