output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "rds_endpoint" {
  description = "RDS cluster endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.elasticache.endpoint
  sensitive   = true
}

output "assets_bucket_name" {
  description = "S3 bucket for document uploads"
  value       = module.s3.assets_bucket_name
}

output "web_bucket_name" {
  description = "S3 bucket for web app static files"
  value       = module.s3.web_bucket_name
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain for web app"
  value       = module.s3.cloudfront_domain
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name for backend API"
  value       = module.ecs.alb_dns_name
}

output "tasks_queue_url" {
  description = "SQS queue URL for background tasks"
  value       = module.sqs.tasks_queue_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}
