# Tenant App — Build Plan & Spec Review

> **Surface clarification (2026-06-12, post-spec):** "tenant app" =
> native Android + iOS application, NOT the existing `/portal/*` web pages.
> All UX, sequencing, and architecture decisions below assume mobile-first
> native build. The existing web `/portal/*` becomes a thin web fallback,
> not the primary surface.
>
> Response to the build spec dated 2026-06-12. Goal: ship a world-class tenant
> app without over-scoping the first cut. Plan first, code after sign-off.

---

## 1. Executive summary

The spec is solid in intent and largely right on what to build long-term. Three
things I'm pushing back on before we start:

1. **Sequencing is upside-down.** The spec puts new-tenant onboarding first (a
   ~10-day workstream) and existing-tenant features last (a ~3-day workstream).
   The Loop PG has 97 active tenants TODAY who can't use the portal. Flipping
   the order ships value in week 1.
2. **Public properties directory is out of scope for v1.** The spec hedges on
   this; I'd cut it entirely. Owner-invite-link onboarding is how PGs actually
   work — discovery is a different product (Phase 1 #1 marketing layer).
3. **OTP delivery is blocked on Meta App Review.** WhatsApp account is still
   "Review in progress" — we can't actually send OTPs to arbitrary phones
   until that clears. v1 needs a non-WhatsApp fallback path (email magic link
   or owner-issued one-time codes) or we're shipping a broken login.

After those changes, I'd split the work into three phases:

| Phase | Scope | Effort | Ships |
|------|-------|-------|------|
| **V1 — Existing tenants** | OTP login (existing tenants only), dashboard, payments, complaints with thread, announcements, menu, house rules, notice-to-vacate | ~5 days | Week 1 |
| **V2 — New tenants** | Invite-link join, bed selection, multi-section onboarding, owner approval inbox, agreement signature | ~7 days | Week 2-3 |
| **V3 — Engagement** | Feedback + Google review nudge, referrals, document vault, push/WhatsApp preferences | ~5 days | Week 4+ |

The rest of this doc covers v1 in detail, sketches v2, defers v3 to a separate
plan once v1+v2 ship.

---

## 1.5 Architecture decision — separate Expo app

Now that the target is native Android + iOS, three options for where the
tenant app lives in the monorepo:

| Option | Layout | Pros | Cons |
|--------|--------|------|------|
| **A. Combined codebase** — route-gate by JWT role | `apps/mobile/app/(staff)/...` and `apps/mobile/app/(tenant)/...` in the existing project | One repo, one test suite, trivial lib sharing | Same APK/IPA for both audiences. "PGManage" name + icon is ambiguous (staff vs tenant). Bundle bloat. Different release cadences cause friction. App-store ASO mismatched (tenant searches != owner searches). |
| **B. Separate Expo project** — `apps/mobile-tenant/` | New Expo app, separate `app.json`, separate `eas.json`, separate bundle id `in.pgmanage.tenant`. Lib code copied initially; extract to `packages/mobile-shared/` once both apps are live. | Clean App Store / Play Store listing per audience. Tenant icon + name ("PGManage Resident" or similar). Smaller bundle per app. Independent release cadence. Staff app keeps shipping unaffected. | One-time scaffolding cost (~half a day). Two EAS projects to babysit. Some library duplication until extraction. |
| **C. Flavored builds** — same codebase, env-driven entry point | `EXPO_PUBLIC_APP_FLAVOR=staff\|tenant` in `eas.json` profiles; different `app.json` per flavor | One codebase. | expo-router is file-system-based; tree-shaking won't drop unused routes. Bundle stays ~bloated. Build matrix complexity. |

**Recommendation: B.** Separate Expo project at `apps/mobile-tenant/`. The
audiences are mutually exclusive (a person is either staff or tenant, basically
never both at one PG), the brand should be different, and the App Store
listing copy is different. The half-day of scaffolding pays off the first
time we ship a staff-only fix and don't have to coordinate releases.

### What gets copied vs shared

Initial scaffold (day 1) — copy these into `apps/mobile-tenant/`:

| Module | Action |
|--------|--------|
| `lib/theme.ts` | Copy. Same brand for both apps; if it ever diverges we'll fork. |
| `lib/api.ts` | Copy + adapt — base URL same (`/api/v1`), token storage same, but the tenant client uses the tenant audience (`/tenant/*` paths) plus the new identity-level endpoints. |
| `lib/storage.ts` | Copy as-is. Tenant tokens go to SecureStore exactly like staff tokens. |
| `lib/i18n.ts` | Copy + new tenant-specific dictionary keys (`res.*` keys aren't needed; new `dash.tenant.*` etc.). en/hi/te from day 1. |
| `lib/voice.ts` | Copy. Optional voice-guidance carries over for accessibility. |
| `components/ui.tsx` | Copy. Same Screen / Card / Button / Field / KpiCard primitives — visual consistency across the two apps is nice. |
| `lib/store.ts` | Fork. Tenant store has different shape (no `selectedPropertyId`, no `canAccessFinancials()`; instead has `activeOrgLink` for the multi-org case). |
| `app/*` | Fresh. No staff routes carry over. The existing `apps/mobile/app/tenant-portal/index.tsx` (203 lines, stub from earlier) gets deleted — not worth porting. |
| `package.json` deps | Same baseline + `expo-image-picker` (ID upload), `expo-print` (receipt PDFs locally if we want), `expo-document-picker` (if we add doc upload). |
| `eas.json`, `app.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json` | Fresh per app — different bundle id, icon, name, project id. |

### Extraction milestone

After v1 ships (~1 week post-launch), extract the genuinely-shared modules
to a workspace package:

```
packages/
  mobile-shared/    # NEW
    theme.ts
    storage.ts
    api-base.ts     # shared interceptors / refresh logic
    ui.tsx          # design-system primitives
    i18n-base.ts    # base dictionary; each app extends with its own keys
```

Both apps depend on `@pgmanage/mobile-shared` via workspace protocol. Don't
do this BEFORE shipping v1 — it's a refactor that adds risk without
shipping value.

### App identity

| | Staff app (existing) | Tenant app (new) |
|---|---------------------|-----------------|
| Bundle id (Android) | `com.pgmanage.app` | `in.pgmanage.resident` |
| Bundle id (iOS) | `com.pgmanage.app` | `in.pgmanage.resident` |
| Name | PGManage | PGManage Resident (or MyPG — owner picks) |
| Icon | Brand teal P (existing) | Different glyph — needs designer or quick variant |
| Splash bg | Slate-900 | Teal-600 (lighter, friendlier — tenant audience) |
| Play Store category | Business | House & Home |
| Target audience copy | "For PG owners and managers" | "For PG residents — see rent, raise complaints, pay online" |

Open question — answered in §6 below — what should the tenant app actually
be called? "PGManage Resident" / "MyPG" / "Loop" (white-labelled?).

---

## 2. Critical review of the spec

### What I agree with (don't touch)

- **Phone + OTP as the only credential.** Tenants don't want passwords. Right call.
- **Action-oriented home dashboard** (Section 3) — much better than a static menu. Card-stack ordered by urgency is the right pattern.
- **`complaint_updates` thread sub-table.** Status-only complaints are useless; threads are the standard.
- **Receipt PDF download for payment history.** Real need (visa applications, reimbursements). We already have `reportlab` as a backend dep.
- **Tenant-confirms-resolution on complaints.** Adds friction in the right direction — stops staff from gaming "resolved" counts.
- **Roommate visibility with opt-in toggle.** Genuinely useful, low cost.
- **House rules / WiFi password page.** Single biggest reduction in owner support load. Build this.

### What I'd refine (changes, not removals)

#### 2.1 Multi-org phone collision — keep the idea, change the data model

Spec says: "a lookup table in `public` schema mapping phone → list of (org_schema, tenant_id/request_id)". Right idea, but I'd structure it as two tables:

```sql
public.tenant_identity (
  id              UUID PRIMARY KEY,
  phone           VARCHAR(20) UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

public.tenant_identity_links (
  identity_id     UUID NOT NULL REFERENCES public.tenant_identity(id),
  org_id          UUID NOT NULL,
  schema_name     VARCHAR(100) NOT NULL,
  tenant_id       UUID NULL,        -- set when ACTIVE
  request_id      UUID NULL,        -- set when PENDING
  status          VARCHAR(20) NOT NULL,  -- PENDING/ACTIVE/ARCHIVED
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identity_id, org_id)
);
```

Why two tables: a tenant who's moved between PGs over time has multiple
`identity_links` rows (one per org). When they log in, we show a selector if
they have >1 ACTIVE link. The single-row-per-phone of v1 wouldn't survive a
real "tenant moved from PG A to PG B" scenario.

Login flow:
1. Tenant enters phone → `SELECT FROM tenant_identity WHERE phone = ?`.
2. If found: send OTP. On verify: list ACTIVE links → if 1, log in straight; if 0 ACTIVE + 1 PENDING, show pending screen; if >1, show org-picker.
3. If not found: prompt for invite link or property code.

#### 2.2 Bed reservation during pending request — use a partial unique index, not a new table

Spec: "Bed referenced in a PENDING request should show as RESERVED". I'd
implement this with a simpler constraint on `tenant_join_requests`:

```sql
CREATE UNIQUE INDEX tenant_join_requests_one_pending_per_bed
  ON tenant_join_requests(bed_id)
  WHERE status = 'PENDING';
```

The floor-grid view query unions OCCUPIED beds with bed_ids that have a PENDING
request and renders them as RESERVED. No new `bed_holds` table needed.

On APPROVE → set `beds.status='OCCUPIED'`; on REJECT/CANCEL → no DB change to
beds (the join_request row's status flip is enough — the index reclaims the bed
automatically).

#### 2.3 Onboarding form — gate at the right cutoffs

The spec lists 6 sections (A-F) with everything required for police verification.
Realistic gating:

| Cutoff | What must be filled |
|--------|---------------------|
| **Submit join request** | Phone (verified), full name, permanent address, ID type + number, ID front photo. ~5 fields. Tenant can submit in 2 minutes. |
| **Owner can approve** | Above + emergency contact (name+phone+relation) + selfie. Owner can still approve incomplete profiles at their discretion. |
| **Active tenant — full functionality** | Above + agreement accepted + vehicle (if any) + native place. Nudges in pending-actions dashboard but never blocks. |

Why: tenants submitting from a phone won't fill 6 sections in one go. If the
gate is high, they bounce.

#### 2.4 Agreement signature — skip the OTP re-verification

Spec: "type your name + OTP re-verification". Tenant is already JWT-authenticated
via OTP — re-OTPing adds 30 seconds of friction for no security benefit. Just:

```
[ ] I have read and agree to the rental terms above.
                                          [Accept and continue]
```

Log timestamp + IP + user-agent on the row. Same legal weight as the spec
proposes; less drop-off.

#### 2.5 Feedback → review nudge — skip the auto-complaint conversion

Spec: "If rating ≤ 3 ... optionally prompt tenant 'Would you like to raise this
as a complaint instead?'". Over-engineered. Simpler:

- Rating ≥ 4: show Google review link (when GBP integration ships).
- Rating ≤ 3: thank them, surface to owner internally. Don't push them to
  raise a complaint — that's the owner's job to follow up on personally.

The auto-complaint flow has a sharp edge: a tenant rating "3" on cleanliness
might not actually want a complaint, but the prompt makes them feel like they
should. Trust owners to do their job.

### What I'd cut from v1 (defer or drop)

- **Public properties directory** — Phase 1 marketing layer, not portal.
- **Food preferences / skip-meal per tenant** — spec already marks as future. Confirmed deferred.
- **DigiLocker e-sign** — spec already marks as deferred. Confirmed.
- **Police verification PDF generation** — not in spec, but implied. Defer. We collect the data; PDF generation comes later.
- **Referral program** — captures the data point in v1 (`referred_by_tenant_id` on the join request) but no reward automation. Owner sees the source in the admin inbox.

### What's missing from the spec

These need decisions:

| Missing piece | What I'd do |
|--------------|-------------|
| **OTP delivery fallback** | WhatsApp OTP is blocked on App Review. v1 fallback: 6-digit code emailed to a tenant email IF provided on join, plus owner-issued one-time codes for staff to manually onboard. SMS path deferred — needs paid gateway account (Twilio/MSG91). |
| **Language support** | Tenants are largely vernacular. Re-use the mobile-app `i18n-js` pattern: en/hi/te. Tenant picks language at first login; stored in `tenant_identity.preferred_lang`. |
| **PWA installability** | Portal should be installable from Chrome ("Add to Home Screen"). Reuse the existing vite-pwa config. Tenant uses portal like a native app. |
| **Tenant JWT lifetime** | Default refresh-token rotation (7d access / 30d refresh) is fine. Skip biometric for v1. |
| **What if tenant has no email AND no WhatsApp?** | Owner-issued code path covers it. Spec doesn't address this — it's common in India. |

---

## 3. V1 design — existing tenants (ship in week 1)

### 3.1 Scope

Tenants who ALREADY have a `tenants` row in their org schema (created by the
owner via check-in or bulk import). Most of The Loop's 97 tenants.

For these tenants, the portal needs:

- **Login**: phone + OTP. Owner pre-registers their email during check-in, OTP
  goes to email (until WhatsApp is unblocked).
- **Home dashboard**: rent-due card, pending complaints, latest announcements,
  notice status if given.
- **Payments**: list, filter, downloadable PDF receipts, monthly ledger.
- **Complaints**: raise with photos, see status thread, confirm resolution.
- **Announcements**: list view, mark-as-read.
- **Static info**: WiFi password, house rules, manager contact (per-property,
  owner-configured).
- **Menu**: read-only weekly grid.
- **Notice to vacate**: tenant-initiated, fills the existing `expected_move_out_date`
  field, notifies owner.
- **Profile** (read-only for now): own info, uploaded ID, emergency contact.

### 3.2 Data model — v1 additions

```sql
-- public schema
public.tenant_identity (
  id              UUID PK,
  phone           VARCHAR(20) UNIQUE,
  email           VARCHAR(255),
  preferred_lang  VARCHAR(5) DEFAULT 'en',
  created_at      TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ
);

public.tenant_identity_links (
  identity_id     UUID,
  org_id          UUID,
  schema_name     VARCHAR(100),
  tenant_id       UUID NULL,
  request_id      UUID NULL,
  status          VARCHAR(20),
  PRIMARY KEY (identity_id, org_id)
);

-- per-org schemas
{schema}.complaint_updates (
  id              UUID PK,
  complaint_id    UUID FK,
  actor_user_id   UUID NULL,       -- staff user id
  actor_tenant_id UUID NULL,       -- tenant id (CHECK exactly one of the two is set)
  note            TEXT,
  status_change   VARCHAR(20) NULL,
  created_at      TIMESTAMPTZ
);

{schema}.food_menu (
  id              UUID PK,
  property_id     UUID FK,
  day_of_week     SMALLINT,        -- 0=Mon ... 6=Sun
  meal_slot       VARCHAR(20),     -- BREAKFAST/LUNCH/DINNER/SNACK
  items           TEXT,
  updated_at      TIMESTAMPTZ,
  UNIQUE (property_id, day_of_week, meal_slot)
);

{schema}.property_info (
  property_id     UUID PK,         -- 1:1 with properties
  wifi_ssid       VARCHAR(100),
  wifi_password   VARCHAR(100),
  house_rules     TEXT,            -- markdown allowed
  manager_name    VARCHAR(100),
  manager_phone   VARCHAR(20),
  updated_at      TIMESTAMPTZ
);

-- Backfill: when a new tenant is created, INSERT into public.tenant_identity
-- (or upsert by phone) + INSERT into public.tenant_identity_links.
-- Run a one-shot migration that backfills existing tenants → identity table.
```

### 3.3 API surface — v1

All under `/api/v1/tenant/*`, tenant JWT required (except auth endpoints).

```
# Auth
POST /tenant/auth/otp/request           { phone, channel?: 'email'|'whatsapp' }
POST /tenant/auth/otp/verify            { phone, code } → { token, org_picker?: [{org_id, name}], pending_request_id? }
POST /tenant/auth/otp/select-org        { org_id } → { token }              # when multiple orgs
POST /tenant/auth/refresh               { refresh_token } → { token }
POST /tenant/auth/logout

# Profile / dashboard
GET  /tenant/me                          → { profile, active_rent_plan, last_ledger_entry, … }
GET  /tenant/dashboard                   → { rent_due, open_complaints_count, unread_announcements, notice }
PATCH /tenant/me/lang                    { lang }

# Payments
GET  /tenant/payments                    ?from=…&to=…&type=…&page=…
GET  /tenant/payments/{id}               → detail
GET  /tenant/payments/{id}/receipt       → PDF (reportlab)
GET  /tenant/statement?from=…&to=…       → full PDF statement

# Ledger
GET  /tenant/ledger                      ?month=…&year=…    # existing; tenant-scoped
GET  /tenant/ledger/range?from=…&to=…    → month-by-month view

# Complaints
GET  /tenant/complaints                                      # existing
POST /tenant/complaints                                      # existing
GET  /tenant/complaints/{id}             → with updates[]
POST /tenant/complaints/{id}/updates     { note, photos? }   # tenant-side reply
POST /tenant/complaints/{id}/confirm     { resolved: true|false }

# Announcements
GET  /tenant/announcements                                   # existing
POST /tenant/announcements/{id}/read

# Static
GET  /tenant/property-info               → { wifi, house_rules, manager }
GET  /tenant/menu                        → 7-day grid
GET  /tenant/roommates                   → opt-in list

# Notice to vacate
POST /tenant/notice                      { vacate_date, notes? }
DELETE /tenant/notice                    → cancel
```

**Owner-side additions** (existing `/api/v1/*` for OWNER/PARTNER):

```
GET  /properties/{id}/info               # CRUD for wifi/house rules/manager
PATCH /properties/{id}/info
GET  /properties/{id}/menu               # weekly grid
PUT  /properties/{id}/menu               # bulk-set whole week
POST /tenants/{id}/issue-otp-code        # owner-issued one-time code path
```

### 3.4 Native screens — v1 (apps/mobile-tenant/)

Expo SDK 51 + expo-router. File-based routes mirror the staff app's
patterns so anyone reading both codebases recognises the layout.

```
apps/mobile-tenant/app/
  _layout.tsx                  Root stack + ErrorBoundary + QueryClient
  index.tsx                    Synchronous redirect → /auth/login or /tabs (same
                               cold-start fix we did for the staff app)
  auth/
    login.tsx                  Phone entry → OTP request → code entry
    select-org.tsx             Org-picker when multiple active links
  tabs/
    _layout.tsx                Bottom tab bar (4 tabs, see below)
    index.tsx                  Home (action-stack dashboard)
    payments.tsx               Payments list + filters
    complaints.tsx             Complaints list + raise FAB
    more.tsx                   Settings + info + menu + sign out (carve-out tab)
  payments/[id].tsx            Detail with PDF receipt download
  ledger.tsx                   Month-by-month grid view (linked from Home & Payments)
  complaints/new.tsx           Raise form with photo picker
  complaints/[id].tsx          Thread view + reply + confirm-resolve
  announcements/index.tsx      List
  announcements/[id].tsx       Detail with mark-as-read
  info.tsx                     Property info: WiFi + house rules + manager
  menu.tsx                     7-day food menu grid, today highlighted
  notice.tsx                   Notice-to-vacate form + status
  profile.tsx                  Own info, language switcher, sign out
```

#### Tab bar layout

5-tab phone-bar maximum (same constraint as the staff app); pick the 4 most
frequently-used + a More:

| Tab | Icon | Why this one |
|-----|------|-------------|
| **Home** | `home-outline` | Action-stack dashboard — the only screen tenants need to open the app for. |
| **Payments** | `cash-outline` | Highest-recurring tenant intent — "what do I owe / what have I paid". |
| **Complaints** | `chatbox-outline` | Second-highest intent. Quick raise + status. |
| **More** | `menu-outline` | Wraps: announcements / info / menu / notice / profile. |

(Skipped a dedicated "Announcements" tab — they're low-frequency. They show
up as cards on Home when unread, and live under More for browsing history.)

#### Web `/portal/*` fallback

The existing web pages (`apps/web/src/pages/tenant-portal/TenantLogin.tsx`,
`TenantHome.tsx`, `TenantPortalApp.tsx`) stay but are downgraded to a
**"web fallback for tenants who can't install the app"** path. They get the
minimum to work but are not the primary target. Specifically:

- Keep login + ledger + payment history + complaints there.
- Don't extend them with the new dashboard / menu / info / notice features.
- Add a banner: *"Get the PGManage Resident app — better experience, push
  notifications, offline support"* with Play Store + App Store links.

Reason: probably 5% of tenants have very low-end phones where installing
the app is painful. The web fallback is a courtesy, not a parallel build.

### 3.5 Owner-side additions — v1

The owner needs to maintain the new property-info + menu + manage tenant
identity for new joiners. Add to the existing Settings → Property page:

```
Settings → Property → Tenant Portal (new card/tab)
  ├── WiFi credentials      (ssid + password, shown to tenants)
  ├── House rules           (markdown editor)
  ├── Manager contact       (name + phone)
  └── Weekly menu           (7×4 grid editor — Mon-Sun × BF/Lunch/Dinner/Snack)

Settings → Tenant access (new card)
  └── Issue one-time code   (per-tenant; sends WhatsApp/SMS once unblocked)
```

A new top-level nav entry is NOT needed; everything fits under existing
Property settings.

### 3.6 Tests (mirror the mobile pattern)

For each new helper / endpoint, write a focused test BEFORE the screen
consumes it:

- `public.tenant_identity` lookup: phone → matching links.
- OTP code generation + Redis TTL.
- `complaint_updates` thread integrity (one actor type per row).
- `property_info` upsert semantics.
- Receipt PDF generator: smoke test that 200 OK + PDF magic bytes.
- Tenant JWT validation: can't read another org's ledger by tampering with claims.

Same approach as mobile: pure logic → helper module → tested independently;
endpoints integration-tested against real Postgres.

---

## 4. V2 design — new-tenant onboarding (week 2-3)

Sketch only; full design when v1 is in users' hands.

### 4.1 Invite-link flow

Owner generates a per-property invite token (similar to the existing
`organisations.website_lead_token` pattern):

```
GET https://pgmanage.in/join/{token}
  → Loads portal with property pre-selected.
  → If phone not provided yet, redirect to phone/OTP.
  → After OTP, redirect to bed-selector.
```

Token can be revoked/rotated by the owner. v1 has one token per property; v2
of v2 could add per-tenant tokens for tighter control.

### 4.2 Tables

```sql
{schema}.tenant_join_requests (
  id              UUID PK,
  bed_id          UUID FK,
  identity_id     UUID,            -- links to public.tenant_identity
  phone           VARCHAR(20),     -- denormalised for fast lookups
  name            VARCHAR(200),
  requested_move_in_date DATE,
  status          VARCHAR(20),     -- PENDING/APPROVED/REJECTED/CANCELLED
  onboarding_id   UUID FK,
  referred_by_tenant_id UUID NULL,
  created_at      TIMESTAMPTZ,
  decided_at      TIMESTAMPTZ,
  decided_by      UUID,
  rejection_reason TEXT
);

CREATE UNIQUE INDEX tenant_join_requests_one_pending_per_bed
  ON tenant_join_requests(bed_id)
  WHERE status = 'PENDING';

{schema}.tenant_onboarding (
  id              UUID PK,
  request_id      UUID FK,
  full_name       VARCHAR(200),
  dob             DATE,
  gender          VARCHAR(20),
  alt_phone       VARCHAR(20),
  email           VARCHAR(255),
  permanent_address TEXT,
  current_address TEXT,
  occupation_type VARCHAR(50),     -- STUDENT/WORKING/OTHER
  institution_or_employer JSONB,   -- {name, designation/course, id_card_url}
  emergency_contact JSONB,         -- {name, relation, phone, alt_phone, address}
  id_type         VARCHAR(20),
  id_number       VARCHAR(50),
  id_proof_front  VARCHAR(500),    -- S3 key
  id_proof_back   VARCHAR(500),
  selfie          VARCHAR(500),
  vehicles        JSONB,           -- [{type, reg, brand, model, color}]
  nationality     VARCHAR(50) DEFAULT 'Indian',
  reason_for_stay VARCHAR(50),
  date_of_arrival DATE,
  native_place    JSONB,           -- {village, district, state}
  agreement_version VARCHAR(20),
  agreement_accepted_at TIMESTAMPTZ,
  agreement_accepted_ip VARCHAR(45),
  completeness_pct SMALLINT,       -- 0..100, denormalised for fast list views
  updated_at      TIMESTAMPTZ
);

{schema}.agreement_templates (
  property_id     UUID PK,
  version         VARCHAR(20),
  body_md         TEXT,
  updated_at      TIMESTAMPTZ
);
```

### 4.3 Approval workflow

Owner inbox at `/app/requests` (new top-level nav):

- List with completeness % per request, sorted by oldest pending.
- Tap → expand → onboarding preview + ID photos.
- Actions: Approve (with rent-plan form) / Reject (with reason) / Request more info (WhatsApp template with placeholder for the missing field).
- Approve → reuses existing `checkin_tenant` flow internally to create the
  `tenants` row + `rent_plans` row, sets bed OCCUPIED, marks request APPROVED,
  links `tenant_identity_links.tenant_id`.

---

## 5. Sequencing

Going native shifts the timeline. Realistic ~8 working days for v1 with one
engineer (~5 with two in parallel — one backend, one mobile).

| Day | Backend | Mobile (apps/mobile-tenant/) | Notes |
|----|---------|----------------------------|-------|
| **1** | Migration 019: `tenant_identity` + `tenant_identity_links`. Backfill script that walks every org schema's `tenants` and seeds identity rows. Update `/tenant/auth/otp` to phone-first (drop `org_slug`). | `npx create-expo-app apps/mobile-tenant` + Expo SDK 51 + expo-router. Copy theme/storage/ui/i18n/voice/api from `apps/mobile`. ErrorBoundary + root index redirect. Jest setup. | Backend day-1 also includes one-time-code path so frontend can stub-auth offline. |
| **2** | `property_info` + `food_menu` + `complaint_updates` tables + endpoints. Receipt PDF generator (reportlab). | Login screen → OTP request → code entry → org-picker. Tabs scaffolding. | |
| **3** | Notice-to-vacate endpoint. Statement PDF endpoint. Reply endpoint on complaints. Tests for each helper. | Home dashboard (action-stack cards). Payments list + filters. | |
| **4** | Owner-side: `/properties/{id}/info` + `/properties/{id}/menu` endpoints. Auto-create `tenant_identity_links` on `POST /tenants` (existing check-in flow). | Payments detail + PDF receipt download (Linking). Ledger month-grid screen. | Auto-create-identity-on-checkin is the bridge — without it, OWNERS can't onboard a tenant who'll then log into the app. |
| **5** | Hardening: tenant-can't-read-other-org integration tests. OTP rate-limits. Audit log coverage. | Complaints list + raise (with photo picker) + thread + confirm-resolve. | |
| **6** | — | Announcements with read state. Info / Menu screens. Notice-to-vacate form. | All read-heavy; fast day. |
| **7** | — | Profile + language switcher + sign out. Empty states, error states, loading states. i18n polish (en/hi/te). | |
| **8** | — | Owner-side UI: Settings → Tenant Portal card (WiFi / house rules / manager / menu editor) in `apps/web`. EAS Build + first APK / IPA. | Owner UI is small; mostly form work in existing settings page. |

After v1 ships, get tenant feedback for ~1 week while v2 (new-tenant
onboarding via invite link) starts in parallel.

### App-store / Play-store readiness checklist for v1

Before publishing, in addition to the build:

- Privacy policy URL on `pgmanage.in/privacy` (the same one needed for staff
  app + Meta App Review). One page covers both apps.
- Tenant app icon + feature graphic + 4-6 screenshots per device class.
  We can ship a v1 icon that's a quick variant of the staff icon; designer
  polish later.
- Play Store: separate listing under same Google Play Console account.
- App Store: separate listing under same Apple Developer account.
- Both apps share the same backend, so no new infrastructure.

---

## 6. Open questions for you to decide before I start

1. **Architecture: separate Expo project at `apps/mobile-tenant/`** (recommendation B in §1.5)?
   Or do you prefer one of the alternatives (A combined, C flavored)?
   **My recommendation: B.** Separate listings + clean per-audience branding
   are worth the half-day of scaffolding.

2. **OTP delivery for v1.** WhatsApp App Review still pending. Pick one:
   - **A.** Email magic-link OTP for v1; owner records tenant email during check-in. Most tenants give email; the few who don't get the owner-issued code path.
   - **B.** Pay for an SMS gateway (Twilio ~₹0.50/SMS, MSG91 ~₹0.20/SMS) — wire it as the v1 channel; switch to WhatsApp once Meta clears.
   - **C.** Owner-issued codes only — owner taps "Issue code" per tenant, shares it via personal WhatsApp. Most-friction but zero-cost and zero-dependency.
   - **My recommendation: A**, with owner-issued codes as the fallback when a tenant has no email on file.

3. **Tenant app name + bundle id.** Pick one:
   - **PGManage Resident** · `in.pgmanage.resident` — keeps brand parity, makes role clear in the store listing.
   - **MyPG** · `in.pgmanage.mypg` — punchy, tenant-flavoured, easier to search for.
   - **A custom white-label name** (e.g. "Loop Living") — premium feel but means per-property white-labelling work, defer to v3.
   - **My recommendation: PGManage Resident** for v1; revisit if owners want white-label.

4. **Public properties directory.** Confirm you're OK with cutting this from
   v1 entirely. (It's a marketing-layer build, not a tenant-app build. v2 of
   the tenant app uses invite links instead.)

5. **Languages at launch.** EN + HI + TE on day one (recommended — same
   stack as the staff app), or EN-only first?

6. **Web `/portal/*` fate.** Three options:
   - **A.** Keep as a thin "tenant who can't install the app" fallback (recommended). Just login + ledger + payments + complaints. Banner pushes app install.
   - **B.** Delete entirely. Force everyone to the native app.
   - **C.** Keep at full parity with the native app. Doubles maintenance.
   - **My recommendation: A.**

7. **Agreement template versioning.** When an owner updates the agreement
   text, do we (a) force every existing tenant to re-accept on next login,
   (b) only ask new tenants, (c) leave it to the owner to chase manually?
   Recommend (a) — simple "Agreement updated — please review" banner with
   blocking accept.

---

## 7. What I'd build first if you say go right now

Day-1 commitments (~6 hours), assuming **B + A + PGManage Resident +
cut directory + EN-day-one + keep web fallback**:

Backend:

- Migration 019: `public.tenant_identity` + `public.tenant_identity_links` +
  backfill script that walks every org schema's `tenants` table and seeds
  the identity rows.
- Update `/api/v1/tenant/auth/otp` to drop the `org_slug` requirement and
  return a list of orgs the phone matches.
- Add `/api/v1/tenant/auth/select-org` for the multi-org case.
- Wire email-OTP delivery via the existing Brevo SMTP service. Template:
  "Your PGManage code is {code}. Expires in 5 minutes."

Mobile (new project):

- `npx create-expo-app apps/mobile-tenant` + Expo SDK 51 (match staff app) +
  expo-router 3.5 + TanStack Query v5 + Zustand + axios.
- Copy `lib/theme.ts`, `lib/storage.ts`, `lib/voice.ts`, `lib/i18n.ts` (with
  tenant-specific dictionary added), `lib/api.ts` (adapted for `/tenant/*`),
  `components/ui.tsx`, `jest.setup.ts` from `apps/mobile/`.
- Fresh `lib/store.ts` — tenant-shaped state (no `selectedPropertyId`;
  `activeOrgLink` instead).
- `app.json` with bundle id `in.pgmanage.resident`, name `PGManage Resident`,
  icon (quick variant of the staff icon).
- `eas.json` profiles (development / preview / production) mirroring staff
  app's structure.
- ErrorBoundary + root `app/index.tsx` synchronous redirect.
- Jest setup mirroring staff app — first unit tests as we build.
- One end-to-end smoke test: tenant phone → request OTP → verify → JWT →
  fetch own ledger. Goes from API to native screen in one pass.

If that lands cleanly on day 1, the rest of v1 follows from the table above.

---

_Document version: 2026-06-12. Edit liberally; this is a working spec, not a contract._
