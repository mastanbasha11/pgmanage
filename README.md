# PGManage

Multi-tenant SaaS for Paying Guest / hostel owners in India.

## Repo layout

```
apps/
  backend/   FastAPI · Python 3.12 · async SQLAlchemy 2.x · Postgres (per-org schemas) · Redis
  web/       React 18 · Vite · TypeScript · Tailwind + shadcn/ui · TanStack Query · Zustand
  mobile/    Expo (skeleton)
packages/
  shared/    Zod schemas + TS types shared across web and mobile
infrastructure/terraform/   AWS infra (placeholder)
```

This is a **Turborepo** monorepo. `node_modules/` lives at the root via npm workspaces.

## Local dev

Prerequisites: Postgres 16, Redis 7, Python 3.12 + Poetry, Node 20+.

```bash
# 1. Install deps
npm install                              # web + mobile (root)
cd apps/backend && poetry install        # backend

# 2. Configure env
cp .env.example .env                     # then fill in values

# 3. Apply DB migrations
cd apps/backend && poetry run alembic upgrade head

# 4. Run servers (two terminals)
cd apps/backend && poetry run uvicorn app.main:app --reload --port 8000
cd apps/web && npm run dev               # serves on :3000
```

The web app proxies `/api` to the backend on `:8000`.

## Architecture highlights

- **Per-org schema multi-tenancy** — each organisation lives in its own `org_<uuid>` Postgres schema, isolated at the DB level.
- **JWT (RS256 in prod, HS256 in dev)** with role + property-scope claims.
- **Money is integer paise** everywhere — never floats.
- **Brand**: primary `#0F172A` (slate-900), accent `#0D9488` (teal-600).

## Stack constraints

The web app uses **shadcn/ui only** for components, **React Hook Form + Zod** for all forms, **TanStack Query v5** for server state, and **Recharts** for charts. Don't pull in another component or form library.
