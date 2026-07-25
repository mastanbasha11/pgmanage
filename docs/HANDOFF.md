# PGManage — Handoff

_Last updated: 2026-07-25 · main @ `a543755` (deployed to prod)_

Multi-tenant SaaS for Paying-Guest / hostel owners in India. Owners manage
properties, beds, tenants, rent, expenses, bookings and leads; tenants get a
self-service portal. Turborepo: `apps/backend` (FastAPI), `apps/web` (React/Vite),
`apps/mobile` (Expo — **staff-only**), `packages/shared`, `infrastructure/prod`.

---

## 1. Current project state

### Live in production (pgmanage.in)
- **Backend + web + Caddy** via `docker-compose.prod.yml`, host `ubuntu@13.126.139.161`, repo at `/opt/pgmanage`.
- **Tenant online payments (Razorpay)** — shipped this session. Owners connect their own Razorpay account under **Settings → Payments**; tenants pay rent/advance/deposit from the web portal. Webhook is the source of truth. Not yet exercised end-to-end with real keys — waiting on the owner's Razorpay test keys / KYC. See `docs/tenant-online-payments.md`.
- **Leads scalable worklist** — shipped this session. Replaced the Kanban-as-default with a priority worklist (List/Board/Split). Board (drag-to-move) preserved as a view.
- **Web redesign** (density fix + new token system) and **dashboard/rent/tenants/bookings/expenses** revamps — shipped earlier this session.
- **Backend fixes**: `roi-by-room` was 500ing on every call (nonexistent `rooms.is_active` column + asyncpg int/text bind) — fixed + tested; rate limiter re-keyed **per authenticated user** (was per-IP, so colleagues behind one office NAT shared a 60/min bucket) and raised to 300/min (prod env overrides to 120).
- **Leads data**: `NEGOTIATING` and `BOOKED` removed from the pipeline UI (enum kept); one-time data fix moved 288 `NEW` → `CONTACTED` for the LOOP org.

### Mobile
- **Staff app** fully redesigned to a new mock (all screens), first charts added (`react-native-svg`). Latest APK: v1.1.1 / versionCode 3, from commit `fb4230d`, EAS `preview` profile → APK, API `https://pgmanage.in/api/v1`.
- **Tenant mobile portal is dead v0 scaffolding** — unreachable and out of sync with the API. Mobile is effectively staff-only. Tenants use the **web** portal.

### Tests / gates
- Backend: `poetry run pytest` — **342 passing**, **6 pre-existing failures** (5 in `test_auth.py`, 1 in `test_expenses.py`) that also fail on a clean `main` (verified via `git stash`). Not caused by recent work.
- Mobile: `npx tsc --noEmit` clean; `npx jest` 77 passing.
- Web: `npx tsc --noEmit` clean, `npm run build` succeeds. **No test runner or ESLint config exists in `apps/web` or `apps/mobile`** — the `lint` scripts have never worked; `tsc` + `build` are the real gates.

---

## 2. Decisions made (with rationale)

- **Payments use a per-owner Razorpay model, not a platform marketplace.** Each PG owner connects their own account; money flows tenant→owner and the platform never holds funds — this avoids needing an RBI Payment Aggregator licence. Credentials live per-org on `public.organisations`; secrets are write-only over the API and resolve Secrets-Manager-ARN → plaintext (DB encrypted at rest), mirroring the WhatsApp token pattern.
- **Payments v1 scope = RENT / ADVANCE / DEPOSIT.** Amounts are computed server-side (rent = current-month outstanding; deposit = plan deposit minus already-paid, with a pay-twice guard; advance = client amount capped at 12× rent). Client amounts are never trusted.
- **Exactly-once payment recording** via `idempotency_key = "rzp_<payment_id>"` (that column is `UNIQUE`), so the verify-callback and the webhook converge on one row. No org-schema change — the existing `payments` table is reused.
- **Razorpay integration uses `httpx.AsyncClient` + stdlib `hmac`, not the official SDK** — the SDK is synchronous and would block the event loop. Zero new dependencies.
- **Leads: worklist over Kanban at scale.** At 328 leads growing ~40/wk, browsing a board doesn't work; the default is now a priority-sorted table where the ~20 needing action rise to the top. The Kanban is kept as the "Board" view (render-prop) so drag-to-move survives. Lead **score** is a client-side heuristic (`leadScore.ts`) — the backend has no score column.
- **`NEGOTIATING` + `BOOKED` dropped from the pipeline UI** (this PG's flow is New → Contacted → Site Visited → Converted/Lost). Both remain valid backend enum values, so legacy leads don't break.
- **Money is integer paise everywhere** — never floats. Razorpay's native unit is also paise, so no conversion.
- **Mobile is staff-only; the tenant experience is the web `/portal/*` app.** The mobile tenant folder is v0 scaffolding.
- **Design tokens are shared between web and mobile** (`apps/mobile/lib/theme.ts` mirrors `apps/web/src/index.css`) plus a shared `chartColors`/`EXPENSE_COLORS` palette, so a category is the same colour on both apps.

---

## 3. Pending tasks / backlog

### Payments (highest-value follow-ups)
- **Owner completes Razorpay KYC** (PAN + bank + IFSC) to move from test to live money — on the owner, ~1–2 days. Guided in Settings → Payments Step 5.
- **Real end-to-end test** with the owner's Razorpay test keys (the one thing that couldn't be automated).
- Refunds from the portal (owner-side refund flow exists; wiring a Razorpay refund call is a follow-up); partial rent payments across charge types; **mobile** tenant payments (blocked on the mobile tenant app rebuild).

### Tenant side
- **Real OTP delivery (WhatsApp/SMS)** — currently email-only, and dev returns the code inline (no real auth barrier). This blocks everything else on the tenant side.
- **Tenant self-serve ID-proof upload** — only an owner/staff endpoint exists today; complaint photo upload proves the plumbing.
- **Multi-org tenants are refused on web** (told to "use the app", which is the dead mobile app) — no working door for that segment.
- **Rebuild the mobile tenant portal** on the new design system (biggest effort; deferrable since web portal is responsive).
- Backend stubs with finished web UI waiting on data: visitors, referrals, notifications, meals schedule, community (events/residents/partners).

### Leads
- **True virtualization for 5,000+** — the worklist currently client-paginates the fetched set (`limit: 500`); for much larger tenants, add server pagination or `react-window`.
- **Export** and **Automations** buttons in the worklist header are stubs.

### Mobile (staff)
- Expenses per-row edit/delete/approve/receipt-upload; push notifications; iOS build config.

### Platform / CI
- **6 pre-existing backend test failures** (5 auth, 1 expenses) — unrelated to recent work; worth fixing.
- **No ESLint config** in web or mobile — the `lint` scripts are broken repo-wide.
- Consider a CI check that diffs frontend hook param/field names against the FastAPI routers — this class of drift bit ~10 times this session (see constraints).
- **Deploys depend on the sandbox's rotating outbound IP** being whitelisted in the EC2 security group each time. Wiring `.github/workflows/deploy-prod.yml` with `SSH_HOST`/`SSH_USER`/`SSH_KEY`/`PROD_DOMAIN` secrets would remove this (the private key must be pasted by the user directly).

---

## 4. Important constraints (read before touching prod or the data layer)

### Deploy
- **Always** deploy with `sudo docker compose -f docker-compose.prod.yml --env-file /etc/pgmanage/.env <cmd>`. The env file is root-owned at `/etc/pgmanage/.env`, outside the repo. Omitting it recreates containers with **blank env** → `RS256_PRIVATE_KEY must be set` → backend down → Caddy dependency fails → site offline. (This caused a ~2-min outage once.)
- **Migrations:** run via the profiled service — `… --profile migrate run --build --rm migrate`. **The `--build` is required** — the migrate image is cached and won't contain a new migration file otherwise (this silently no-ops and leaves the DB a version behind).
- **The Caddyfile is bind-mounted** (`./infrastructure/prod/Caddyfile`). A CSP/config change needs `… restart caddy` — a plain `up -d` won't reload it.
- **Web deploys**: `up -d --build web-build` rebuilds the SPA into the volume Caddy serves. Users may need a hard refresh (PWA service worker caches the old bundle).
- Prod host `13.126.139.161`, key `~/.ssh/pgmanage_prod_ed25519`. The sandbox's outbound IP rotates and must be whitelisted (port 22) in the EC2 security group each session.

### Data model
- **Per-org Postgres schema multi-tenancy** (`org_<uuid_with_underscores>`). `public` holds only `organisations`, `subscription_plans`, `platform_users`, `tenant_identity*`. Every protected request does `SET LOCAL search_path` via `get_org_context` / `get_current_tenant`.
- **Adding a column to an org-scoped table means updating BOTH** `provision_org_schema` (new orgs) **and** an Alembic migration looping existing schemas. For **public** tables it's Alembic only — and also the **hand-maintained DDL in `tests/conftest.py`** (it recreates `public.organisations` etc. so tests don't depend on alembic state).
- **Money is integer paise**, columns named `*_paise`. Never floats.
- **Fiscal/billing months** use a per-property `settlement_day` with per-month overrides in `billing_periods`. Cash-flow KPIs attribute by fiscal window (`collected_at`); Expected/Outstanding/Discount stay rent-month-based.

### Frontend ↔ backend contract drift (bit ~10× this session)
- Hand-written client types/params are **assertions, not contracts** — nothing validates them against the routers. A wrong field name compiles and renders `0`/`—`/blank; a wrong query param is **silently dropped by FastAPI**. Before trusting a hook, read the router's `return {…}` and `Query(...)` decls. See the `feedback-client-type-drift` memory.
- **`total` from list endpoints is `len(items)` for the page, not a table count** — a `limit: 1` probe always answers 1. Count client-side with the same limit as the main list.
- **Enum labels vs members**: the UI's `'BANK'` is not in `payment_mode_enum` (`CASH|UPI|BANK_TRANSFER|CARD|CHEQUE`); route UI labels through an explicit mapper (`mapPaymentModeForApi`).

### Auth / integrations
- JWT via `python-jose`, **HS256 in dev / RS256 in prod** (auto-selected). Three token audiences/dependencies — don't mix: `get_org_context` (owner/staff), `get_current_tenant` (portal), `get_platform_admin`.
- **Razorpay**: the webhook (`/api/v1/webhooks/razorpay?org=<slug>`) is the source of truth and is HMAC-verified with the org's webhook secret; it's auth-exempt by design. The site **CSP must allow** `checkout.razorpay.com` (script/frame), `api.razorpay.com` (frame), `*.razorpay.com` (connect) — already in the Caddyfile.

### Frontend stack (locked)
- shadcn/ui only, React Hook Form + Zod, TanStack Query v5, Zustand (auth), Recharts. Don't add another component/form/chart library. (There is **no** `Switch`/`Checkbox` shadcn component installed — build inline or add via shadcn if needed.)

---

## 5. Key files (orientation)

| Area | Files |
|---|---|
| Payments (backend) | `app/services/razorpay_gateway.py`, `app/services/online_payment.py`, tenant endpoints in `app/api/v1/tenant_portal.py`, owner config in `app/api/v1/payments.py`, webhook in `app/api/v1/webhooks.py`, migration `alembic/versions/037_*` |
| Payments (web) | `pages/settings/PaymentsPage.tsx` (owner), `pages/tenant-portal/screens/PayScreen.tsx` (tenant), `lib/tenant-data/razorpay.ts`, `hooks/usePaymentGateway.ts` |
| Leads worklist | `pages/leads/leadScore.ts` (pure), `pages/leads/LeadWorklist.tsx`, `pages/leads/LeadsPage.tsx` (orchestrator + Board render-prop) |
| Multi-tenancy | `app/core/database.py` (`get_org_schema_name`), `app/core/dependencies.py`, `app/models/schemas_migration.py` (`provision_org_schema`) |
| Docs | `docs/tenant-online-payments.md`, `CLAUDE.md`, agent memory under `~/.claude/projects/-Users-mastan-pgmanage/memory/` |
