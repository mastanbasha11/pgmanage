# Handoff — WhatsApp, Notifications, Job Monitor & iOS launch

_Last updated: 2026-07-25 · complements [`docs/HANDOFF.md`](./HANDOFF.md) (Payments/Leads workstream). This doc covers the WhatsApp reminders system, the outbound-notification + delivery tracking, the scheduler/Job Monitor, and the iOS App Store launch status._

---

## 1. Current project state

### WhatsApp is LIVE (sending works)
The `(#132001)` "template does not exist" error was a **configuration bug, not a WABA problem**. The prod property was pointed at Meta's **sandbox test number** with the wrong template name/language. Real template sends now succeed (verified — `sent → delivered` in ~15s).

**Canonical prod config** (org `The LOOP Modern Coliving PG`):
| Thing | Value |
|---|---|
| Org id / schema | `f224ec61-4708-46ca-be6f-661429d809cb` / `org_f224ec61_4708_46ca_be6f_661429d809cb` |
| Property id | `09fc83ef-adcf-4a0d-88a2-a10f9beb4754` |
| Phone Number ID (Cloud API) | **`1119147714618277`** (+91 81438 47542, "LOOP Colving PG") |
| WABA | **`4338482489706631`** ("LOOP Colving PG") |
| Meta App | "LOOP WA" — app_id `1541381027385783` |
| Reminder template | **`rent_reminder_harshi_1`** · lang **`en_US`** · `{{1}}`name `{{2}}`amount `{{3}}`month `{{4}}`due-date `{{5}}`upi |
| Overdue template | **`rent_overdue_harshi_1`** · lang **`en_US`** · `{{1}}`name `{{2}}`amount `{{3}}`month `{{4}}`upi `{{5}}`manager-phone |
| Business id | `1018166251369631` |

Placeholder maps + template **bodies** are stored on the `properties` row (`wa_*_template_params` JSONB, `wa_*_template_body` TEXT). The bodies were backfilled for the LOOP property so the app can render the exact message that was sent.

### Scheduler (in-process APScheduler, single backend replica)
`SCHEDULER_ENABLED=true` in `/etc/pgmanage/.env`. Two jobs (`Asia/Kolkata`):
- **`rent_reminders_monthly`** — 1st of month, 10:00 IST: creates the month's `rent_ledger_entries` + sends `rent_reminder` to every ACTIVE tenant with a rent plan.
- **`rent_overdue_daily`** — daily, 10:00 IST: chases UNPAID/PARTIAL tenants, **but** only past `OVERDUE_GRACE_DAYS` after due date and not re-notified within `OVERDUE_REPEAT_DAYS` (so no daily spam). CHECKED_OUT tenants are excluded.

Every run writes a `public.job_runs` row (summary + per-org JSON `details`) even when it sends nothing.

### Notifications / observability (all shipped + deployed)
- **`notification_log`** (per org schema) now stores `recipient_phone`, `rendered_message` (final text with real values), `delivery_status`, `delivered_at`, on top of the existing status/`external_message_id`.
- **Delivery receipts**: the WhatsApp webhook now processes Meta status callbacks (`sent/delivered/read/failed`) and stamps `delivery_status` + `delivered_at` on the matching row (keyed by message id).
- **Settings → Message Log** — per-message rows (Room · Recipient · Sent · Status), click a row for the full rendered message + all fields. _(Note: this screen was later reworked by the redesign workstream to add inbound-reply grouping and redesign components — the backend fields below are the stable contract.)_
- **Settings → Job Monitor** — one card per job run (status, timing, sent/failed/orgs/ledger) with a **downloadable log file** (`GET /api/v1/job-runs/{id}/logfile?fmt=txt|json`) that lists every message in that run: **To, Room, Resident, Status, Triggered, Delivered, and the full Message**.
- Room number is derived live via `tenant → bed → room` join (null for test/dummy recipients).

### Legal pages (live, required by Meta + Play/App stores)
`https://pgmanage.in/privacy` and `/terms` — public SPA routes, include WhatsApp/Meta data-use + STOP opt-out language. Contact email **stay@theloopliving.in**.

### Migrations added by this workstream
- `025_job_runs.py` — `public.job_runs` (public/cross-org table).
- `026_notification_detail.py` — org-scoped: `notification_log` (+recipient_phone/rendered_message/delivery_status/delivered_at) and `properties` (+wa_rent_reminder_template_body/wa_rent_overdue_template_body). Both mirrored in `provision_org_schema`. _(DB head has since advanced to `037` via other work.)_

### iOS App Store — NOT launched yet, enrollment blocked
See §3. Android APK ships via EAS `preview`; iOS has no build/submit config yet, and Apple Developer enrollment is stuck on ID verification.

---

## 2. Decisions made (with rationale)

- **App Review is NOT required for the current setup.** Sending from LOOP's **own** WABA with its own token only needs business verification + approved templates — not the `whatsapp_business_messaging` App Review. That review is only needed if PGManage later messages on behalf of **other** businesses' WABAs (Embedded Signup / Tech Provider). The full App-Review package is kept in [`docs/meta-whatsapp-app-review.md`](./meta-whatsapp-app-review.md) for that future.
- **`#132001` root cause was config, not a WABA mismatch.** The same number `+91 81438 47542` exists as **two** phone-number-IDs in two WABAs: `1119147714618277` (WABA `4338482489706631`, **Cloud-API-capable**, has the templates) and `1067890163085328` (WABA `25725852610370900`, **can't register** — the number is already claimed by the cloud entry). The app had been pointed at Meta's **sandbox** number `1090395407497995`. Fix = point the property at `1119…` + the `*_harshi_1` templates in `en_US`.
- **Overdue chasing is throttled** (`OVERDUE_GRACE_DAYS=3`, `OVERDUE_REPEAT_DAYS=3`, both env-tunable) — the original job would have messaged every unpaid tenant **every morning from day 1**. Dedupe uses a `NOT EXISTS` against `notification_log`.
- **Empty template params are never sent** — Meta rejects them. The amount always has a value; `manager_phone` falls back `OVERDUE_MANAGER_PHONE` → org WhatsApp number → `"the PG office"`; `upi_vpa` falls back to `"—"`. `OVERDUE_MANAGER_PHONE=+918143847841` is set in prod.
- **Amount param carries the number only (`9,000`), not `₹9,000`.** The approved templates print `₹` literally before `{{2}}`, so passing a ₹-prefixed value produced `₹₹9,000`. `notification_log.message_body` keeps the ₹ form for human readability.
- **`job_runs` is a public/cross-org table**, but the owner-facing log file scopes per-message detail to the caller's org (queried under their `search_path`) so one owner never sees another's messages.
- **Template bodies are stored per-property** so the app can reconstruct and log the exact sent message; falls back to a `template — v1 | v2 …` line when a body isn't saved.
- **WhatsApp token stored per-property** (`whatsapp_access_token`, or a Secrets-Manager ARN if set) — same pattern as Razorpay.
- **Delivery-status handling is defensive** — wrapped in try/except so one malformed Meta callback can't 500 the batch (Meta would retry-storm), and the UPDATE uses explicit `CAST(...)` because asyncpg can't deduce types for NULL params.
- **iOS: launch as Individual first, transfer to Org later.** Registering a company + D‑U‑N‑S (needed for an Org account, ~3–6 wks in India) shouldn't block launch. Individual account shows the founder's **legal name** as seller; the "PG Manage"/brand name requires the Org account and can come via app transfer later.

---

## 3. Pending tasks

### 🔐 High priority — security
- **Rotate the WhatsApp access token.** The long-lived System-User token was **pasted into a chat during setup** and is live in the prod DB. Generate a NEW never-expiring token (scopes `whatsapp_business_messaging` + `whatsapp_business_management`) in Business Settings → System users → `pgmanage-api`, paste it into **Settings → WhatsApp** and Save, **then revoke the old one** (add-new-before-revoke to avoid downtime).

### WhatsApp
- **Business verification** on Meta to lift the unverified send cap (~250 unique recipients/24h → 1K → 10K…). Do before mass sends.
- **Confirm real-user reach** — send once to a resident number not on the test list; if accepted, fully live within the tier.
- **Data hygiene before overdue runs** — an unpaid ledger row that was actually paid in cash but not recorded will chase the tenant. Recording the payment removes them automatically.
- **Multi-owner onboarding** — manual Model A is documented ([`docs/whatsapp-onboard-new-owner.md`](./whatsapp-onboard-new-owner.md)). The self-serve Embedded Signup path (needs App Review) is deferred until several paying owners.

### iOS App Store (blocked)
- **Enrollment ID verification REJECTED.** Cause: the Apple ID account name is **"PG Manage"** (a brand), but Individual enrollment verifies a **person's legal name matching a government photo ID**. Fix: (1) at appleid.apple.com set the name to the founder's **full legal name**; (2) there's **no retry button** in the Developer app — re-open via the web (`developer.apple.com/account`/`/enroll`) or **Apple Developer Support** (Membership & Account → Identity Verification → request reset); (3) resubmit with a **passport** in good lighting. Fee auto-refunds on failed enrollment. Apple ID in use: `pgmanage9@gmail.com`.
- **After enrollment clears:** add iOS `eas.json` submit block + confirm `app.json` iOS section (bundle id `com.pgmanage.app` ✅, version 1.1.1 / build 3), then `eas build --platform ios --profile production` + `eas submit`. Create the App Store Connect app record; fill screenshots (6.7"/6.5"), App Privacy questionnaire, export-compliance (standard encryption = exempt), and a **reviewer demo login**. Keep the iOS app **free with no in-app purchase UI** (bill via web/Razorpay) to avoid Apple's IAP mandate. An `apps/mobile/IOS_RELEASE.md` runbook was offered but not yet written.

### Nice-to-haves
- "Run overdue now" button on Job Monitor (currently triggered via a one-off script in the backend container).
- Consider gating overdue to specific days (due+5/+10/+15) instead of every-3-days if that reads better to residents.

---

## 4. Important constraints

### WhatsApp (read before touching the number or templates)
- **Do NOT install the WhatsApp / WhatsApp Business mobile app on +91 81438 47542.** A number lives on one surface at a time; registering it in the app **deregisters it from the Cloud API** and breaks all backend sends. Keep it Cloud-API-only.
- **Only `1119147714618277` (WABA `4338482489706631`) is sendable.** The other identity `1067890163085328` (WABA `25725852610370900`) is not Cloud-API-registrable. Don't repoint the app at it.
- **Templates print `₹` literally** — the app must pass the amount as a plain number. New templates must follow this convention or the double-`₹` returns.
- **Meta rejects empty template params** — every placeholder must resolve to a non-empty value (see the fallback chains in §2).
- **App/WABA subscription**: inbound + delivery webhooks only arrive because app "LOOP WA" is subscribed to the WABA (`POST /{waba}/subscribed_apps`). A new owner's WABA must be subscribed to the app for their inbound/receipts to route.

### Scheduler / jobs
- **In-process, single replica.** If the backend is ever scaled to >1 replica, both would fire — add a Redis-backed distributed lock or move to an external scheduler. `job_runs` is `public`; per-org detail in the log file relies on the caller's `search_path`.
- `SET LOCAL search_path` resets after `commit()` — the jobs re-`set_schema` per org and roll back a tainted session before continuing.

### Data model
- `notification_log` and `properties` are **org-scoped** — the two template-body columns and the four notification-detail columns are in both `provision_org_schema` **and** migration `026`. `job_runs` is **public** (Alembic only).
- Standard project rules still apply (see `docs/HANDOFF.md` §4): integer paise, per-org schema, deploy with `--env-file`, `--build` on migrate, frontend↔backend contract drift.

### iOS / stores
- Individual Apple account → **seller name is the founder's legal name**; brand name needs the Org account (company + D‑U‑N‑S, ~3–6 wks). App can be **transferred** individual→org later (keeps reviews/downloads).
- **No purchase UI in the iOS app** or Apple forces in-app-purchase (30% + rejection). PGManage bills owners outside the app.

---

## 5. Key files

| Area | Files |
|---|---|
| WhatsApp send + render + logging | `app/services/notification_service.py` (`send_whatsapp_template`, `_render_message`, `send_rent_reminder/overdue`, `log_notification`) |
| Delivery webhook | `app/api/v1/webhooks.py` (`whatsapp_inbound`, `_handle_status`) |
| Scheduler jobs | `app/tasks/rent_reminders.py`; wired in `app/main.py` lifespan |
| APIs | `app/api/v1/notifications.py` (Message Log), `app/api/v1/job_runs.py` (Job Monitor + logfile) |
| Migrations | `alembic/versions/025_job_runs.py`, `026_notification_detail.py` |
| Web | `pages/settings/MessageLogPage.tsx`, `pages/settings/JobMonitorPage.tsx`, `hooks/useNotifications.ts`, `hooks/useJobRuns.ts` |
| Config | `OVERDUE_GRACE_DAYS` / `OVERDUE_REPEAT_DAYS` / `OVERDUE_MANAGER_PHONE` in `app/core/config.py` + `docker-compose.prod.yml` backend env |
| Docs | `docs/meta-whatsapp-app-review.md`, `docs/whatsapp-onboard-new-owner.md` |

### Meta reference IDs
Business `1018166251369631` · App "LOOP WA" `1541381027385783` · WABA (live) `4338482489706631` · phone (live) `1119147714618277` (+91 81438 47542) · other WABA `25725852610370900` / phone `1067890163085328` (not usable) · sandbox phone (old wrong config) `1090395407497995` · manager contact for `{{5}}` = `+918143847841`.
