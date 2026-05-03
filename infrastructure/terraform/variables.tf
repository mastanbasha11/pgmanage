variable "project" {
  description = "Project name used for resource naming"
  type        = string
  default     = "pgmanage"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-1"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.small"
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "pgmanage"
  sensitive   = true
}

variable "db_password" {
  description = "RDS master password (store in Secrets Manager, not here)"
  type        = string
  sensitive   = true
}

variable "cache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.small"
}

variable "backend_cpu" {
  description = "ECS task CPU units for backend"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "ECS task memory (MB) for backend"
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Desired number of backend ECS tasks"
  type        = number
  default     = 2
}

variable "domain_name" {
  description = "Primary domain name (e.g. pgmanage.com)"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of ACM certificate for HTTPS"
  type        = string
}

variable "stripe_secret_key" {
  description = "Stripe secret key (stored in Secrets Manager at runtime)"
  type        = string
  sensitive   = true
  default     = ""
}
