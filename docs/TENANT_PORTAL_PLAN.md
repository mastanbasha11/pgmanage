# Tenant Portal — Build Plan & Spec Review

> Response to the build spec dated 2026-06-12. Goal: ship a world-class tenant
> portal without over-scoping the first cut. Plan first, code after sign-off.

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

### 3.4 Web screens — v1

PWA at `/portal/*`, mobile-first. Reuse the existing `TenantPortalApp.tsx`
shell.

```
/portal/login                  Phone + (after OTP request) code entry
/portal/login/select-org       Org picker when multiple active links
/portal/                       Action-stack home: due, complaints, announcements
/portal/payments               History list with filters
/portal/payments/:id           Detail with receipt download
/portal/ledger                 Month grid view
/portal/complaints             List + 'Raise' FAB
/portal/complaints/new         Form
/portal/complaints/:id         Thread + status + reply
/portal/announcements          List
/portal/announcements/:id      Detail with mark-as-read
/portal/info                   WiFi + house rules + manager
/portal/menu                   Weekly grid, today highlighted
/portal/profile                Own info, lang switcher, sign out
/portal/notice                 Notice-to-vacate form / status
```

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

Aiming for ~5 working days for v1, with two engineers if possible (one
backend + one frontend mostly in parallel after day 1).

| Day | Backend | Frontend | Notes |
|----|---------|---------|-------|
| **1** | Migration: `tenant_identity` + `tenant_identity_links` tables. Backfill script. Update OTP request/verify endpoints to use them (drop the `org_slug` requirement). One-time-code path. | Wireframes for login + dashboard. Theme + i18n setup mirroring mobile. | Auth is the hard blocker — get it right. |
| **2** | `property_info` + `food_menu` tables + endpoints. `complaint_updates` table + endpoints. Receipt PDF generator (reportlab). | Login screen + org-picker + dashboard skeleton. | Backend ahead by a day so frontend never blocks. |
| **3** | Notice-to-vacate endpoint. Statement PDF endpoint. Tests for each new helper. | Payments list + detail + receipt download. Complaints list + raise. | |
| **4** | Owner-side endpoints (Settings → Tenant Portal card). Owner UI in /app/. | Complaints thread + confirm-resolution. Announcements with read state. | Owner-side changes are small but real. |
| **5** | Hardening: tenant-can't-read-other-org tests. Rate-limits on OTP. Audit log coverage. | Static info + menu + notice + profile + i18n polish. Deploy + smoke test. | Full E2E pass on real backend. |

After v1 ships, we get user feedback for 3-5 days while we start v2 (new
tenant onboarding) in parallel.

---

## 6. Open questions for you to decide before I start

1. **OTP delivery for v1.** WhatsApp App Review still pending. Pick one:
   - **A.** Email magic-link OTP only for v1; owner records tenant email during check-in. Most tenants give email; the few who don't get the owner-issued code path.
   - **B.** Pay for an SMS gateway (Twilio ~₹0.50/SMS, MSG91 ~₹0.20/SMS) — wire it as the v1 channel; switch to WhatsApp once Meta clears.
   - **C.** Owner-issued codes only — owner taps "Issue code" per tenant, shares it via personal WhatsApp. Most-friction but zero-cost and zero-dependency.
   - **My recommendation: A**, with owner-issued codes as the fallback when a tenant has no email on file.

2. **Public properties directory.** Confirm you're OK with cutting this from
   v1 entirely. (It's a marketing-layer build, not a portal build.)

3. **Languages at launch.** EN + HI + TE for the portal, like mobile? Or
   start EN-only and add HI/TE in v1.5?

4. **PWA vs separate native tenant app.** Recommend PWA only for v1 — the
   existing tenant-portal lives at `/portal/*` and can be PWA-installable in
   under a day. A native tenant app is a separate ~2-week build that adds
   little vs a polished PWA for this audience. Confirm.

5. **Where the portal lives.** Currently `/portal/*` on `pgmanage.in`. Spec
   doesn't push back, so I'll keep it. (Alternative: `tenant.pgmanage.in`
   subdomain — more isolation, more DNS work. Defer.)

6. **Agreement template versioning.** When an owner updates the agreement
   text, do we (a) force every existing tenant to re-accept on next login,
   (b) only ask new tenants, (c) leave it to the owner to chase manually?
   Recommend (a) — simple "Agreement updated — please review" banner with
   blocking accept.

---

## 7. What I'd build first if you say go right now

Day-1 commitments (~6 hours):

- Migration 019: `public.tenant_identity` + `public.tenant_identity_links` +
  backfill script that walks every org schema's `tenants` table and seeds
  the identity rows.
- Update `/api/v1/tenant/auth/otp` to drop the `org_slug` requirement and
  return a list of orgs the phone matches.
- Add `/api/v1/tenant/auth/select-org` for the multi-org case.
- A POC of email-OTP delivery via the existing SMTP service.
- One end-to-end test: tenant phone → request OTP → verify → JWT → fetches
  their own ledger.

If that lands cleanly, the rest of v1 follows from the table above.

---

_Document version: 2026-06-12. Edit liberally; this is a working spec, not a contract._
