# PGManage

Multi-tenant SaaS for Paying Guest / hostel owners in India. Owners manage properties,
beds, tenants, rent collection, expenses, bookings, and leads; tenants get a self-service
portal.

## Monorepo layout

Turborepo + npm workspaces; `node_modules/` lives at the repo root.

```
apps/
  backend/   FastAPI · Python 3.12 · async SQLAlchemy 2.x · Postgres · Redis · Poetry
  web/       React 18 · Vite · TS · Tailwind + shadcn/ui · TanStack Query v5 · Zustand
  mobile/    Expo (skeleton — not active)
packages/
  shared/    Zod schemas + TS types shared by web & mobile (@pgmanage/...)
infrastructure/
  prod/        docker-compose.prod.yml + Caddyfile (prod deploy)
  terraform/   AWS infra (ECS/ECR, ap-south-1) — partial
```

## Running locally

```bash
# Infra (Postgres 16, Redis 7, LocalStack: s3/sqs/ses/secretsmanager)
docker compose up -d postgres redis localstack

# Backend
cd apps/backend && poetry install
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload --port 8000

# Web (proxies /api → :8000)
cd apps/web && npm run dev          # :3000

# Or everything at once from root
npm run dev                          # turbo run dev --parallel
```

API docs at `/api/docs`. Health at `/health`.

## Architecture — the things that bite if you don't know them

### Per-org schema multi-tenancy
Each organisation lives in its own Postgres schema `org_<uuid-with-underscores>`
(see `get_org_schema_name` in [app/core/database.py](apps/backend/app/core/database.py)).
`public` holds only cross-org tables: `organisations`, `subscription_plans`, `platform_users`.

- Every protected request goes through `get_org_context` ([app/core/dependencies.py](apps/backend/app/core/dependencies.py#L38)),
  which decodes the JWT and runs `SET LOCAL search_path TO <org_schema>, public` for that DB session.
  All ORM/raw queries in the request then transparently hit the right org's tables.
- New org tables are created by **`provision_org_schema`** in
  [app/models/schemas_migration.py](apps/backend/app/models/schemas_migration.py) — raw `CREATE TABLE`
  statements run at signup, **not** by Alembic. Alembic migrations under
  [apps/backend/alembic/versions/](apps/backend/alembic/versions/) cover the `public` schema and
  schema-wide changes. **When you add a column to an org-scoped table you must update BOTH**
  `provision_org_schema` (for new orgs) **and** an Alembic migration that loops existing org schemas.
- Tests create real org schemas via `provision_org_schema` against a real Postgres test DB (no mocks).

### Auth & roles
- JWT via `python-jose`. **HS256 in dev, RS256 in prod** (auto-selected by `settings.use_rs256`
  when RS256 keys are present). Token helpers in [app/core/security.py](apps/backend/app/core/security.py).
- Three token audiences, three dependencies — do not mix them:
  - `get_org_context` → owner/staff app. Roles: `OWNER`, `PARTNER`, `SUPERVISOR`.
  - `get_current_tenant` → tenant portal (`/api/v1/tenant/*`), role `TENANT`.
  - `get_platform_admin` → `/api/platform/*`, role `PLATFORM_ADMIN`.
- Role enforcement: `require_roles(["OWNER","PARTNER"])` as a route dependency.
  Property scoping: `OWNER`/`PARTNER` see all properties; others are limited to
  `property_ids` in their token (`require_property_access`).
- Frontend: 401 → silent token refresh + replay (single in-flight promise); 4-hour
  inactivity logout tracked in localStorage. See [apps/web/src/lib/api.ts](apps/web/src/app/../lib/api.ts).

### Money
**All money is integer paise. Never floats.** Columns are named `*_paise`
(e.g. `monthly_rent_paise`, `amount_paise`). 100 paise = ₹1.

### Timezone
App timezone is `Asia/Kolkata`. Fiscal/billing months use a per-property `settlement_day`
with optional per-month overrides — see [app/services/billing_period.py](apps/backend/app/services/billing_period.py)
and the `billing_periods` table.

## Backend conventions

- Routers in `app/api/v1/<domain>.py`, registered in [app/main.py](apps/backend/app/main.py)
  under `/api/v1`. Platform admin under `/api/platform`.
- Request/response models are Pydantic `BaseModel`s defined inline in the router file.
- Heavy queries are written as **raw SQL via `text()`** (rent ledger, dashboard KPIs);
  simpler CRUD uses the ORM models in `app/models/`. Both rely on the session's search_path.
- Errors: raise the typed exceptions in [app/core/exceptions.py](apps/backend/app/core/exceptions.py)
  (`NotFoundError`, `ConflictError`, `AuthorizationError`, `IdempotencyError`, …). They serialize to
  `{"error": {"code", "message", "details"}}`. Payment writes are idempotent.
- Middleware order (outermost first): RequestID → RequestLogging → RateLimit → CORS → TrustedHost(prod).
- Background tasks under `app/tasks/` (rent reminders, move-out alerts, lead follow-ups).
- Services: `email_service` (SMTP), `s3_service` (presigned uploads, LocalStack in dev),
  `notification_service`.

### Tests
```bash
cd apps/backend && poetry run pytest          # needs Postgres + Redis up
```
Tests hit a **real** `pgmanage_test` database (NullPool, dependency-overridden `get_db`).
Fixtures in [tests/conftest.py](apps/backend/tests/conftest.py) build orgs/properties/users/tenants
and mint tokens directly. Rate limiting is disabled in tests. `auth_headers(token)` is the helper
for authenticated requests.

### Lint / format
`ruff` (line-length 88, rules `E,F,I,N,UP,B,C4,DTZ,T10,RET,SIM`) and `black`. `mypy` runs in CI
but is currently non-blocking.

## Frontend conventions

- **Stack is locked**: shadcn/ui only for components (`src/components/ui/`),
  React Hook Form + Zod for all forms, TanStack Query v5 for server state, Zustand for auth
  (`src/store/auth.ts`), Recharts for charts. **Don't add another component/form/chart library.**
- Server calls go through the `api` (owner/staff) and `tenantApi` (portal) axios instances in
  [src/lib/api.ts](apps/web/src/lib/api.ts). Use `getApiError(err)` to surface backend messages.
- Data fetching lives in `src/hooks/use*.ts` (one per domain) wrapping TanStack Query.
- Routing in [src/app/Router.tsx](apps/web/src/app/Router.tsx): `/auth/*` public, `/portal/*`
  separate tenant app, everything else behind `PrivateRoute` inside `Layout`.
- Pages under `src/pages/<domain>/`.
- Brand colors: primary `#0F172A` (slate-900), accent `#0D9488` (teal-600).

## Domains / data model

Org-scoped tables (per `provision_org_schema`): users, properties, floors, room_types, rooms,
beds, tenants, rent_plans, payments, rent_ledger_entries, expense_categories, expenses, leads,
lead_activities, announcements, complaints, notification_log, audit_log, billing_periods, bookings.

Feature areas in flight (recent commits + working tree): bookings, advances/refunds with
non-refundable advance handling, expense receipts, expanded dashboard KPIs, fiscal-month
settlement, password reset (forgot/reset pages + backend), tenant ID-proof uploads.

## CI/CD

GitHub Actions in `.github/workflows/`: `backend.yml` (ruff + pytest on PG/Redis services, then
ECR/ECS deploy), `web.yml`, `deploy-prod.yml`. Backend deploys to AWS ECS in `ap-south-1`.
Prod runs via [docker-compose.prod.yml](docker-compose.prod.yml) behind Caddy
([infrastructure/prod/Caddyfile](infrastructure/prod/Caddyfile)).

## Future improvements / backlog

### Website-lead intake (shipped — v1)
PG owners embed a booking form on their own site; it POSTs to the public, unauthenticated
endpoint `POST /api/v1/leads/website?token=…` ([app/api/v1/public_leads.py](apps/backend/app/api/v1/public_leads.py)),
which routes by `organisations.website_lead_token` (a **public site key**, not a secret —
it ships in the website's JS) and stores a `source=WEBSITE` lead. Owner-facing UI:
Leads → Website Leads tab + Settings → Website Integration. v1 protections are CORS allowlist +
10/IP/hour rate limit + validation. Two known follow-ups before promoting it widely:

- **Bot/spam protection (Cloudflare Turnstile or hCaptcha).** CORS only constrains browsers
  and the token is public, so neither is a real auth boundary. Add an invisible captcha widget to
  the booking form, pass its token in the payload, and verify it server-side in `create_website_lead`
  before inserting (there's a `_verify_captcha` hook comment in the endpoint for this). Needs a
  `TURNSTILE_SECRET` setting + the owner's site key surfaced in the embed snippet.
- **Per-owner CORS allowlist editor.** `organisations.website_allowed_origins` exists and is
  enforced (`_allowed_origin` in the endpoint), but there's no UI to set it — it's currently
  permissive (NULL = allow any origin, token still required). Add an origins field to
  Settings → Website Integration + a small authed PATCH endpoint so owners can lock submissions to
  their own domain(s).
