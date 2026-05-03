terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    # Configure these via -backend-config or environment variables
    # bucket = "pgmanage-terraform-state"
    # key    = "pgmanage/terraform.tfstate"
    # region = "ap-south-1"
    # dynamodb_table = "pgmanage-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name_prefix = "${var.project}-${var.environment}"
  azs         = ["${var.aws_region}a", "${var.aws_region}b"]
}

# ─── VPC ────────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-igw" }
}

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.name_prefix}-public-${count.index + 1}" }
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]
  tags              = { Name = "${local.name_prefix}-private-${count.index + 1}" }
}

resource "aws_eip" "nat" {
  count  = 1
  domain = "vpc"
  tags   = { Name = "${local.name_prefix}-nat-eip" }
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${local.name_prefix}-nat" }
  depends_on    = [aws_internet_gateway.igw]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
  tags = { Name = "${local.name_prefix}-rt-public" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
  tags = { Name = "${local.name_prefix}-rt-private" }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ─── MODULES ────────────────────────────────────────────────────────────────

module "rds" {
  source               = "./modules/rds"
  name_prefix          = local.name_prefix
  vpc_id               = aws_vpc.main.id
  private_subnet_ids   = aws_subnet.private[*].id
  db_instance_class    = var.db_instance_class
  db_username          = var.db_username
  db_password          = var.db_password
  ecs_security_group_id = module.ecs.security_group_id
}

module "elasticache" {
  source               = "./modules/elasticache"
  name_prefix          = local.name_prefix
  vpc_id               = aws_vpc.main.id
  private_subnet_ids   = aws_subnet.private[*].id
  cache_node_type      = var.cache_node_type
  ecs_security_group_id = module.ecs.security_group_id
}

module "s3" {
  source      = "./modules/s3"
  name_prefix = local.name_prefix
}

module "sqs" {
  source      = "./modules/sqs"
  name_prefix = local.name_prefix
}

module "ecs" {
  source              = "./modules/ecs"
  name_prefix         = local.name_prefix
  vpc_id              = aws_vpc.main.id
  public_subnet_ids   = aws_subnet.public[*].id
  private_subnet_ids  = aws_subnet.private[*].id
  desired_count       = var.backend_desired_count
  cpu                 = var.backend_cpu
  memory              = var.backend_memory
  s3_bucket_name      = module.s3.assets_bucket_name
  sqs_queue_arn       = module.sqs.tasks_queue_arn
  domain_name         = var.domain_name
  acm_certificate_arn = var.acm_certificate_arn
}
