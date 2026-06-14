# PGManage — Engineering Handoff

> Single source of truth for someone picking up this codebase cold. Pair this with [CLAUDE.md](./CLAUDE.md) (codebase conventions) and the project memory entries under `~/.claude/projects/-Users-mastan-pgmanage/memory/`.

**Last updated:** 2026-06-15 · commit `e53bfb7` on `main`
**Live URL:** https://pgmanage.in
**Prod host:** EC2 `13.126.139.161` (ap-south-1) · Docker Compose behind Caddy

---

## 1. TL;DR — what exists today

Four user-facing surfaces, all live on prod, all hitting the same backend:

| Surface | Path / install | Audience | Status |
|---|---|---|---|
| **Web admin** | https://pgmanage.in | PG owners / partners / supervisors | Full-featured. Dashboard, Tenants, Rent, Bookings, Expenses, Leads, Audit logs, WhatsApp settings, Menu uploads, **Tenant Inbox** (unread badge in sidebar), Website integration. |
| **Web resident portal** | https://pgmanage.in/portal/login | Residents | Full feature parity with the native resident app — sidebar nav (Home/Pay/Food/Services/More) + 18 sub-screens. Built on the same `tenantApi`. |
| **Native staff app** | Android APK via EAS | PG owners / staff on the go | Expo SDK 51, expo-router. Tenants list + detail + edit (with vehicle fields), rent, payments, bookings, expenses, leads. |
| **Native resident app** | Android APK via EAS (iOS deferred) | Residents | Expo SDK 51, expo-router. 5 bottom tabs + 11 detail screens. Same backend as web portal. Mock data fully removed — everything is live. |

Backend, web admin, web portal all redeployed automatically via the manual SSH-rebuild flow (no GitHub-Actions deploy yet — see §6 gotchas).

---

## 2. Architecture at a glance

```
apps/
  backend/          FastAPI · Python 3.12 · async SQLAlchemy 2 · Postgres 16 · Redis 7
                    Per-org Postgres schema multitenancy (see CLAUDE.md).
                    RS256 in prod, HS256 in dev. Three JWT audiences:
                      get_org_context        owner/staff
                      get_current_tenant     residents (audience=TENANT)
                      get_platform_admin     /api/platform/*

  web/              Vite + React 18 + TS · Tailwind + shadcn/ui · TanStack
                    Query v5 · Zustand · React Router. Hosts:
                      /                staff admin app
                      /portal/*        resident portal (NEW: full parity)
                      /privacy /terms  public legal pages (Meta App Review)

  mobile/           Native STAFF app (apps/mobile/). Expo SDK 51, RN 0.74.5.
                    Bundle: com.pgmanage.app. Same staff endpoints as web.

  mobile-tenant/    Native RESIDENT app. Expo SDK 51, RN 0.74.5.
                    Bundle: in.pgmanage.resident. EAS project:
                    aba700fd-fd20-4fec-9d87-d47f6dee6feb under @mastan_loop.
                    Distinct SecureStore key prefix (pgm_res.*) so both
                    native apps can coexist on one device.

packages/
  shared/           Zod schemas + TS types shared between web + mobile-staff.
                    NOTE: the new tenant-data types (apps/mobile-tenant/lib/
                    data/* and apps/web/src/lib/tenant-data/*) are
                    DUPLICATED today — pending move to packages/shared.

infrastructure/
  prod/             docker-compose.prod.yml + Caddyfile (the actual prod deploy).
  terraform/        Partial AWS infra (ECS/ECR). Not currently used for
                    prod — see deploy section.
```

### Database design

- Each organisation lives in its own Postgres schema `org_<uuid-with-underscores>`.
- `public` holds cross-org tables: `organisations`, `subscription_plans`, `platform_users`, plus the **phone-keyed identity layer** introduced in migration 019 (`public.tenant_identity` + `public.tenant_identity_links`).
- Every protected backend request runs `SET LOCAL search_path TO <org_schema>, public` via `get_org_context` (`app/core/dependencies.py`).
- Schema-wide changes go in BOTH `provision_org_schema` (for new orgs) AND an Alembic migration that loops every existing org schema. This rule has been followed for migrations 019 → 022.

### Money + time

- **All money is integer paise.** Never floats. Columns suffix `*_paise`. The mobile-tenant `<Money>` primitive + the web `formatPaise` helper are the only conversion sites.
- App timezone is `Asia/Kolkata`. Per-property `settlement_day` drives billing periods (see `app/services/billing_period.py`).

### Auth flows

**Owner/staff** — `POST /auth/login` with email+password → RS256 JWT (in prod) → silent-refresh on 401 (single in-flight promise). Web stores in localStorage; mobile staff app in SecureStore (`pgm.*`).

**Resident (native + web portal)** — phone-first OTP via `public.tenant_identity`:
1. `POST /tenant/auth/otp { phone }` → looks up identity, returns delivery info.
2. `POST /tenant/auth/verify { phone, code }` → JWT scoped to the tenant's `tenant_id` + `property_id` + `org_id`. Multi-org path exists but isn't wired (resident scope is single-property for v1).
3. **Inline-OTP mode** (`settings.TENANT_OTP_INLINE=True`, default) returns the code in the response body so the UI can prefill the input — bridge until WhatsApp App Review / SMS vendor lands.

---

## 3. What was built in this engagement

Chronological by commit, with the WHY for each. Every commit on `main` is small enough to revert independently.

| Commit | What | Why |
|---|---|---|
| `aab839a` | Outstanding KPI bug fix — per-row clamped sum vs aggregate subtraction | Aggregate `max(due - paid, 0)` masked individual shortfalls when other tenants over-paid |
| `0d57c58` | Phone-first tenant auth + `public.tenant_identity` (migration 019) | Original tenant OTP required `org_slug` + `property_id` — broken UX, multi-org tenants impossible |
| `8bf7834` | `TENANT_OTP_INLINE` setting + inline code in response | Meta App Review pending, no SMS vendor → tenant needs a way to see the code without email |
| `4271874` | Vehicle on tenants schema + KYC API + onboarding (migration 020) | Owner asked for vehicle_type + registration on every tenant. Locked decision in memory: binary type enum (NONE / TWO_WHEELER / FOUR_WHEELER), registration required when type ≠ NONE |
| `48e9438` | Post-login UX fix: Home first, KYC becomes a nudge | Forced onboarding wall before Home was bad UX |
| `e5595dc` then `a8ae19b` | Weekly menu upload (migration 021, filesystem-backed) | Original used S3 presigned URLs — prod has no AWS creds. Refactored to multipart-to-disk + 5-min token-signed serve URLs |
| `c459107` | Phases 3-10 in one cut: full resident-app rebuild | Full Stanza-quality native app — 5 bottom tabs, 11 detail screens, plus admin Inbox (migration 022) |
| `a7ec2d4` | Resident app: switch from mock to live backend + new endpoints | User reported the app was showing Aditya's fixture data for every login. Added `/tenant/me/dues/current`, `/tenant/me/payments`, plus 7 empty-array stub endpoints for features not yet built |
| `80f934e` | Fix ₹NaN on `/portal/home` | Read a field that's no longer on `/tenant/me` (lives on rent_plan via dues endpoint now) |
| `e53bfb7` | Full web /portal/* parity with the native app | Web portal was a 3-card minimal fallback; user wanted feature parity. 18 routes, sidebar nav, all on the same backend |

---

## 4. Decisions made (project memory)

These live as durable files in `~/.claude/projects/-Users-mastan-pgmanage/memory/` so future sessions reload them automatically. Listed here for the human reader:

### Resident KYC vehicle details (`project-resident-kyc-vehicle`)
- Onboarding captures `vehicle_type` (NONE / TWO_WHEELER / FOUR_WHEELER) + `vehicle_registration`.
- Locked binary type enum (no PARKING_SLOT, no MODEL — both deferred).
- Surfaces: backend schema + staff check-in form + staff edit form + resident-app KYC. Same single source.

### Resident post-login UX (`project-resident-post-login-ux`)
- After OTP, the resident app lands directly on **Home**, unconditionally.
- `kyc_complete` drives a Home **nudge card**, not a routing gate.
- Onboarding routes still exist but are reached only via the nudge or Profile → Edit.

### Notice-to-vacate policy (`project-notice-to-vacate-policy`)
- **Binary 30-day rule**: notice ≥ 30 days before move-out → refundable advance returned. < 30 days → advance forfeit (non-refundable advance is forfeit either way).
- Locked by user on 2026-06-14. Not pro-rated.
- Enforced server-side via `POST /tenant/me/notice` (records dates + emits an audit log + writes an inbox event). The actual refund accounting happens in the staff checkout flow.
- Resident UI shows a yellow warning card when the picked date is < 30 days away.

### Admin menu upload (`project-admin-menu-upload`)
- Owner uploads a weekly menu file (PDF / JPG / PNG / WEBP). Settings → Menu page.
- One file per `(property, week_start_date)` — partial unique index enforces the active-row invariant; re-upload of the same week deactivates the prior row.
- **Filesystem-backed** (not S3). Files live at `/app/uploads/{org}/menu/{menu_id}.{ext}` inside the backend container.
- Resident app/portal fetches via `GET /tenant/menu/current` which mints a 5-minute token-signed URL (`/api/v1/menu/file/{token}`) — `Linking.openURL` / `window.open` work without an auth header.

### Admin tenant inbox (`project-admin-tenant-inbox`)
- Unified feed of tenant-initiated events in the admin webapp (`/inbox`).
- Sources: new complaints, notice-to-vacate, KYC updates, feedback (future), other.
- Org-scoped `tenant_inbox_events` table (migration 022) with read_at. Sidebar nav badge with unread count polls every 30s.

---

## 5. Pending tasks (ordered by impact)

### High-impact, near-term

1. **Meta WhatsApp App Review submission.** Submission package documented at [docs/meta-whatsapp-app-review.md](docs/meta-whatsapp-app-review.md). Once cleared, flip `TENANT_OTP_INLINE=False` in `/etc/pgmanage/.env` and the inline-code banner disappears automatically; WhatsApp template delivery takes over.

2. **GitHub Actions deploy** to replace the SSH-IP-whitelist dance. Deploy workflow at [.github/workflows/deploy-prod.yml](.github/workflows/deploy-prod.yml) is **disabled** (`if: false`) pending `SSH_HOST` + `SSH_USER` + `SSH_KEY` secrets, OR a switch to AWS SSM Session Manager. The IP-whitelist friction has cost ~6 SG-rule additions in this session alone.

3. **Move `tenant-data` to `packages/shared`.** Today the same types + adapters are duplicated in `apps/mobile-tenant/lib/data/` and `apps/web/src/lib/tenant-data/`. Comments call this out. Drift risk grows with every feature.

### Medium-impact, deliberately deferred

4. **Real backends for empty-stub endpoints.** These currently return `{items: []}` on the server and empty states on the client:
   - `/tenant/me/visitors` — needs a visitor-pass table + gate-scan API.
   - `/tenant/me/referrals` + `/tenant/me/referrals/summary` — needs the full referral system (codes, share URL, stage tracking, payout to wallet).
   - `/tenant/me/notifications` — needs per-tenant notification fan-out.
   - `/tenant/me/meals/week` — needs meal preference structures beyond the PDF menu.
   - `/tenant/me/events`, `/tenant/me/residents`, `/tenant/me/partners` — community features.

5. **Structured complaints schema.** New-ticket form on web + mobile sends `title + description` concatenated as the `description` column (no `title` column on `complaints`). Add a `title` column + migrate.

6. **Real AWS S3.** Tenant ID-proof upload and expense bill-photo upload still use the s3_service helpers but **prod has empty AWS creds**. Either:
   - Configure real S3 (creates an AWS bill), OR
   - Refactor those two flows to filesystem like menu (the cleaner option).

7. **expo-image-picker in mobile-tenant.** ID-proof step is currently a stub. Either install the dep (+500 KB APK) or keep stubbed — owner currently captures ID at check-in via the staff app, so the resident-app upload is purely convenience.

### Low-impact polish

8. **iOS resident app.** Currently Android-only. Apple Developer Program ($99/yr) + Xcode work needed.
9. **Push notifications.** `expo-notifications` is in the staff app but not wired; not in mobile-tenant at all.
10. **Older `TenantHome.tsx` cleanup.** The new `/portal/home` route now points to `screens/HomeScreen.tsx`; the old `TenantHome.tsx` is unreferenced and can be deleted in a follow-up.

### Pre-existing test failures (not my work, not yours either yet)

`tests/test_auth.py` (5 failures): the signup flow now requires admin approval; these tests assert immediate sign-in. `tests/test_expenses.py::test_expense_summary_by_category` — unrelated regression. **Confirmed via `git stash` to predate every commit on this branch.** Total backend suite: ~318 passing / 6 failing.

---

## 6. Important constraints — read before touching anything

### Backend / schema

- **Per-org-schema multitenancy.** When you add a column to an org-scoped table, you MUST update:
  1. `app/models/schemas_migration.py::provision_org_schema` (for new orgs)
  2. An Alembic migration that loops every existing `org_*` schema and runs the same ALTER

  Skip either side and you'll silently break either new orgs (skip step 1) or existing orgs (skip step 2). All migrations 019-022 follow this rule.

- **search_path resets after commit.** If you commit mid-request, you need to `set_schema()` again before further org-scoped queries. The current code commits ONLY at the end of handlers to avoid this.

- **Money is integer paise.** Period. Never use floats. Use `<Money paise=...>` on mobile and `formatPaise()` on web.

- **Phone normalisation must match.** Backend's `_normalise_phone` in `tenant_portal.py` strips +91 / leading 0 / non-digits. Mobile-tenant's `lib/phone.ts` mirrors this exactly. A contract test pins it. If either drifts, OTP requests silently 'delivery: none' on inputs the user expects to work.

- **Three JWT audiences.** Don't mix dependencies. `get_org_context` rejects TENANT tokens; `get_current_tenant` rejects everything else; `get_platform_admin` is its own world.

### Deploy

- **`docker compose` invocations MUST include `--env-file /etc/pgmanage/.env`.** Without it, all `${VAR}` references resolve to empty strings and the backend crashes at boot with "RS256_PRIVATE_KEY must be set in production."

- **Migrate image must be rebuilt before running alembic.** It uses the backend image; if you skip `docker compose build migrate`, the new migration files aren't inside the container and alembic silently reports "no new migrations." Bit us 3 times during the early phases.

- **The deploy SSH dance** — see CLAUDE.md SSH section and §5 #2 above. Every fresh outbound IP needs a SG rule added before SSH works.

- **Caddy paths**: `@api path /api/* /health /docs /openapi.json` — anything under these routes hits the backend; everything else falls through to the SPA `try_files {path} /index.html`. Don't move backend endpoints outside `/api/v1` without updating Caddyfile.

- **PWA SW navigate-fallback** intentionally excludes `/api/*` and `/health` — preserved in commit `405a6f3`. If you regenerate the SW config, keep this exclusion.

### Mobile

- **expo-router needs a synchronous `<Redirect>` at `app/index.tsx`** for the root path. Without it, cold-start launches show the "Unmatched Route" sitemap for ~1s while AuthGuard's router.replace fires post-mount. Both `apps/mobile/app/index.tsx` and `apps/mobile-tenant/app/index.tsx` have this fix. Don't delete them.

- **i18n-js dotted keys.** Set `i18n.defaultSeparator = '\x1f'` so flat keys like `auth.welcome` are literal, not nested-path lookups. Without it, every label renders as `[missing "en.auth.welcome"]`. Locked in both apps' `lib/i18n.ts`.

- **react-native + metro pinned at the monorepo root.** [package.json](package.json) has `overrides` for `react-native@0.74.5` + `metro@~0.80.8` for Expo SDK 51 compatibility. Don't remove. If something tries to hoist a newer RN (e.g. a nested `@expo/vector-icons` chain), EAS Gradle bundling explodes during `:app:bundleReleaseJsAndAssets`.

- **Tokens in SecureStore, NEVER AsyncStorage.** `lib/storage.ts` in both apps. Distinct key prefixes: `pgm.*` (staff) vs `pgm_res.*` (resident) so both can be installed on one device.

- **reanimated babel plugin must be LAST in the plugin chain.** `babel.config.js` in both apps. Don't reorder.

- **`updates.enabled: false`** in both `app.json`s. Empty channel manifest crashes cold start silently. Don't enable until you've configured an OTA release channel.

### EAS builds

- `eas build --platform android --profile preview --non-interactive` from each app's directory. Both apps have their project IDs locked into `app.json`.
- **Staff app:** `pgmanage` project under @mastan_loop, projectId `a7540728-ea84-46a5-9f60-fa0279206ed3`, bundle `com.pgmanage.app`.
- **Resident app:** `pgmanage-resident` project under @mastan_loop, projectId `aba700fd-fd20-4fec-9d87-d47f6dee6feb`, bundle `in.pgmanage.resident`.
- Preview profile is the right one for sideload APKs. Production builds AAB for Play Store.

### Tests

```bash
cd apps/backend && poetry run pytest                # backend (~318 pass, 6 pre-existing fail)
cd apps/mobile-tenant && npx jest                   # resident-app (49/49)
cd apps/mobile && npx jest                          # staff-app (63 tests)
cd apps/web && npx tsc --noEmit                     # web type-only check
```

Backend tests use a real `pgmanage_test` Postgres DB with NullPool. Rate limiting is disabled in tests via `settings.RATE_LIMIT_PER_MINUTE = 99999` but the `/tenant/auth/*` strict limit of 5/min still applies — flush Redis if a test hits it.

---

## 7. Quick reference

### Where things are

| Looking for | Path |
|---|---|
| Org schemas | `app/models/schemas_migration.py::provision_org_schema` |
| Auth middleware order | `app/main.py` (outermost first: RequestID → RequestLogging → RateLimit → CORS → TrustedHost) |
| All tenant endpoints | `app/api/v1/tenant_portal.py` + `app/api/v1/menu.py` (tenant menu fetch) |
| Admin Inbox endpoints | `app/api/v1/inbox.py` + `app/services/inbox_service.py` (write helper) |
| Native staff app | `apps/mobile/app/*` (tabs at `apps/mobile/app/tabs/*`) |
| Native resident app | `apps/mobile-tenant/app/*` (tabs at `apps/mobile-tenant/app/home/*`) |
| Resident app UI kit | `apps/mobile-tenant/components/ui/` + `apps/mobile-tenant/lib/theme/` |
| Web admin sidebar nav | `apps/web/src/app/Layout.tsx::NAV_ITEMS` |
| Web resident portal routing | `apps/web/src/pages/tenant-portal/TenantPortalApp.tsx` |
| Web resident portal screens | `apps/web/src/pages/tenant-portal/screens/*` |

### Live endpoints surface

```
/api/v1/auth/*                    staff login + refresh + me
/api/v1/properties /tenants /rent /payments /bookings /expenses /leads
/api/v1/announcements /complaints /dashboard /audit-logs /webhooks
/api/v1/tenant/auth/{otp,verify,select-org}        resident OTP
/api/v1/tenant/me                                  profile
/api/v1/tenant/me/{kyc,notice}                     mutations
/api/v1/tenant/me/{dues/current,payments}          rent
/api/v1/tenant/me/{visitors,referrals,referrals/summary,notifications,
                   meals/week,events,residents,partners}   stubs (return [])
/api/v1/tenant/ledger /complaints /announcements   existing tenant reads
/api/v1/tenant/menu/current                        token-URL for menu file
/api/v1/menu/{upload, list, {id}/file-url, {id}}   owner menu management
/api/v1/menu/file/{token}                          public token-signed serve
/api/v1/inbox /inbox/unread-count
/api/v1/inbox/{id}/read /inbox/mark-all-read       admin inbox
/api/platform/*                                    platform-admin (separate audience)
```

### Local dev

```bash
docker compose up -d postgres redis localstack
cd apps/backend && poetry install && poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload --port 8000
cd apps/web && npm run dev                                # :3000
cd apps/mobile && npm start                               # Expo
cd apps/mobile-tenant && npm start                        # Expo
```

### Prod deploy

```bash
# 1. Add your current IP to the EC2 security group (the friction you cannot escape until §5 #2 is done)
# 2.
ssh -i ~/.ssh/pgmanage_prod_ed25519 ubuntu@13.126.139.161
cd /opt/pgmanage
git pull --ff-only

# Migration (if any new alembic file)
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml build migrate
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml run --rm migrate

# Backend
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml build backend
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml up -d --force-recreate backend

# Web bundle
sudo docker compose --env-file /etc/pgmanage/.env -f docker-compose.prod.yml up --build web-build
```

### Building APKs

```bash
# Staff app
cd apps/mobile && eas build --platform android --profile preview --non-interactive

# Resident app
cd apps/mobile-tenant && eas build --platform android --profile preview --non-interactive
```

Each finishes with a URL of the form `https://expo.dev/accounts/mastan_loop/projects/<project>/builds/<id>`. Open on Android, install (allow "unknown sources" once), done.

---

## 8. Closing notes for a new engineer

- **The native resident app and web portal are functionally identical.** Same backend, same data shapes, same screens, same UX. Two presentations. Don't change one without considering the other.
- **The Inbox is now your friend.** Owners get every tenant-initiated event in one place — when adding a new tenant-side flow, write to it via `app/services/inbox_service.py::record_event`. The existing complaints + KYC + notice flows model the pattern.
- **Project memory is real.** Future Claude sessions auto-load the entries in `~/.claude/projects/-Users-mastan-pgmanage/memory/`. Add a new memory file (and link it in `MEMORY.md`) whenever you make a load-bearing decision — gives the next session the same priors.
- **Trust integer paise everywhere.** A floats bug in money would be visible to every tenant.
- **The prod machine has a manifest of its own.** `/etc/pgmanage/.env` holds every secret. Read-only via SSH. Never commit it. If you reset the EC2, you reset the secrets — back up before you do.
