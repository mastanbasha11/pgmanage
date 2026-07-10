# Runbook — onboard a new PG owner's WhatsApp (Model A, manual)

How to switch a second/third PG owner onto WhatsApp rent reminders using **their
own** number and **their own** approved templates. This is the manual per-owner
path. For a self-serve "Connect WhatsApp" button (Embedded Signup / Tech
Provider) see the note at the end — that's a bigger project and needs Meta App
Review.

> **Why this works with no code change:** WhatsApp settings are **per-property**.
> Each `properties` row stores its own `whatsapp_phone_number_id`,
> `whatsapp_number`, `whatsapp_access_token`, and its own template
> name/language/placeholder map (JSONB). The send service resolves each
> property's own credentials at send time, and `public.whatsapp_routing` maps the
> phone number back to the right org for inbound replies.

---

## Prerequisites (the owner does these in Meta, once)

1. **Meta Business account** (business.facebook.com) for their PG.
2. **A WhatsApp Business Account (WABA)** under that business.
3. **A phone number registered on the Cloud API** in that WABA.
   - Must NOT be logged into the WhatsApp / WhatsApp Business **mobile app** — a
     number lives on only one surface at a time, or Cloud API sends break.
4. **Approved message templates** in that WABA — at minimum a rent-reminder and a
   rent-overdue template (category **UTILITY**, any language). Note the exact
   **template name**, **language code** (e.g. `en_US`), and the order of `{{N}}`
   placeholders.
5. **A System-User access token** with scopes `whatsapp_business_messaging` +
   `whatsapp_business_management`, and the WABA assigned to that system user.
   - Business Settings → Users → System users → Add → Assign the WABA (Full
     control) → Generate token (expiration **Never**) → select their app → tick
     both scopes → copy the token.
6. **Subscribe the app to the WABA** (so inbound replies reach our webhook):
   ```bash
   curl -s -X POST \
     "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps?access_token=<TOKEN>"
   # expect {"success":true}
   ```

> If the owner insists on using *their own* separate Meta app (not ours), inbound
> replies won't reach our single-app webhook without extra work — outbound will
> still send. Prefer subscribing their WABA to our app.

## Collect these values from the owner

| Value | Where they find it | Example |
|-------|--------------------|---------|
| Phone Number ID | WhatsApp Manager → Phone numbers | `1119147714618277` |
| Display number | same screen | `+91 81438 47542` |
| WABA ID | WhatsApp Manager account dropdown / URL `asset_id=` | `4338482489706631` |
| Reminder template name + language | Manage templates | `rent_reminder_x`, `en_US` |
| Overdue template name + language | Manage templates | `rent_overdue_x`, `en_US` |
| Placeholder order for each template | the template body | `{{1}}`=name, `{{2}}`=amount… |
| System-User access token | Business Settings → System users | `EAA...` |
| UPI VPA (for the reminder) | the owner | `theirpg@okhdfc` |

---

## Sanity-check the credentials before entering them (optional but recommended)

```bash
TOKEN='<their token>'; PHONE='<their phone number id>'
# 1. Template exists + approved?
curl -s "https://graph.facebook.com/v21.0/<WABA_ID>/message_templates?fields=name,status,language&access_token=$TOKEN"
# 2. Phone is on Cloud API?
curl -s "https://graph.facebook.com/v21.0/$PHONE?fields=display_phone_number,platform_type,code_verification_status&access_token=$TOKEN"
# 3. Live test send (to a number you control, digits only, no +):
curl -s -X POST "https://graph.facebook.com/v21.0/$PHONE/messages" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"9198XXXXXXXX","type":"template",
       "template":{"name":"<reminder template>","language":{"code":"en_US"},
       "components":[{"type":"body","parameters":[
         {"type":"text","text":"Test"},{"type":"text","text":"9000"},
         {"type":"text","text":"July"},{"type":"text","text":"5 Jul 2026"},
         {"type":"text","text":"pg@okhdfc"}]}]}}'
# success → {"messages":[{"message_status":"accepted"}]}
```
`platform_type` must be `CLOUD_API`. If the template send returns
`(#132001) Template name does not exist` the template name/language don't match
the WABA, or the phone and templates are in different WABAs.

---

## Enter it in PGManage (the normal path — the owner or you, in the app)

1. Log in as that org's **OWNER/PARTNER** → left nav → **Settings → WhatsApp**.
2. Pick the property. Fill **Phone Number ID**, **Display number**,
   **Access token**, **UPI VPA** → **Save**.
3. Under **Approved Meta templates**, open the **Template Wizard** for the
   reminder: enter its name + language, paste the body (it auto-detects `{{N}}`),
   then map each placeholder to a variable:
   - reminder → `tenant_name`, `amount_rupees`, `month_name`, `due_date`, `upi_vpa`
   - overdue → `tenant_name`, `amount_rupees`, `month_name`, `upi_vpa`, `manager_phone`
   (Map to whatever order the owner's template actually uses — every owner's
   template can differ; the wizard exists precisely for this.)
4. Use **Send test message** to fire one real message and confirm delivery.

Saving also upserts `public.whatsapp_routing` for the new phone number ID, so
inbound replies route to this org/property automatically.

## What happens next

- The **rent_reminders_monthly** job (1st, 10:00 IST) sends this owner's
  residents their reminder using the owner's number + template.
- The **rent_overdue_daily** job chases unpaid residents, respecting
  `OVERDUE_GRACE_DAYS` / `OVERDUE_REPEAT_DAYS`.
- All sends show up in **Settings → Message Log**.

## Limits & gotchas

- **Send cap:** an unverified business can message ~250 unique recipients/24h.
  The owner should complete **business verification** to raise it.
- **Keep the number off the mobile app** — installing WhatsApp Business on the
  same number deregisters it from Cloud API and breaks sends.
- **Token hygiene:** the token is stored on the property row. If it ever leaks,
  regenerate in Business Settings and re-save in Settings → WhatsApp, then revoke
  the old one (add the new one first to avoid downtime).

---

## When to build the self-serve version (Embedded Signup / Tech Provider)

Once you're onboarding many owners, replace this manual flow with **WhatsApp
Embedded Signup**: the owner clicks "Connect WhatsApp" in PGManage, logs into
their own Facebook, and grants our app access to their WABA; we capture their
`phone_number_id` + token automatically. That path **requires
`whatsapp_business_messaging` App Review** (messaging on behalf of other
businesses) — see [meta-whatsapp-app-review.md](./meta-whatsapp-app-review.md),
which keeps the App Review package for exactly this scenario. Estimated ~2–6
weeks of Meta back-and-forth + 1–2 weeks of frontend.
