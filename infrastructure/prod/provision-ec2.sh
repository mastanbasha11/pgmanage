#!/usr/bin/env bash
# Provisions a t3.medium EC2 + Elastic IP + Security Group in ap-south-1.
# Run from your laptop AFTER `aws configure --profile pgmanage` works.
#
# Usage:
#   AWS_PROFILE=pgmanage \
#   ALLOWED_SSH_CIDR=$(curl -s ifconfig.me)/32 \
#   bash provision-ec2.sh
#
# Re-running is safe: each step is conditional. The script prints the EIP at the end.

set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
NAME="${NAME:-pgmanage-prod}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.medium}"
KEY_NAME="${KEY_NAME:-pgmanage-prod}"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/pgmanage_prod_ed25519}"
ALLOWED_SSH_CIDR="${ALLOWED_SSH_CIDR:?must set ALLOWED_SSH_CIDR=<your-ip>/32 — find it with: curl ifconfig.me}"
VOLUME_GB="${VOLUME_GB:-30}"

aws() { command aws --region "$REGION" "$@"; }
log() { printf '\033[1;32m[provision]\033[0m %s\n' "$*"; }

# ── 1. SSH key ───────────────────────────────────────────────────────────────
if [[ ! -f "$KEY_PATH" ]]; then
  log "generating SSH keypair → $KEY_PATH"
  ssh-keygen -t ed25519 -N "" -C "pgmanage-prod" -f "$KEY_PATH"
fi
PUBKEY=$(cat "${KEY_PATH}.pub")

if ! aws ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
  log "importing key '$KEY_NAME' to EC2"
  aws ec2 import-key-pair --key-name "$KEY_NAME" --public-key-material "fileb://${KEY_PATH}.pub"
else
  log "EC2 key '$KEY_NAME' already exists"
fi

# ── 2. Default VPC / subnet ──────────────────────────────────────────────────
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[0].SubnetId' --output text)
log "default VPC: $VPC_ID  subnet: $SUBNET_ID"

# ── 3. Security group ────────────────────────────────────────────────────────
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME-sg" "Name=vpc-id,Values=$VPC_ID" --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)
if [[ "$SG_ID" == "None" || -z "$SG_ID" ]]; then
  log "creating security group $NAME-sg"
  SG_ID=$(aws ec2 create-security-group --group-name "$NAME-sg" --description "PGManage prod" --vpc-id "$VPC_ID" --query 'GroupId' --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 22  --cidr "$ALLOWED_SSH_CIDR" >/dev/null
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 80  --cidr 0.0.0.0/0 >/dev/null
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0 >/dev/null
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol udp --port 443 --cidr 0.0.0.0/0 >/dev/null   # HTTP/3
fi
log "security group: $SG_ID"

# ── 4. Latest Ubuntu 24.04 AMI ──────────────────────────────────────────────
AMI_ID=$(aws ssm get-parameters --names "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id" --query 'Parameters[0].Value' --output text)
log "AMI: $AMI_ID"

# ── 5. Instance ─────────────────────────────────────────────────────────────
INSTANCE_ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=running,pending,stopped" --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || echo None)
if [[ "$INSTANCE_ID" == "None" || -z "$INSTANCE_ID" ]]; then
  log "launching $INSTANCE_TYPE"
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --subnet-id "$SUBNET_ID" \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=${VOLUME_GB},VolumeType=gp3,DeleteOnTermination=true,Encrypted=true}" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" "ResourceType=volume,Tags=[{Key=Name,Value=$NAME-root}]" \
    --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
    --query 'Instances[0].InstanceId' --output text)
  log "waiting for instance $INSTANCE_ID to be running"
  aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
fi
log "instance: $INSTANCE_ID"

# ── 6. Elastic IP (so the box's public IP doesn't change on reboot) ─────────
ALLOC_ID=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME-eip" --query 'Addresses[0].AllocationId' --output text 2>/dev/null || echo None)
if [[ "$ALLOC_ID" == "None" || -z "$ALLOC_ID" ]]; then
  log "allocating Elastic IP"
  ALLOC_ID=$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME-eip}]" --query 'AllocationId' --output text)
fi
EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" --query 'Addresses[0].PublicIp' --output text)

# Associate (idempotent)
ASSOCIATED_INSTANCE=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" --query 'Addresses[0].InstanceId' --output text)
if [[ "$ASSOCIATED_INSTANCE" != "$INSTANCE_ID" ]]; then
  aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null
fi
log "Elastic IP: $EIP (associated with $INSTANCE_ID)"

# ── 7. S3 bucket for backups ────────────────────────────────────────────────
BUCKET="${BUCKET:-${NAME}-backups-$(aws sts get-caller-identity --query Account --output text)}"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  log "creating S3 bucket $BUCKET"
  aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" >/dev/null
  aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' >/dev/null
  # Lifecycle: backups go to STANDARD_IA after 30 days, expire after 365
  aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-old-backups",
      "Status": "Enabled",
      "Filter": {"Prefix": "postgres/"},
      "Transitions": [{"Days": 30, "StorageClass": "STANDARD_IA"}],
      "Expiration": {"Days": 365}
    }]
  }' >/dev/null
fi
log "S3 backup bucket: $BUCKET"

# ── Summary ─────────────────────────────────────────────────────────────────
cat <<EOF

═══════════════════════════════════════════════════════════════════════════════
  PROVISION COMPLETE
═══════════════════════════════════════════════════════════════════════════════

  Instance ID:   $INSTANCE_ID
  Public IP:     $EIP
  S3 backups:    s3://$BUCKET
  SSH key:       $KEY_PATH

  Connect:
    ssh -i $KEY_PATH ubuntu@$EIP

  Bootstrap (after SSH):
    sudo apt-get update && sudo apt-get install -y git
    sudo git clone https://github.com/mastanbasha11/pgmanage.git /opt/pgmanage
    sudo bash /opt/pgmanage/infrastructure/prod/bootstrap.sh <DOMAIN> <YOUR_EMAIL>

  Then add these GoDaddy DNS records (host: @, www, type: A, value: $EIP, TTL: 600):
    @       A   $EIP
    www     A   $EIP

═══════════════════════════════════════════════════════════════════════════════
EOF
