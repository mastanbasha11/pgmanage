# Tenant online payments (Razorpay) — operations & go-live

Per-owner model: each PG owner connects **their own** Razorpay account, so rent
flows tenant → owner directly and the platform never holds funds (no RBI
Payment Aggregator licence needed). Credentials live per-org on
`public.organisations`.

v1 scope: tenants can pay **RENT**, **ADVANCE**, and **DEPOSIT** online.

## Architecture

```
Tenant (portal PayScreen)
  → POST /api/v1/tenant/payments/order        (server computes the amount)
  → Razorpay Checkout (checkout.js)           (money → owner's Razorpay a/c)
  → POST /api/v1/tenant/payments/verify        (instant UX; signature-checked)
Razorpay
  → POST /api/v1/webhooks/razorpay?org=<slug>  (SOURCE OF TRUTH; signature-checked)
```

Both the verify-callback and the webhook write the payment via the shared
`record_online_payment()` using `idempotency_key = "rzp_<payment_id>"`. That
column is `UNIQUE`, so the two paths converge on **exactly one** `payments`
row no matter who wins the race or how many times Razorpay retries.

- Amounts are **never trusted from the client**. RENT = current-month
  outstanding (ledger, else rent-plan total); DEPOSIT = plan
  `security_deposit_paise` minus deposits already paid (guards against paying
  twice); ADVANCE = client amount, capped at 12× monthly rent.
- Money is integer paise throughout — Razorpay's native unit, so no conversion.
- Online RENT payments update `rent_ledger_entries` exactly like the staff path.
- Secrets resolve Secrets-Manager-ARN → plaintext column (DB encrypted at rest),
  mirroring the WhatsApp token pattern. Secrets are write-only over the API.

Key files: `app/services/razorpay_gateway.py`, `app/services/online_payment.py`,
tenant endpoints in `app/api/v1/tenant_portal.py`, owner config in
`app/api/v1/payments.py`, webhook in `app/api/v1/webhooks.py`, migration
`alembic/versions/037_org_razorpay_payments.py`. Web: `PaymentsPage.tsx`
(owner), `PayScreen.tsx` (tenant), `lib/tenant-data/razorpay.ts`.

## One-time platform deploy (already in this branch)

1. **Run the migration** on every environment: `alembic upgrade head` (adds the
   Razorpay columns to `public.organisations`).
2. **CSP** — `infrastructure/prod/Caddyfile` now allows
   `checkout.razorpay.com` (script), `api.razorpay.com` +
   `checkout.razorpay.com` (frame), `*.razorpay.com` (connect). Redeploy Caddy
   so the checkout window isn't blocked.

## Per-owner onboarding (test mode — no KYC needed)

1. Owner creates a free Razorpay account → **Settings → API Keys → Generate
   Test Keys**.
2. In PGManage: **Settings → Payments** → paste **Key ID** + **Key Secret**
   → Save.
3. Copy the **webhook URL** shown on that page
   (`https://pgmanage.in/api/v1/webhooks/razorpay?org=<slug>`) → in Razorpay
   **Settings → Webhooks**, add it for the **`payment.captured`** event, set a
   webhook secret.
4. Paste that **webhook secret** back into Settings → Payments → Save.
5. Toggle **Turn on**. (The toggle refuses to enable without a key id + secret.)

Test the round-trip with Razorpay test instruments (UPI `success@razorpay`,
test cards). A tenant opens the portal → **Pay** → Pay rent now. Confirm the
payment shows in the tenant's history AND in the owner app's Rent & Payments,
and that the webhook fired (Razorpay dashboard → Webhooks → recent deliveries).

## Going live

1. Owner completes Razorpay **KYC** (PAN + bank account) — the only real wait;
   it's on the owner, done in the Razorpay dashboard.
2. Owner swaps the **live** Key ID/Secret into Settings → Payments.
3. Register the **live-mode** webhook (same URL) + live webhook secret; paste it
   in.
4. Keep **Turn on**. Done.

## Troubleshooting

- **Checkout window won't open / CSP error in console** → Caddy CSP not
  redeployed (step 2 above).
- **Webhook 401** → the webhook secret in Razorpay ≠ the one saved in Settings →
  Payments. Re-paste both.
- **Payment succeeded but not showing** → check Razorpay → Webhooks deliveries.
  The verify-callback is best-effort; the webhook is the backstop. A 200 with
  `"created": false` means it was already recorded (idempotent — expected when
  both paths fire).
- **"Online payments are not enabled"** on the tenant order call → owner hasn't
  toggled on, or keys/secret missing.

## Not in v1 (backlog)

- Refunds from the portal (owner-side refund flow already exists; wiring a
  Razorpay refund call is a follow-up).
- Partial rent payments across charge types.
- Mobile tenant app (the mobile tenant portal is still v0 scaffolding).
