# WhatsApp go-live — status, canonical config, and App Review (only-if-needed)

> **TL;DR (2026-07-11): WhatsApp sending is WORKING.** The `#132001` error was a
> **configuration bug**, not an account/WABA problem. PGManage prod was pointed at
> Meta's **sandbox test number** with the wrong template name/language. After
> fixing the config, live template sends succeed from the real number.
> **App Review is NOT required** for your own-WABA setup — see the last section.

---

## 1. What was actually wrong (and the fix)

Your number `+91 81438 47542` exists as **two Cloud-API identities in two WABAs**:

| Phone Number ID | WABA | platform_type | Templates | Sends? |
|---|---|---|---|---|
| **`1119147714618277`** ("LOOP Colving PG") | **`4338482489706631`** | CLOUD_API ✅ | `rent_reminder_harshi_1`, `rent_overdue_harshi_1`, `hello_world` — all APPROVED (`en_US`) | ✅ **works** |
| `1067890163085328` ("The Loop Living") | `25725852610370900` | NOT_APPLICABLE | `rent_*_harshi_upi` (approved, `en`) | ❌ can't register (dup number) |

The prod DB had the property configured with a **third** id — Meta's sandbox test
number `1090395407497995` / `+1 555-657-4632` and template `hello_world`. That's
why nothing real ever sent.

**Fix applied (2026-07-11):** re-pointed the property to `1119147714618277` +
the `*_harshi_1` templates in `en_US`, and re-synced `public.whatsapp_routing`.
Verified with two live test sends to `+91 7702271641` (hello_world + a full
parameterized rent reminder) — both `accepted`.

---

## 2. Canonical production config (source of truth)

**Org:** The LOOP Modern Coliving PG — `f224ec61-4708-46ca-be6f-661429d809cb`
(schema `org_f224ec61_4708_46ca_be6f_661429d809cb`)
**Property:** The LOOP Modern Coliving PG — `09fc83ef-adcf-4a0d-88a2-a10f9beb4754`

| Setting (`properties` column) | Value |
|---|---|
| `whatsapp_phone_number_id` | `1119147714618277` |
| `whatsapp_number` | `+918143847542` |
| WABA | `4338482489706631` ("LOOP Colving PG") |
| Meta App | "LOOP WA" — app_id `1541381027385783` |
| `wa_rent_reminder_template_name` / `_language` | `rent_reminder_harshi_1` / `en_US` |
| `wa_rent_overdue_template_name` / `_language` | `rent_overdue_harshi_1` / `en_US` |

**Placeholder maps** (order = `{{1}}…{{N}}`, keys from `BUILT_IN_VARIABLES`):

- `rent_reminder_harshi_1` → `tenant_name`, `amount_rupees`, `month_name`, `due_date`, `upi_vpa`
- `rent_overdue_harshi_1` → `tenant_name`, `amount_rupees`, `month_name`, `upi_vpa`, `manager_phone`

Stored as JSONB, e.g.
`[{"kind":"variable","key":"tenant_name"}, …]`.

**Scheduler:** `SCHEDULER_ENABLED=true` in `/etc/pgmanage/.env` (flipped 2026-07-11).
Jobs: `rent_reminders_monthly` (1st, 10:00 IST) + `rent_overdue_daily` (10:00 IST).

### To send manually via Graph API (sanity check)
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/1119147714618277/messages" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"9198XXXXXXXX","type":"template",
       "template":{"name":"rent_reminder_harshi_1","language":{"code":"en_US"},
       "components":[{"type":"body","parameters":[
         {"type":"text","text":"Asha"},{"type":"text","text":"9000"},
         {"type":"text","text":"July"},{"type":"text","text":"5 Jul 2026"},
         {"type":"text","text":"loop@okhdfc"}]}]}}'
```

---

## 3. Remaining operational items

| Item | Owner | Notes |
|---|---|---|
| 🔐 **Rotate the access token** | You | The token used was pasted in chat. In Business Settings → System users → `pgmanage-api`, generate a NEW never-expiring token (scopes `whatsapp_business_messaging` + `whatsapp_business_management`), paste it into **Settings → WhatsApp** (Save), **then** revoke the old one — in that order to avoid downtime. |
| **Business verification** | You | Not required to send, but it **raises the daily cap** (unverified ≈ 250 unique recipients/24h → 1K → 10K → …). Do it before mass sends. |
| **Confirm real-user reach** | You | Send once to a resident number **not** on your test list. If accepted, you're fully live within the current tier. |
| **Fix `code_verification EXPIRED`** | Optional | Did not block our sends. Re-verify in WhatsApp Manager only if a display-name/cert issue appears. |
| **Per-property setup for future orgs** | You/UI | New PG orgs set their own creds via Settings → WhatsApp (the Template Wizard maps placeholders). |

---

## 4. App Review — **only if you become a multi-business Tech Provider**

You are sending from **your own** WABA with **your own** token, which does **not**
require `whatsapp_business_messaging` App Review. Keep the material below **only**
for the future case where PGManage sends on behalf of *other* PG businesses'
WABAs (Embedded Signup / Tech Provider). Everything here is still valid for that
path; ignore it otherwise.

Prereqs (Basic settings): Privacy `https://pgmanage.in/privacy` ✅ live · Terms
`https://pgmanage.in/terms` ✅ live · App icon `docs/assets/pgmanage-icon-1024.png` ✅.

### App description
> PGManage is a property-management app for Paying Guest (PG)/hostel operators in
> India. We use the WhatsApp Business Platform (Cloud API) to let an operator send
> transactional notifications to their own residents — rent reminders, receipts,
> overdue notices, booking confirmations — and receive replies. All messages use
> pre-approved templates; no marketing. Residents opt out by replying STOP.

### Permission justification — `whatsapp_business_messaging`
> Used to send transactional template messages from the operator's verified
> WhatsApp Business number to that operator's own residents, and to receive their
> replies via webhook (`/api/v1/webhooks/whatsapp`). Only numbers the operator has
> added as residents are messaged; approved templates only; STOP honoured.

### Demo-video script (≈3 min, recorded live)
1. Show `https://pgmanage.in/privacy` §3 (WhatsApp/STOP).
2. Log in at pgmanage.in with the reviewer test account.
3. **Settings → WhatsApp** — show the connected number + selected approved template.
4. Show a resident (the recipient is the operator's own data).
5. **Send test** to a controlled number → show "Sent" + the message arriving on the phone.
6. Reply from the phone → show inbound routing to the operator.
7. Reply **STOP** → opt-out.

### Reviewer test instructions
> URL https://pgmanage.in · reviewer login `reviewer@theloopliving.in` (create it) ·
> Settings → WhatsApp → Send test to a number you control → message arrives → reply → STOP.
> Privacy https://pgmanage.in/privacy · Terms https://pgmanage.in/terms

### Common rejection reasons
Business not verified · reviewer can't reproduce (bad test login) · video doesn't
show a real message arriving · privacy policy omits WhatsApp (ours covers it) ·
template/phone in different WABAs (`#132001`).
