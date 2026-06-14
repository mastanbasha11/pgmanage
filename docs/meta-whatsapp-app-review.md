# Meta App Review — WhatsApp Business Messaging submission package

Everything needed to submit PGManage for the `whatsapp_business_messaging`
permission. Copy each section into the matching field in the Meta App Dashboard.

> **Read this first.** You are sending from your **own** WhatsApp Business Account
> (WABA). For that case Meta usually requires only **business verification + a
> registered phone with approved templates** — *not* App Review. Confirm a real
> template send works (after the WABA-consolidation fix) before spending a week
> on this. Submit App Review only if a send still fails with a permission error
> or you decide to message on behalf of *other* PG businesses later.

---

## 0. Pre-submission checklist (App Dashboard → Settings → Basic)

| Field | Value |
|-------|-------|
| App name | PGManage |
| App icon | 1024×1024 PNG, square, no transparency (see §5) |
| Category | Business |
| Privacy Policy URL | `https://pgmanage.in/privacy` ✅ live |
| Terms of Service URL | `https://pgmanage.in/terms` ✅ live |
| App domains | `pgmanage.in` |
| Data Deletion | `https://pgmanage.in/privacy` (Section 8 covers deletion) |
| Business verification | Must be **Verified** (not "in progress") before review |
| Contact email | stay@theloopliving.in |

Also confirm under **WhatsApp → API Setup**: the registered phone number and the
approved message templates are in the **same WABA** (the `#132001` fix).

---

## 1. App description (App Dashboard → App Review → "How will you use…")

> PGManage is a property-management web and mobile application for Paying Guest
> (PG) and hostel operators in India. Operators use it to manage their
> properties, rooms, beds, residents, rent collection, expenses, and bookings.
>
> We use the WhatsApp Business Platform (Cloud API) to let a PG operator send
> **transactional notifications to their own residents** — rent reminders,
> payment receipts, rent-overdue notices, and booking confirmations — and to
> receive residents' replies so the operator can respond to queries and log
> complaints. Every outbound message uses a pre-approved WhatsApp message
> template; we do not send marketing or promotional content. Residents can opt
> out at any time by replying STOP. Message sends are tied to the operator's own
> verified business phone number; PGManage does not message anyone the operator
> has not added as a resident of their property.

---

## 2. Permission justifications

### `whatsapp_business_messaging` (primary)

> PGManage uses `whatsapp_business_messaging` to send transactional template
> messages from the operator's verified WhatsApp Business phone number to that
> operator's own residents, and to receive the residents' replies via webhook.
>
> Concrete uses, all initiated by the operator's own data:
> 1. **Rent reminder** — a monthly template message ("Hi {{name}}, your rent of
>    {{amount}} for {{month}} is due on {{date}}. Pay via UPI: {{upi}}") sent to
>    each active resident around the rent due date.
> 2. **Payment receipt** — when the operator records a payment, an optional
>    receipt confirmation is sent to that resident.
> 3. **Rent-overdue notice** — a daily template to residents past their due date.
> 4. **Inbound replies** — residents replying to the above are received on our
>    webhook (`/api/v1/webhooks/whatsapp`), routed to the correct property, and
>    surfaced to the operator (and logged as a complaint where relevant).
>
> We send only to phone numbers the operator has explicitly entered as residents
> of their own property. We use approved templates only and honour STOP opt-outs.

### `whatsapp_business_management` (only if requested)

> Used to read and manage the operator's own WhatsApp Business Account
> configuration — listing the phone numbers and approved message templates that
> belong to the connected WABA — so the operator can select which approved
> template to use for each notification inside PGManage's settings screen. We do
> not modify templates programmatically; templates are created and approved in
> WhatsApp Manager.

---

## 3. Demo video script (screencast)

Record a single screen capture, 2–4 minutes, 1080p, with on-screen actions and
either voice-over or captions. **Do the steps live** — Meta wants to see the real
flow, not slides. Use a real test recipient number that you control and can show
receiving the message.

> **Tip:** Before recording, make sure (a) business verification is done,
> (b) the registered phone + templates are in one WABA, and (c) a test send
> actually delivers. Otherwise the reviewer sees a failed send.

### Scene 1 — Privacy & Terms (0:00–0:20)
- Open `https://pgmanage.in/privacy`, scroll to **Section 3 "WhatsApp and Meta"**.
- **Say:** "PGManage's privacy policy describes exactly how we use the WhatsApp
  Business Platform and how residents opt out by replying STOP."
- Briefly show `https://pgmanage.in/terms`.

### Scene 2 — Log in (0:20–0:35)
- Go to `https://pgmanage.in`, log in with the reviewer test account
  (credentials provided in §4).
- **Say:** "An operator logs into PGManage to manage their PG property."

### Scene 3 — Where WhatsApp is configured (0:35–1:05)
- Navigate **Settings → WhatsApp** (`/settings/whatsapp`).
- Show the per-property card: **Phone Number ID**, **Display number**,
  **Access token**, **UPI VPA**, and the **Approved Meta templates** section
  (Rent reminder / Rent overdue).
- **Say:** "The operator connects their own verified WhatsApp Business number and
  selects which Meta-approved template to use for each notification."

### Scene 4 — Show a resident (the recipient is the operator's own data) (1:05–1:25)
- Go to **Tenants/Residents**, open one resident showing name + phone.
- **Say:** "We send only to residents the operator has added to their own
  property — here is the resident who will receive the message."

### Scene 5 — Send the message (the core permission use) (1:25–2:15)
- Back on **Settings → WhatsApp**, in **Send test message**, enter the test
  recipient number (with country code) and click **Send test**.
- Show the success state: "Sent. Meta message id: …".
- **Cut to the recipient phone** (screen-mirror or camera) showing the WhatsApp
  message arriving with the rendered rent-reminder content.
- **Say:** "Using whatsapp_business_messaging, PGManage sends the approved
  template from the operator's number to the resident, who receives it on
  WhatsApp."

### Scene 6 — Inbound reply (1:25 path, optional but strong) (2:15–2:45)
- On the recipient phone, reply to the message (e.g. "When is the last date?").
- **Say:** "When a resident replies, PGManage receives it via our webhook and
  routes it to the operator so they can respond — completing the two-way
  transactional conversation."

### Scene 7 — Opt-out (2:45–3:00)
- Reply **STOP** from the recipient phone.
- **Say:** "Residents can stop messages at any time by replying STOP, as stated
  in our privacy policy."

End the recording.

---

## 4. Reviewer test instructions (paste into "Instructions for reviewer")

> **Test account**
> - URL: https://pgmanage.in
> - Email: `reviewer@theloopliving.in`  ← create this before submitting
> - Password: `<set a temporary password>`
>
> **Steps to verify whatsapp_business_messaging:**
> 1. Log in at https://pgmanage.in with the credentials above.
> 2. Go to **Settings → WhatsApp** (left nav → Settings → WhatsApp).
> 3. The property already has a connected, verified WhatsApp Business number and
>    an approved template selected.
> 4. In the **"Send test message"** card, enter a phone number you control
>    (with country code, e.g. +9198XXXXXXXX) and click **Send test**.
> 5. The app shows "Sent. Meta message id: …" and the number receives an approved
>    rent-reminder template message on WhatsApp.
> 6. Reply from that number; the reply is received by PGManage via our webhook
>    (`https://pgmanage.in/api/v1/webhooks/whatsapp`) and shown to the operator.
> 7. Reply **STOP** to opt out.
>
> Privacy Policy: https://pgmanage.in/privacy (Section 3 covers WhatsApp).
> Terms: https://pgmanage.in/terms

> ⚠️ Create a dedicated **reviewer test login** and make sure its property has
> working WhatsApp credentials + an approved template, so the reviewer's test
> send actually delivers. If the reviewer's send fails, the submission is
> rejected.

---

## 5. App icon spec

- 1024×1024 px, PNG, **square**, **no alpha/transparency** (Meta rejects
  transparent icons).
- Use the PGManage mark on the brand slate background `#0F172A` with the teal
  accent `#0D9488`. A flat "PG" monogram or the app logo is fine.
- Also useful: a 512×512 for the Play Store listing (separate submission).

---

## 6. Common rejection reasons (avoid these)

1. **Business not verified** — finish verification first; review won't pass otherwise.
2. **Reviewer can't reproduce** — test login missing, or its WhatsApp send fails.
3. **Video doesn't show the permission in action** — must show an actual message
   leaving the app and arriving on a phone, not just the settings screen.
4. **Privacy policy doesn't mention WhatsApp/Meta data use** — ours does (Section 3).
5. **Template/phone in different WABAs** — causes `#132001`; fix before recording.

---

## 7. What's already done vs. what you still need

| Item | Status |
|------|--------|
| Privacy Policy page (live) | ✅ https://pgmanage.in/privacy |
| Terms page (live) | ✅ https://pgmanage.in/terms |
| Privacy policy covers WhatsApp/Meta + STOP | ✅ Section 3 + 8 |
| In-app WhatsApp settings + test-send + template wizard | ✅ shipped |
| Inbound webhook | ✅ `/api/v1/webhooks/whatsapp` |
| App description / permission text / video script | ✅ this document |
| Business verification = Verified | ⬜ you (Meta dashboard) |
| WABA consolidation (templates + phone in one WABA) | ⬜ you (Meta dashboard) |
| App icon 1024×1024 | ⬜ you |
| Reviewer test login with working WA creds | ⬜ you |
| Record the demo video | ⬜ you (use §3) |
| Submit App Review | ⬜ you |
