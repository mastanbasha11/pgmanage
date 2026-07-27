# PGManage — Handoff

_Last updated: 2026-07-28 · `main` @ `131cea9` (deployed)_

Multi-tenant SaaS for Paying-Guest / hostel owners in India. Owners manage
properties, beds, tenants, rent, expenses, bookings and leads; residents get a
self-service portal (web + mobile). Turborepo: `apps/backend` (FastAPI),
`apps/web` (React/Vite — owner app **and** resident portal), `apps/mobile`
(Expo — staff app **and** resident app), `apps/website` (Astro marketing site,
**in progress**), `packages/shared`, `infrastructure/prod`.

---

## 1. Current project state

### Domains (production)
Three hostnames, one backend + SPA (Caddy `infrastructure/prod/Caddyfile`, 3-host config):
- **`pgmanage.in`** → marketing site (Astro, `apps/website`) — **owner is actively building this**.
- **`app.pgmanage.in`** → owner / manager app (the React SPA).
- **`my.pgmanage.in`** → resident portal (same SPA, lands on `/portal`).

Prod host `ubuntu@13.126.139.161`, repo at `/opt/pgmanage`, behind Caddy.

### Web (`apps/web`)
- **Owner app** — dashboards default to the **current fiscal month** (settlement-aware: rolls to next month once a property's close day passes; honours `billing_periods` overrides; IST). Leads is a **priority worklist** (list/board/split, saved views, live CSV export, bulk WhatsApp, "Added" date filter, newest-first default, auto-close of leads idle 30+ days). Payments/settings/rent/bookings/expenses revamped earlier.
- **UI polish pass (`131cea9`):** every emoji "icon" replaced with **lucide** line icons (dashboard/expenses/leads/payments); dashboard charts trimmed to a **3-colour palette** (teal · slate · amber — money-in one green family, money-out red-amber); auth pages moved to semantic tokens (login now matches the app); Add-Property dialog label spacing fixed (focus ring no longer collides with the label). **Occupancy grid** redesigned: adaptive columns (**≤8 rooms → one row, else 5/row**), colours **occupied=green / vacant=orange / held-blocked=light-blue**, and an **"Upcoming month" toggle** that dashes occupied beds with a move-out date on the books (disabled until any tenant has a vacate date). See `components/occupancy-grid/OccupancyGrid.tsx`.
- **Resident portal** (`pages/tenant-portal/**`) — repainted to **Forest & Sage** via a *scoped* theme (`.tenant-forest`, see constraints) so the owner app is untouched. **Home is restructured** to the two-column `pgmanageresidentweb` reference (forest rent-anchor card, quick actions, open requests, notice + a room / food / deposit / Wi-Fi sidebar). **Other portal screens are recoloured but NOT yet restructured** — see Pending.
- Online payments (Razorpay) shipped: owners connect their own account under Settings → Payments; residents pay rent/advance/deposit; webhook is source of truth.

### Demo portal (`scripts/seed_demo.py`)
- Self-contained **"Greenview Coliving"** demo org for showcasing both apps — rich, fictional data (**no real LOOP data**): 4 staff, ~21 beds, 16 tenants (first two phones `+919000000001/2` for resident login), 3 months of ledger + payments, expenses, 12 leads, complaints, announcements, bookings, a property team (2 owners 60/40 + capital, manager, collector) and ROI fields. `settlement_day=28` so dashboards land on a full current month. Login `demo@pgmanage.in` / `DemoView@2026`. Idempotent — drops+rebuilds only the demo org. Run: `PYTHONPATH=. poetry run python scripts/seed_demo.py` (local) or `docker cp` + `exec -T -w /app backend python seed_demo.py` (prod).

### Mobile (`apps/mobile`)
- **Staff app** — repainted to Forest & Sage (token remap; Ionicons, not the mock SVGs).
- **Resident app** — **fully built** to `looptenantcalm` (was dead scaffolding): bottom tabs **Home / Pay / Stay / Food / More**, plus **Get Help** (raises a real complaint), **My Requests** (list + timeline), **Move-out** (refund estimate + `/me/notice`). **In-app Razorpay checkout via a WebView modal** (Expo-friendly, no bare native module; webhook still records). OTP login kept as-is. Data layer ported from the web portal (`lib/tenant/*`). Money + every numeric adapter are **NaN-proofed**.
- **Latest build:** Android **preview APK** from `2d3326d` — https://expo.dev/artifacts/eas/32Vv_PtmUozEsADnJvi_7MDIedkdYk3ewmAgzJnrPFQ.apk (installable, points at prod API).

### Tests / gates
- Backend: `poetry run pytest` — green except **6 pre-existing failures** (5 auth, 1 expenses) that also fail on clean `main`.
- Mobile: `npx tsc --noEmit` clean; `npx jest` **94 passing** (incl. tenant money/adapter NaN tests + 7-screen render smoke tests).
- Web: `npx tsc --noEmit` clean, `npm run build` succeeds. **No web test runner / ESLint** exists — `tsc` + `build` are the gates.

---

## 2. Decisions made (with rationale)

- **One "Forest & Sage" design system for both resident apps** (web + mobile), from `looptokens`: forest `#1C443A` is the only chrome colour, sage `#F4F7F5` surfaces, white cards on hairline borders (not shadows), **green reserved for money**, **apricot for "needs attention"**, low-chroma status colours so a busy screen still reads calm.
- **Web portal repaint is a *scoped* theme, not a global change.** A `.tenant-forest` class on the portal root overrides the shadcn HSL vars + remaps the ~75 literal palette classes the screens use — all scoped, so the **owner app keeps its slate/teal palette**. Re-skinned everything with near-zero markup churn.
- **Mobile keeps Ionicons** (an established line-icon family) rather than copying the mock's raw SVGs — satisfies "unique, not AI-generated, don't use these exact icons".
- **In-app payment = WebView + Razorpay checkout.js**, not `react-native-razorpay`. Avoids a bare native module / config-plugin, works in EAS builds and Expo Go. The **webhook remains the source of truth**, so a closed modal still records the payment.
- **Per-owner Razorpay** (money flows tenant→owner; platform never holds funds → no RBI PA licence). Exactly-once via `idempotency_key = rzp_<payment_id>`.
- **Dashboards default to the fiscal month** (`GET /billing/current-period`), not the calendar month.
- **Whoever adds a lead owns it**; leads idle 30+ days auto-close to LOST with a flagged `lost_reason`.
- **Money is integer paise everywhere**; UI formatters + adapters coerce non-finite input to 0 (kills the ₹NaN class of bug).

---

## 3. Pending tasks / backlog

### Web resident portal (highest priority for the resident launch)
- **Restructure the remaining portal screens to the reference** — only **Home** is done. Pay / My stay / Food / Services (requests) / Notices / Profile / Refer are *recoloured* but still the old simpler layout. Same pattern as Home (two-column, cards, forest anchor).
- **Topbar** from the reference (sticky search + "Rent due · Pay" chip + notifications + profile) isn't built — the desktop layout has no topbar yet; Home has header action buttons instead.
- Structured **Today's menu** on Home is a link, not per-slot items (backend meals is a stub; only a menu image/PDF upload exists).

### Mobile
- **Real device test of the in-app Razorpay checkout** (order → pay with a test key → shows in history) — the one thing that needs a device.
- **iOS** build: `preview` is simulator-only; use `production` (needs Apple Developer credentials — run interactively). **Android `production` app-bundle** can be built anytime (uses existing keystore).
- Move-out full timeline / requests photo upload; push notifications; iOS build config.

### Backend / tenant
- **Real OTP delivery (WhatsApp/SMS)** — currently email + inline dev code. Blocks tenant onboarding at scale.
- Refunds from the portal; multi-org resident door on web.

### Platform / CI
- 6 pre-existing backend test failures; no ESLint in web/mobile; wire GH Actions deploy secrets (removes the SSH IP-whitelist dance).

---

## 4. Important constraints (read before touching prod / the data layer)

### Deploy — prod has UNCOMMITTED infra changes; do not clobber them
- **`infrastructure/prod/Caddyfile` and `docker-compose.prod.yml` are modified in the prod working tree** (the 3-subdomain Caddy config + a `/opt/marketing/dist:/srv/marketing` volume for the marketing site). A plain `git pull` **aborts**. To deploy an `apps/web`/`apps/backend` change: `git stash push <those two files>` → `git pull --ff-only` → `git stash pop` (safe because app commits don't touch them), then rebuild. **Never force-checkout those files.**
- **Always** deploy with `sudo docker compose -f docker-compose.prod.yml --env-file /etc/pgmanage/.env <cmd>` (env file is root-owned at `/etc/pgmanage/.env`; omitting it recreates containers with blank env → backend down).
- **Web deploy:** `up -d --build web-build` (rebuilds the SPA into the volume Caddy serves; does NOT touch Caddy, so it's safe re: the subdomain config). Users need a hard refresh (PWA caches the old bundle).
- **Caddyfile is bind-mounted** — a config change needs `… restart caddy`. Don't recreate `caddy` casually: the compose adds a `/opt/marketing/dist` mount that must exist or the container fails to start.
- **Migrations:** `… --profile migrate run --build --rm migrate` — the **`--build` is required** (cached image otherwise misses new migrations).
- Prod host `13.126.139.161`, key `~/.ssh/pgmanage_prod_ed25519`. **The sandbox's outbound IP rotates and must be whitelisted (port 22) each session** — check `curl api.ipify.org` and ask the owner to add the `/32`.
- The local dev branch is often **`feat/marketing-website`**, not `main`. Push app commits with `git push origin HEAD:main`.

### Resident-portal theme
- The Forest & Sage repaint lives entirely under **`.tenant-forest`** (in `apps/web/src/index.css`, applied to the portal layout + login roots). It overrides shadcn HSL vars **and** remaps literal Tailwind palette classes (emerald/amber/rose/violet/…). Adding a new hardcoded palette class in a portal screen that isn't in that remap block will render in the wrong colour — prefer semantic classes (`bg-primary`, `text-muted-foreground`, `text-accent`) or add the class to the remap block.

### Data model / money
- **Per-org Postgres schema multi-tenancy** (`org_<uuid>`). Adding a column to an org-scoped table means updating BOTH `provision_org_schema` AND an Alembic migration looping schemas; public tables also need the hand-maintained DDL in `tests/conftest.py`.
- **Money is integer paise** (`*_paise`); never floats. UI + adapters coerce non-finite → 0.
- **Fiscal/billing months** use a per-property `settlement_day` + `billing_periods` overrides. Cash-flow KPIs attribute by fiscal window (`collected_at`).

### Frontend ↔ backend contract drift
- Hand-written client types/params are assertions, not contracts. FastAPI silently drops undeclared query params; `total` from list endpoints is `len(items)` for the page, not a table count. Read the router before trusting a hook. The **web and mobile tenant data layers are twins** (`apps/web/src/lib/tenant-data/*` ↔ `apps/mobile/lib/tenant/*`) — keep them in sync.

### Auth / integrations
- JWT via `python-jose`, **HS256 dev / RS256 prod**. Three audiences: `get_org_context` (owner/staff), `get_current_tenant` (portal), `get_platform_admin`.
- **Razorpay** webhook (`/api/v1/webhooks/razorpay?org=<slug>`) is HMAC-verified and auth-exempt by design; it's the source of truth. Web CSP (in the Caddyfile) must allow `checkout.razorpay.com` / `api.razorpay.com` / `*.razorpay.com`. The mobile in-app checkout uses a WebView (no CSP restriction there).

### Frontend stack (locked)
- Web: shadcn/ui only, React Hook Form + Zod, TanStack Query v5, Zustand, Recharts. Mobile: Expo Router, TanStack Query, Ionicons, react-native-svg, react-native-webview (added for the payment checkout).

---

## 5. Key files (orientation)

| Area | Files |
|---|---|
| Resident portal (web) | `pages/tenant-portal/**` (Home restructured: `screens/HomeScreen.tsx`), theme in `index.css` (`.tenant-forest`), data `lib/tenant-data/{hooks,adapters,types}.ts` |
| Resident app (mobile) | `app/tenant-portal/(tabs)/*` + `help/moveout/requests`, `components/tenant-ui.tsx`, `components/RazorpayCheckout.tsx`, data `lib/tenant/{hooks,adapters,types,money}.ts` |
| Design tokens | mobile `lib/theme.ts` (Forest & Sage); web scoped theme in `index.css` |
| Payments (backend) | `app/services/{razorpay_gateway,online_payment}.py`, `app/api/v1/{tenant_portal,payments,webhooks}.py`, migration `alembic/versions/037_*` |
| Fiscal month | `app/services/billing_period.py`, `GET /billing/current-period` in `app/api/v1/properties.py`, web `hooks/useFiscalMonth.ts` |
| Deploy | `docker-compose.prod.yml`, `infrastructure/prod/Caddyfile` (3-host; **modified on prod**) |
