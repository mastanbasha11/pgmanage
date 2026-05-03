# Production deployment — single EC2 host

Stack on one Ubuntu 22.04/24.04 box behind Caddy:

```
Internet ─► Caddy (443 / 80, auto-Let's Encrypt)
              ├─► /api/* → FastAPI :8000
              └─► /*     → React SPA (built at deploy time, served as static files)
                          ├─► Postgres :5432 (Docker volume `pgdata`)
                          └─► Redis    :6379 (Docker volume `redisdata`)
```

All five services run via `docker compose -f docker-compose.prod.yml`.

## Files in this folder

| File                | What it does                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| `bootstrap.sh`      | Idempotent: installs Docker, clones repo, generates secrets, brings stack up |
| `Caddyfile`         | Reverse-proxy + Let's Encrypt + security headers + SPA fall-through           |
| `env.example`       | Template for `/etc/pgmanage/.env` — never commit a populated copy             |
| `backup.sh`         | Nightly `pg_dumpall` → S3, runs from cron                                     |

The compose file lives at the repo root (`docker-compose.prod.yml`).

## First deploy

```bash
# On the EC2 host (after SSH-ing in as ubuntu):
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/mastanbasha11/pgmanage.git /opt/pgmanage
sudo bash /opt/pgmanage/infrastructure/prod/bootstrap.sh \
    pgmanage.in \
    you@example.com
```

`bootstrap.sh` is idempotent — re-running won't regenerate `/etc/pgmanage/.env` if it already exists.

## Subsequent deploys

The `.github/workflows/deploy-prod.yml` workflow handles this automatically once
its secrets are configured. To deploy manually:

```bash
ssh ubuntu@<host>
cd /opt/pgmanage
git pull
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml build
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml --profile migrate run --rm migrate
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml up -d
```

## Backups

```bash
# One-time setup on the host:
sudo ln -sf /opt/pgmanage/infrastructure/prod/backup.sh /usr/local/bin/pgmanage-backup
echo '15 18 * * * root /usr/local/bin/pgmanage-backup >> /var/log/pgmanage-backup.log 2>&1' \
    | sudo tee /etc/cron.d/pgmanage-backup
```

Restore from a dump:

```bash
gunzip -c pgmanage_2026....sql.gz | docker compose -f docker-compose.prod.yml \
    exec -T postgres psql -U pgmanage
```

## What needs to be filled into `/etc/pgmanage/.env` later

`bootstrap.sh` leaves these blank — fill them in once you have the credentials, then
`docker compose -f docker-compose.prod.yml up -d` to pick them up:

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET_NAME` — for nightly backups + bill photo uploads
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — for subscriptions
- `META_APP_SECRET` — for the Meta Lead Ads webhook
- `SES_FROM_EMAIL` — once SES is verified for your domain
