output "ecr_repository_url" {
  description = "Push the container image here."
  value       = aws_ecr_repository.sentinel.repository_url
}

output "ecr_repository_name" {
  value = aws_ecr_repository.sentinel.name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.sentinel.name
}

output "ecs_service_name" {
  value = aws_ecs_service.sentinel.name
}

output "task_definition_family" {
  value = aws_ecs_task_definition.sentinel.family
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.sentinel.name
}

output "signing_seed_secret_arn" {
  description = "Set the seed value with: aws secretsmanager put-secret-value --secret-id <arn> --secret-string <64-char-hex>"
  value       = aws_secretsmanager_secret.signing_seed.arn
}

output "redis_endpoint" {
  description = "Internal endpoint of the nonce-ledger Redis. Reachable only from the ECS task SG."
  value       = "redis://${aws_elasticache_cluster.nonce_ledger.cache_nodes[0].address}:6379"
}

output "deploy_summary" {
  description = "Quick reference for ops."
  value = {
    region           = data.aws_region.current.name
    account_id       = data.aws_caller_identity.current.account_id
    cluster          = aws_ecs_cluster.sentinel.name
    service          = aws_ecs_service.sentinel.name
    image_repository = aws_ecr_repository.sentinel.repository_url
    log_group        = aws_cloudwatch_log_group.sentinel.name
  }
}
