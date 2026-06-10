# PGManage — Engineering Handoff

> Single source of truth for someone picking up this codebase cold. Pair
> with [`CLAUDE.md`](./CLAUDE.md) (architecture deep-dive) and
> [`apps/mobile/RELEASE_STATUS.md`](./apps/mobile/RELEASE_STATUS.md)
> (mobile-specific status).

---

## 1. TL;DR

| | |
|---|---|
| **Product** | Multi-tenant SaaS for PG / hostel / coliving owners in India. Owners manage properties, beds, tenants, rent, expenses, leads, bookings; tenants get a self-service portal. |
| **Stage** | Live in prod with one paying org (The Loop Modern Coliving). Backend stable; web app feature-complete for v1; mobile app shipped to one APK install. |
| **Repo** | Turborepo monorepo. Branch `main` is the deployment source for both web and backend. |
| **Live URL** | `https://pgmanage.in` (web + API). |
| **Prod host** | EC2 `13.126.139.161` in `ap-south-1`. Docker Compose + Caddy. |
| **Last commit (at handoff)** | `5f39829` — mobile 60-test safety net. |

---

## 2. Architecture overview

### Monorepo layout

```
apps/
  backend/   FastAPI · Python 3.12 · async SQLAlchemy 2 · Postgres · Redis · Poetry
  web/       React 18 · Vite · TS · Tailwind + shadcn/ui · TanStack Query v5 · Zustand
  mobile/    Expo SDK 51 · expo-router · TanStack Query v5 · Zustand · jest-expo
packages/
  shared/    Zod schemas + TS types shared by web & mobile (@pgmanage/...)
infrastructure/
  prod/      docker-compose.prod.yml + Caddyfile
  terraform/ AWS infra (ECS/ECR, partial)
docs/
  API.md        Endpoint reference (hand-written)
  openapi.json  Live snapshot of /api/v1/openapi.json
```

### Per-org-schema multi-tenancy (CRITICAL)

Every organisation lives in its own Postgres schema `org_<uuid_with_underscores>`.
- `public` holds only cross-org tables (`organisations`, `subscription_plans`, `platform_users`, `whatsapp_routing`).
- Every protected request flows through `get_org_context` ([app/core/dependencies.py:38](apps/backend/app/core/dependencies.py#L38)) which decodes the JWT and runs `SET LOCAL search_path TO <schema>, public`.
- New org tables are created by `provision_org_schema` ([app/models/schemas_migration.py](apps/backend/app/models/schemas_migration.py)) — raw `CREATE TABLE` statements, NOT Alembic.
- **When you add an org-scoped column you MUST update BOTH** `provision_org_schema` (for new orgs) AND an Alembic migration that loops existing org schemas.

### Auth audiences

Three separate JWT audiences. Don't mix them:

| Audience | How to obtain | Roles | Endpoints |
|----------|--------------|-------|-----------|
| Owner / staff | `POST /api/v1/auth/login` | `OWNER`, `PARTNER`, `PROPERTY_MANAGER`, `SUPERVISOR` | most of `/api/v1/*` |
| Tenant portal | `POST /api/v1/tenant/auth/otp` → `/verify` | `TENANT` | `/api/v1/tenant/*` |
| Platform admin | `POST /api/platform/admin/auth/login` | `PLATFORM_ADMIN` | `/api/platform/*` |

Tokens: HS256 in dev, RS256 in prod (auto-selected by `settings.use_rs256`).

`canAccessFinancials()` = `OWNER` or `PARTNER`. Used everywhere to gate money-related views (dashboard KPIs, payment recording, expense reports).

### Money + timezone

- **All money is integer paise.** Columns end in `_paise` (e.g. `monthly_rent_paise`). Never use floats.
- **App timezone is `Asia/Kolkata`.** Fiscal/billing months use a per-property `settlement_day` with optional per-month overrides — see `app/services/billing_period.py`.

---

## 3. Live deployment

### Where things live

| | URL / path |
|---|---|
| Web app | `https://pgmanage.in` |
| API base | `https://pgmanage.in/api/v1` |
| OpenAPI | `https://pgmanage.in/api/openapi.json` (89 paths) |
| Swagger UI | `https://pgmanage.in/api/docs` (self-hosted, see commit `6856929`) |
| ReDoc | `https://pgmanage.in/api/redoc` |
| Health | `https://pgmanage.in/health` |
| WhatsApp inbound webhook | `https://pgmanage.in/api/v1/webhooks/whatsapp` |
| Website lead intake (public) | `POST https://pgmanage.in/api/v1/leads/website?token=…` |

### Prod host

- EC2: `13.126.139.161` (`ap-south-1`).
- SSH: `ubuntu@13.126.139.161` with `~/.ssh/pgmanage_prod_ed25519`.
- App code: `/opt/pgmanage/` (git checkout of `main`).
- Env file: `/etc/pgmanage/.env` (root-owned, 0600). Includes secrets — NEVER commit.
- Caddy: handles HTTPS, reverse-proxies `/api/*` and `/health` to `backend:8000`, serves static SPA from `webdist` volume.
- Containers: `pgmanage-postgres-1`, `pgmanage-redis-1`, `pgmanage-backend-1`, `pgmanage-caddy-1`, `pgmanage-web-build-1` (one-shot).

### Deploy procedure

```bash
ssh -i ~/.ssh/pgmanage_prod_ed25519 ubuntu@13.126.139.161
cd /opt/pgmanage
git fetch origin main && git reset --hard origin/main

# If migrations changed — REBUILD the migrate image FIRST (gotcha that
# bit us 3 times: stale migrate image silently skipped new migrations).
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml \
  build migrate
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml \
  run --rm migrate

# Backend
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml \
  build backend
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml \
  up -d --force-recreate backend

# Web (rebuilds SPA into the webdist volume)
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml \
  up --build web-build
```

**Always pass `--env-file /etc/pgmanage/.env`** — compose doesn't pick it up by default and the backend silently boots with empty secrets, then crashes at startup. Bit us once.

---

## 4. Backend status

### Stack

- FastAPI 0.111, async SQLAlchemy 2.0, asyncpg.
- 89 endpoints under `/api/v1/*` + `/api/platform/admin/*`.
- Background tasks for rent reminders + lead follow-ups (`app/tasks/`).
- APScheduler runs in-process when `SCHEDULER_ENABLED=true` — currently **false** in prod (flip when WhatsApp App Review clears).
- Test DB is real Postgres (`pgmanage_test`) with NullPool; tests provision real org schemas. ~270 tests, ~6 pre-existing failures unrelated to current work.

### Migrations

Current alembic head: **`018`** (per-property WhatsApp template params).

| Rev | What |
|----|-----|
| 010 | activity_log |
| 011 | rent_plans.updated_at |
| 012 | website_lead_intake |
| 013 | website_lead_notify_email |
| 014 | whatsapp_per_property |
| 015 | property_upi_and_wa_token |
| 016 | property_wa_template_overrides |
| 017 | tenants_notice_given_date |
| 018 | property_wa_template_params |

### Key services

- `app/services/notification_service.py` — WhatsApp send via Meta Cloud API v18, per-property credential resolver, BUILT_IN_VARIABLES catalogue, `_build_params()` resolver for placeholder mapping.
- `app/services/audit_service.py` — `log_event()` for every state-changing action.
- `app/services/billing_period.py` — fiscal month computation per property.
- `app/services/email_service.py` — SMTP via Brevo in prod.

### Endpoint reference

Hand-written in [`docs/API.md`](docs/API.md). OpenAPI JSON in [`docs/openapi.json`](docs/openapi.json) (re-pull with `curl -s https://pgmanage.in/api/openapi.json -o docs/openapi.json`).

---

## 5. Web app status

- Vite SPA at `/srv/web` served by Caddy.
- Vite PWA service worker: installable from Chrome on Android ("Install app") — full feature parity with the desktop site.
- Service worker `navigateFallbackDenylist` excludes `/api/*` and `/health` (otherwise the SPA shell would hijack docs URLs).
- Theme: slate-900 primary, teal-600 accent, light bg `#F8FAFC`.

Status: **feature-complete for v1**. No active development planned.

---

## 6. WhatsApp integration

### What's wired

- Per-property credentials (`phone_number_id`, `access_token`, display number, UPI VPA).
- Inbound webhook with `X-Hub-Signature-256` verification.
- Settings → WhatsApp page in the web app: per-property card + Template wizard.
- **Template wizard (commit `764ce6e`)**: 4-step flow — name + language → paste body (auto-detects `{{N}}`) → map each placeholder to a variable from the catalogue or static text → preview + save. Stored as JSONB on the property.
- `/api/v1/whatsapp/template-variables` returns the catalogue of dynamic variables per template (tenant_name, amount_rupees, month_name, due_date, upi_vpa, etc.).
- Send paths: monthly cron (`SCHEDULER_ENABLED=true`), manual test-send button, daily overdue notices.

### Current state on Meta side (as of handoff)

- **Business verification**: status "Review in progress".
- **App Review**: not yet submitted. Required for sending to numbers outside the test list.
- **WABA discovery (commit `70f07ba`)**: User has TWO WABAs. Templates approved in WABA `25725852610370900` (phones `1067890163085328` + `944374172100723`, neither verified). The phone the user registered for Cloud API (`1119147714618277`, display name "LOOP Colving PG") is in a DIFFERENT WABA — that's why test sends return `(#132001) Template name does not exist in en`. Resolution path pending: either consolidate to one WABA, or re-submit templates in the registered-phone's WABA.

### What unblocks production WhatsApp

1. Business verification completes on Meta side.
2. WABA consolidation (user task — Meta dashboard).
3. Submit `whatsapp_business_messaging` for App Review with: privacy URL, terms URL, demo video, app icon, description.
4. App goes Live → sends to any tenant phone (no test list).
5. Flip `SCHEDULER_ENABLED=true` in `/etc/pgmanage/.env` + restart backend → monthly cron starts.

---

## 7. Mobile app status

### Stack

Expo SDK 51, expo-router 3.5, React Native 0.74.5, TanStack Query v5, Zustand, axios. SecureStore for tokens. i18n-js + expo-localization (en/hi/te). expo-speech for voice guidance. Jest + jest-expo + @testing-library/react-native.

Detail: [`apps/mobile/RELEASE_STATUS.md`](./apps/mobile/RELEASE_STATUS.md).

### Features shipped

| Screen | What works |
|--------|-----------|
| **Login** | Email + password, tokens to SecureStore, auto-select first property. |
| **Home (Dashboard)** | KPI section switcher (Occupancy & dues / Rent & Payments / Profit & Loss) gated to OWNER/PARTNER. Quick actions: Take Payment, Residents, Leads, Expenses, Rooms. |
| **Residents** | List + 4-way filter (Active / Notice given / Checked-out / All) + search. Tap → detail. |
| **Resident detail** | Profile + payments history. Actions: Edit profile (full dialog), Give notice, Upload ID (Aadhar), WhatsApp deep-link, Take Payment. |
| **Take Payment** | Type chips (Rent / Advance / Daily / Deposit / Refund / Other), inline tenant search, Mode (Cash/UPI/Bank), Paid to/by, conditional Reference #, Days for daily stays, Month/Year for periodic types. Idempotent submit. WhatsApp receipt share. |
| **Rent** | Monthly ledger + status filter chips (All / Unpaid / Partial / Paid). Tap row → Take Payment pre-filled. |
| **Rooms** | Available now + Upcoming vacancies. 4-color legend (Vacant / Reserved / Occupied / Maintenance). |
| **Leads** | List + tap-to-Call + tap-to-WhatsApp. |
| **Expenses** | 3-tap quick-add (Category → Amount → Confirm) + recent list + Mine/Everyone scope toggle gated to OWNER/PARTNER. |
| **Settings (More)** | User card, property switcher, language picker (EN/HI/TE), Simple Mode toggle, Voice guidance toggle, Manage card (Leads/Expenses/Rooms), sign out. |
| **Auth glue** | Refresh-token retry on 401, SecureStore for tokens, app/index.tsx synchronous redirect (so cold start never shows the Unmatched Route screen), top-level ErrorBoundary. |

### Build pipeline

- `apps/mobile/eas.json` profiles: `development` (debug APK), `preview` (release APK for sideload), `production` (AAB for Play Store).
- One-time setup per dev: `npm i -g eas-cli && eas login && eas init`. Project id `a7540728-ea84-46a5-9f60-fa0279206ed3` is baked into `app.json`.
- Build: `eas build --platform android --profile preview`. ~15-20 min cloud queue → returns APK URL + QR.

### Tests

`npm --prefix apps/mobile test` runs 60 tests across 9 suites in ~3.7s. Covers:
- i18n (catches the dot-separator regression)
- rupees() formatting
- Auth store + RBAC matrix
- API helpers (getApiError, idempotency key)
- Payment form state machine (showDays / showMonthYear / DAILY→RENT mapping / buildPaymentBody)
- Ledger filter (filter, sum, count invariants)
- Dashboard derivations (occupied/percent/cash-in/out/net)
- Tenants-filter NOTICE → status=ACTIVE + has_notice=true
- **Index-route synchronous redirect** (the cold-start bug that shipped without coverage)

Pattern: extract pure logic from screens into `lib/*.ts` helpers; screens import the same helpers the tests exercise.

---

## 8. Decisions made (with rationale)

### Architecture

- **Per-org Postgres schema** — chose this over row-level multi-tenancy because raw-SQL ledger queries are simpler with `SET LOCAL search_path` than `WHERE org_id = ?` everywhere.
- **Money in integer paise** — never floats. `_paise` suffix on every column. Web + mobile both use `rupees(paise)` helpers.
- **JWT HS256 dev / RS256 prod** — auto-switches via `settings.use_rs256`. Keys at `/etc/pgmanage/*.key` in prod.

### Mobile

- **Expo over bare React Native** — cross-platform with one codebase, EAS handles native builds.
- **WebView shell REJECTED** — user wanted a real native app; ported every screen.
- **5 tabs is the cap** (phone bottom-bar max). Secondary screens (Leads, Expenses) live in More → Manage + Dashboard Quick actions.
- **5xx role check** — `canAccessFinancials()` gates money KPIs, Take Payment, Everyone scope on Expenses. Mirrors web RBAC.
- **`app/index.tsx`** with synchronous `<Redirect>` (not a useEffect) — cold-start launch URL `pgmanage:///` would otherwise show the Unmatched Route screen for ~1 second.
- **`navigateFallbackDenylist`** in vite-pwa — without it the SPA service worker hijacks `/api/docs` and routes to `/`.
- **`updates.enabled: false`** in mobile `app.json` — expo-updates can crash cold-start if the channel has no published manifest. Disabled for preview builds.

### Backend / WhatsApp

- **Template params as JSONB per property** (migration 018) — every Meta-approved template has different placeholders; hardcoding was breaking every user with a non-default template. Wizard lets owners map each `{{N}}` to a variable or static text.
- **0-param payload omits `components` entirely** — Meta rejects `{"type":"body","parameters":[]}` for `hello_world`. Fix in `notification_service.send_whatsapp_template`.
- **`defaultSeparator='\x1f'` in i18n-js** (mobile) — keys are flat dotted strings (`'tab.dashboard'`); the default `.` separator made every lookup nested-fail.

### Monorepo

- **npm `overrides` for `react-native@0.74.5` and `metro@~0.80.8`** at the root — Expo SDK 51 expects these; without overrides, transitive deps pull in `react-native@0.85.1` and gradle fails with `ExpoModulesCorePlugin.gradle:85 release SoftwareComponent`. Don't bump expo-related deps without re-pinning.

### Testing

- **Extract logic into pure helpers** (`lib/payment-form.ts`, `lib/ledger-filter.ts`, `lib/dashboard-derive.ts`, `lib/tenants-filter.ts`) — testable without rendering native components.
- **Screen imports the helpers** — tests exercise the live code path, not a parallel copy.
- **Jest + jest-expo + @testing-library/react-native** — minimal native mocking via `jest.setup.ts`.

---

## 9. Pending work

### High priority (unblocks revenue / pending external dependencies)

| Task | Blocked by | Owner |
|------|-----------|-------|
| Meta App Review submission | Privacy + Terms pages on web; business verification clearing | User has the assets; needs to submit on Meta side |
| WhatsApp WABA consolidation | User decision — one WABA for both templates and phone | User |
| Flip `SCHEDULER_ENABLED=true` | App Review passes | Trivial flip + backend restart |
| Mobile APK distribution to staff | User builds via `eas build --platform android --profile preview` | User runs the command (needs Expo account) |

### Medium priority (planned next session)

| Task | Notes |
|------|-------|
| **Mobile Bookings tab** | Backend has `/bookings` already. Need list screen + Add Booking screen + future-stays section + Quick action tile. Deferred from session ending 2026-06-10. |
| **iOS build** | Same Expo codebase, no code changes. Three documented paths (Simulator / Sideload / TestFlight). Apple Dev Program ($99/year) needed for device install. |
| **Mobile push notifications** | `expo-notifications` already in `app.json` plugins. Need: FCM project setup + `POST /api/v1/devices/register` endpoint + UI for opt-in. |
| **GitHub Actions deploy** | Eliminate the IP-whitelist SSH dance (bit us 6+ times in one session). Either AWS SSM or fixed-IP runner. Estimated ~30 min one-time setup. |
| **Mobile receipt upload (Expenses)** | UI placeholder exists; needs image-picker + S3 presigned PUT (existing endpoint). |
| **Privacy policy + Terms pages on web** | Static markdown pages at `pgmanage.in/privacy` + `/terms`. Required for Meta App Review and Play Store. |
| **Modal / dialog tests** | NoticeModal, EditTenantModal, RecheckinDialog — testable via @testing-library/react-native renders. |
| **ErrorBoundary fallback test** | Render with a throwing child, assert the error UI shows. |
| **Refresh-token retry interceptor test** | Mock axios responses, assert single in-flight refresh + replay. |

### Low priority (post-product-market-fit)

| Task | Why deferred |
|------|--------------|
| WhatsApp Tech Provider (Embedded Signup) | Only matters when onboarding many PG businesses; 2-6 weeks of Meta back-and-forth + 1-2 weeks of frontend. Revisit at 5+ paying customers. |
| Mobile Complaints | Backend has `/complaints` but no mobile UI designed. |
| Mobile Visitors | No backend support; needs new `visitors` table + migration. |
| Mobile Reports | Web has the dashboards; defer custom mobile reports. |
| Sentry crash reporting (mobile) | Wrap RootLayout with `sentry-expo`, set DSN via env. |
| Analytics (mobile) | PostHog / Mixpanel SDK + event taxonomy. |
| Offline write queue (mobile) | Reads cached via React Query; writes need queue + sync. |
| Self-hosted Swagger CDN replacement | We ship Swagger UI assets from the backend; works. The CSP-block issue is solved. |

---

## 10. Operational constraints / gotchas

### Deploy

1. **Migrate image must be rebuilt before running migrations.** It uses the backend image; if you skip `docker compose build migrate`, the new migration files aren't inside the container and alembic silently reports "no new migrations." Bit us 3 times.
2. **`docker compose` invocations MUST include `--env-file /etc/pgmanage/.env`.** Without it, all `${VAR}` references resolve to empty strings and the backend crashes at boot with "RS256_PRIVATE_KEY must be set in production."
3. **Caddy proxy paths**: `@api path /api/* /health /docs /openapi.json` — anything under these routes hits the backend; everything else falls through to the SPA `try_files {path} /index.html`.

### SSH access (current state)

- AWS Security Group on the EC2 has manual IP whitelisting for SSH port 22.
- Outbound IP rotates frequently for whoever's deploying — user has been adding `/32` rules per session (5+ times today).
- **Recommended fix**: GitHub Actions deploy with no SSH (use AWS SSM Session Manager). Not yet built.

### Mobile

1. **Don't bump Expo-related deps without re-pinning `react-native`.** Monorepo root `package.json` has `overrides` that lock `react-native@0.74.5` + `metro@~0.80.8`. SDK 51 needs these exact versions.
2. **Expo Go on physical iPhone can't load this app** — Expo Go ships SDK 54, our project is on SDK 51. Use the iOS Simulator on Mac, or `eas build`, for testing.
3. **`expo prebuild` regenerates the `android/` folder** — anything you put in `android/app/` not managed by Expo will be lost. Keystore + `gradle.properties` live OUTSIDE the regenerated tree.
4. **EAS Build needs the user's Expo account** — login is interactive. I cannot run `eas build` for the user; they paste the build command into their own terminal.

### WhatsApp

1. **Account is in "Review in progress"** — can only send to numbers added to the Meta Test list until App Review passes.
2. **Two WABAs in the user's Meta account** — templates and registered phone are in different WABAs; explains the `(#132001)` error. Resolution pending user action.
3. **Each `/api/v1/payments` POST needs `X-Idempotency-Key`** — mobile generates inline via `newIdempotencyKey()`; web generates a UUID per dialog open.

### Backend

1. **`SET LOCAL search_path` resets after `db.commit()`.** Never query org-scoped tables AFTER commit in the same request — they'll resolve in `public` instead and either 404 or worse, write to the wrong schema. Bit us once in `public_leads.py`.
2. **Adding an org-scoped column requires TWO edits**: `provision_org_schema` (new orgs) + an Alembic migration that loops existing schemas. Forgetting one means new orgs work and existing orgs don't, or vice versa.
3. **Test suite has 6 pre-existing failures** in `test_auth.py` and `test_expenses.py::test_expense_summary_by_category`. These pre-date the current work; not regressions. Deselect with `--deselect` when running locally.

### Mobile testing

1. **i18n.test.ts has the i18n separator regression catcher** — if a future change resets `i18n.defaultSeparator` to `.`, every label renders as `[missing "en.xxx" translation]` on the device, and this test fails first.
2. **index-route.test.tsx has the cold-start route regression catcher** — if someone deletes `app/index.tsx` or makes the redirect async, the test fails first.
3. **Don't reference module-scope imports inside `jest.mock()` factories** — Jest hoists the factory. Use `require()` inside instead.

---

## 11. Quick reference

### Local dev

```bash
# Infra
docker compose up -d postgres redis localstack

# Backend
cd apps/backend && poetry install
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload --port 8000

# Web
cd apps/web && npm run dev          # :3000

# Mobile
cd apps/mobile && npm test          # 60 unit tests
cd apps/mobile && npm run typecheck
cd apps/mobile && eas build --platform android --profile preview
```

### Test

```bash
# Backend (real Postgres needed)
cd apps/backend
poetry run pytest -q --deselect tests/test_auth.py::test_signup_creates_org_and_user \
                     --deselect tests/test_auth.py::test_login_valid_credentials \
                     --deselect tests/test_auth.py::test_login_wrong_password_returns_401 \
                     --deselect tests/test_auth.py::test_get_me_returns_profile \
                     --deselect tests/test_auth.py::test_refresh_token_returns_new_access_token \
                     --deselect tests/test_expenses.py::test_expense_summary_by_category

# Web
cd apps/web && npx tsc --noEmit

# Mobile
cd apps/mobile && npm test
```

### Useful commits (recent, traceable)

| SHA | What |
|-----|------|
| `5f39829` | Mobile 60-test safety net + extracted helpers |
| `b810cf2` | Mobile `app/index.tsx` cold-start redirect fix |
| `00d3616` | Dashboard correctness + RBAC + Take Payment refactor + Edit tenant |
| `12667d1` | i18n separator fix + Leads tab + jest setup |
| `cd02eb0` | ErrorBoundary + disable expo-updates (cold-start crash diagnosis) |
| `764ce6e` | WhatsApp template wizard (placeholder mapping per property) |
| `8f1dfe3` | EAS preview prerequisites (babel.config.js, removed dup vector-icons) |
| `2aa8299` | npm overrides for react-native + metro (SDK 51 cross-compat) |
| `540128d` | Notice-to-vacate + upcoming-vacancies pipeline UX |
| `9cec8ba` | Re-check-in for CHECKED_OUT tenants + Paid to in audit |
| `6856929` | Self-hosted Swagger + ReDoc under CSP |
| `405a6f3` | PWA service worker excludes `/api/*` and `/health` |
| `3d8c3df` | Compose passes WHATSAPP_* + SCHEDULER_ENABLED to backend |
| `c274f1f` | WhatsApp per-property settings UI + UPI VPA + APScheduler |

### People / accounts on file

- **Owner login (prod)**: `thotaadityasaikumar@outlook.com`
- **Expo account (mobile builds)**: `mastan_loop`
- **Meta business id**: `1018166251369631`
- **Meta WABAs**: `25725852610370900` (templates here) + another that holds the registered phone `1119147714618277`
- **WhatsApp display number**: `+91 81438 47542`
- **WHATSAPP_VERIFY_TOKEN**: stored in `/etc/pgmanage/.env`
- **WHATSAPP_APP_SECRET**: stored in `/etc/pgmanage/.env`

---

## 12. What I'd do if I were picking this up Monday

1. **Day 1** — Read this file, then [`CLAUDE.md`](CLAUDE.md), then [`apps/mobile/RELEASE_STATUS.md`](apps/mobile/RELEASE_STATUS.md). Spin up local dev, install the mobile APK from EAS, smoke-test against prod. Run all three test suites.
2. **Day 2** — Wire `npm --prefix apps/mobile test` into GitHub Actions on every PR. Same for backend pytest. The 60 unit tests would have caught at least 3 of the bugs we shipped this week.
3. **Week 1** — Build the GitHub Actions deploy path so SSH IP-whitelisting goes away. Two flavours to consider: AWS SSM Session Manager (no SSH at all) or a self-hosted runner inside the VPC (single fixed IP forever).
4. **Week 1 (parallel)** — Privacy policy + Terms pages on `pgmanage.in`. Required for both Meta App Review and Play Store. Hand-written boilerplate is fine; ~half a day's work.
5. **Week 2** — Submit the Meta App Review. Once it passes, flip `SCHEDULER_ENABLED=true` and the monthly rent reminders start firing for everyone.
6. **Week 3+** — Mobile Bookings tab + iOS first build + push notifications. These are the next ROI items.

That's the path that turns this from "in pilot with one customer" to "ready to onboard the next 5-10 customers."

---

_Last updated: 2026-06-10. Owner of this file: whoever is currently picking up the repo._
