variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Resource name prefix. All resources are tagged/named with this."
  type        = string
  default     = "sentinel-gateway"
}

variable "environment" {
  description = "Deployment environment (production, staging, etc.)."
  type        = string
  default     = "production"
}

variable "image_tag" {
  description = <<-EOT
    Image tag to deploy. Set this to the SHA or version that ship_it.sh
    just pushed; falling back to "latest" is fine for first-time bringup
    but discouraged for production drift control.
  EOT
  type        = string
  default     = "latest"
}

variable "task_cpu" {
  description = "Fargate task vCPU units (1024 = 1 vCPU). 2048 = 2 vCPU sweet spot for the 3-worker crypto pool."
  type        = number
  default     = 2048
}

variable "task_memory" {
  description = "Fargate task memory in MB."
  type        = number
  default     = 4096
}

variable "service_desired_count" {
  description = "Number of running ECS task replicas."
  type        = number
  default     = 2
}

variable "redis_node_type" {
  description = "ElastiCache node type for the global nonce ledger."
  type        = string
  default     = "cache.t4g.micro"
}

variable "vpc_id" {
  description = <<-EOT
    Optional. If empty, the default VPC for the region is used. For real
    production networks, set this to the VPC ID where private subnets and
    NAT egress are already provisioned.
  EOT
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = <<-EOT
    Optional. If empty, subnets from the VPC above are auto-discovered.
    Provide a list of private subnet IDs (≥2 AZs) for production.
  EOT
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch log group retention."
  type        = number
  default     = 30
}
