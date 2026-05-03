#!/usr/bin/env bash
# Nightly Postgres backup → S3.
# Install once (as root):
#   ln -sf /opt/pgmanage/infrastructure/prod/backup.sh /usr/local/bin/pgmanage-backup
#   echo '15 18 * * * root /usr/local/bin/pgmanage-backup >> /var/log/pgmanage-backup.log 2>&1' \
#     > /etc/cron.d/pgmanage-backup
# (18:15 UTC = 23:45 IST — runs after most rent recording is done.)
#
# Requires AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET_NAME in /etc/pgmanage/.env.
# Retains 30 days locally, all dumps in S3 (S3 lifecycle rule should expire after ~90 days).

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/pgmanage/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/pgmanage/docker-compose.prod.yml}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/pgmanage}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

if [[ -z "${S3_BUCKET_NAME:-}" ]]; then
  echo "[backup] S3_BUCKET_NAME not set — backups will only be kept locally."
fi

mkdir -p "$LOCAL_DIR"
DUMP_FILE="$LOCAL_DIR/pgmanage_${TIMESTAMP}.sql.gz"

echo "[backup] dumping postgres to $DUMP_FILE"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dumpall -U "$POSTGRES_USER" --clean --if-exists \
  | gzip -9 > "$DUMP_FILE"

echo "[backup] dump size: $(du -h "$DUMP_FILE" | cut -f1)"

if [[ -n "${S3_BUCKET_NAME:-}" ]]; then
  echo "[backup] uploading to s3://${S3_BUCKET_NAME}/postgres/"
  aws s3 cp "$DUMP_FILE" "s3://${S3_BUCKET_NAME}/postgres/$(basename "$DUMP_FILE")" \
    --storage-class STANDARD_IA --no-progress
fi

# Local retention: 30 days
find "$LOCAL_DIR" -name '*.sql.gz' -type f -mtime +30 -delete

echo "[backup] done"
