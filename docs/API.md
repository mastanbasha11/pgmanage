# PGManage API

REST API for the PGManage multi-tenant PG/hostel management platform.

- **Base URL (prod):** `https://pgmanage.in`
- **Base URL (local):** `http://localhost:8000`
- **API prefix:** `/api/v1` (owner/staff + tenant), `/api/platform` (platform admin)
- **Content type:** `application/json` unless noted (uploads use `multipart/form-data`)

## Interactive docs

The backend auto-generates an OpenAPI 3 spec; these are served by FastAPI:

| What | URL | Notes |
|------|-----|-------|
| Swagger UI | `https://pgmanage.in/api/docs` | Try-it-out console |
| ReDoc | `https://pgmanage.in/api/redoc` | Readable reference |
| OpenAPI JSON | `https://pgmanage.in/api/openapi.json` | Machine-readable spec |
| Health check | `https://pgmanage.in/health` | `{"status": "ok"}` |

> **Can't see Swagger / ReDoc?** The HTML loads fine, but Swagger UI and ReDoc
> pull their JS/CSS from `cdn.jsdelivr.net`. If that CDN is blocked on your
> network (corporate proxy, ISP filter, ad-blocker), the page renders blank even
> though the server responded `200`. Two workarounds:
> 1. Use the raw spec — it needs no CDN: `curl https://pgmanage.in/api/openapi.json`
>    (also saved in this repo at [`docs/openapi.json`](./openapi.json)). Import it
>    into Postman/Insomnia/Bruno or any OpenAPI viewer.
> 2. View it offline: open the saved `openapi.json` in an editor with an OpenAPI
>    preview, or run `npx @redocly/cli preview-docs docs/openapi.json`.
>
> A permanent fix (self-hosting the Swagger assets so no CDN is needed) is a
> tracked follow-up.

A snapshot of the live spec is checked in at [`docs/openapi.json`](./openapi.json)
— regenerate it with:

```bash
curl -s https://pgmanage.in/api/openapi.json -o docs/openapi.json   # prod
# or, against a local server:
curl -s http://localhost:8000/api/openapi.json -o docs/openapi.json
```

## Authentication

All protected endpoints use a **JWT bearer token**:

```
Authorization: Bearer <access_token>
```

There are **three separate audiences** — tokens are not interchangeable:

| Audience | How you log in | Roles | Endpoints |
|----------|----------------|-------|-----------|
| Owner / staff app | `POST /api/v1/auth/login` (email + password) or phone OTP | `OWNER`, `PARTNER`, `SUPERVISOR` | most of `/api/v1/*` |
| Tenant portal | `POST /api/v1/tenant/auth/otp` → `POST /api/v1/tenant/auth/verify` (phone OTP) | `TENANT` | `/api/v1/tenant/*` |
| Platform admin | `POST /api/platform/admin/auth/login` | `PLATFORM_ADMIN` | `/api/platform/*` |

Tokens are HS256 in dev, RS256 in prod. Access tokens are short-lived; refresh
with `POST /api/v1/auth/refresh`. The web client auto-refreshes on `401` and
replays the request.

### Log in (owner/staff)

```bash
curl -X POST https://pgmanage.in/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "owner@example.com", "password": "••••••••"}'
# → { "access_token": "...", "refresh_token": "...", "token_type": "bearer" }
```

### Call an authenticated endpoint

```bash
TOKEN="paste-access-token-here"
curl https://pgmanage.in/api/v1/properties \
  -H "Authorization: Bearer $TOKEN"
```

### Tenant portal login (OTP)

```bash
curl -X POST https://pgmanage.in/api/v1/tenant/auth/otp \
  -H 'Content-Type: application/json' -d '{"phone": "+919876543210"}'

curl -X POST https://pgmanage.in/api/v1/tenant/auth/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone": "+919876543210", "otp": "123456"}'
```

## Conventions

- **Money is integer paise** — every `*_paise` field is an integer; 100 paise = ₹1.
  Never send floats.
- **Timezone is `Asia/Kolkata`.** Dates are `YYYY-MM-DD`, timestamps are ISO-8601.
- **Multi-tenancy is implicit.** Your JWT scopes every request to your
  organisation; you never pass an org id. `OWNER`/`PARTNER` see all properties,
  other roles are limited to their assigned `property_ids`.
- **Wire format for some payloads is camelCase** (e.g. the public website-lead
  form: `roomType`, `moveInDate`, `propertyId`).
- **Payment writes are idempotent** — pass a stable idempotency key.

### Error shape

Errors return a consistent envelope with the appropriate HTTP status:

```json
{ "error": { "code": "NOT_FOUND", "message": "Tenant not found", "details": null } }
```

Common codes: `NOT_FOUND` (404), `CONFLICT` (409), `UNAUTHORIZED` (401),
`FORBIDDEN` (403), `VALIDATION_ERROR` (422), `IDEMPOTENCY_ERROR` (409).

### Rate limits

- General: 60 requests/min per client.
- Strict (5/min): `/auth/login`, `/auth/otp/*`, `/tenant/auth/*`.
- Public website-lead intake: 10 submissions per IP per hour.

Exceeding a limit returns `429 Too Many Requests`.

## Public endpoint (no auth)

### `POST /api/v1/leads/website` — website booking-form intake

A PG owner embeds a booking form on their own site; it POSTs here with the
org's **public site token** (a routing key that ships in the site's JS — not a
secret). The lead lands in that org under Leads with `source = WEBSITE`.

```bash
curl -X POST "https://pgmanage.in/api/v1/leads/website?token=PUBLIC_SITE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "name": "Asha R",
        "email": "asha@example.com",
        "phone": "+919876543210",
        "roomType": "Single AC",
        "moveInDate": "2026-06-01",
        "propertyId": null,
        "message": "Looking for a bed from June."
      }'
# → { "success": true, "leadId": "…" }
```

Protections: token routing, per-owner CORS allowlist (browser-only), 10/IP/hour
rate limit, payload validation. Get your token + embed snippet from
`GET /api/v1/website/integration`.

## Endpoint map

Grouped by domain (84 paths total). See `openapi.json` / Swagger for full
request and response schemas.

### Auth — `/api/v1/auth`
`POST /signup` · `POST /login` · `GET /me` · `POST /refresh` ·
`POST /forgot-password` · `POST /reset-password` ·
`POST /otp/request` · `POST /otp/verify` · `GET /approve` ·
`GET /staff` · `POST /staff` · `POST /staff/invite` ·
`PATCH /staff/{user_id}/deactivate`

### Properties & building — `/api/v1/properties`, `/floors`, `/rooms`, `/room-types`, `/beds`
Properties CRUD; `GET /{id}/occupancy`, `/stats`, `/vacant-beds`,
`/room-types`, `/rooms`, `/floors`; per-month billing period
(`/{id}/billing-period/{year}/{month}` GET/PUT/DELETE) and
`PATCH /{id}/settlement-day`. Floors/rooms/room-types/beds have their own
PATCH/DELETE routes; `GET /rooms/{id}` returns beds; `PATCH /beds/{id}/status`
blocks/unblocks a bed.

### Tenants — `/api/v1/tenants`
`POST /` (check-in) · `GET /` · `GET /{id}` · `PATCH /{id}` ·
`POST /{id}/checkout` · `POST /{id}/refund` ·
`GET /{id}/ledger` · ID-proof upload/stream/delete (`/{id}/id-proof`) ·
document upload URL (`/{id}/documents`) · bulk import
(`POST /bulk-import`, `GET /import/sample.csv`).

### Rent & payments — `/api/v1/rent`, `/api/v1/payments`
`POST /rent/generate-ledger` · `GET /rent/ledger` · `GET /rent/overdue` ·
`POST /payments` · `GET /payments`.

### Expenses — `/api/v1/expenses`, `/api/v1/expense-categories`
CRUD + `GET /summary`; approval (`PATCH /{id}/approve`); receipt
upload/stream/delete (`/{id}/receipt`); S3 presign (`POST /upload-url`);
`GET /expense-categories`.

### Leads & CRM — `/api/v1/leads`
`POST /` · `GET /` · `GET /{id}` · `PATCH /{id}` ·
`GET /due-today` · `GET /pipeline-stats` ·
`POST /{id}/activities` · `POST /{id}/convert` ·
`POST /website` (public, see above).

### Bookings — `/api/v1/bookings`
`POST /` · `GET /` · `PATCH /{id}` · `DELETE /{id}` (soft).

### Dashboard — `/api/v1/dashboard`
`GET /summary` (KPIs) · `GET /cashflow` · `GET /occupancy-trend` ·
`GET /recent-activity`. (Owner-only.)

### Communications — `/api/v1/announcements`, `/api/v1/complaints`
Announcements `POST`/`GET`; complaints `POST`/`GET`/`PATCH /{id}`.

### Audit — `/api/v1/audit-logs`
`GET /` (filtered, paginated feed) · `GET /summary` (per-staff counts, 30d) ·
`GET /tenant/{tenant_id}` (one tenant's full timeline).

### Website integration — `/api/v1/website/integration`
`GET` (token + webhook URL + embed snippet) · `PATCH` (settings).

### Tenant portal — `/api/v1/tenant`
`POST /auth/otp` · `POST /auth/verify` · `GET /me` · `GET /ledger` ·
`GET /announcements` · `GET /complaints` · `POST /complaints`.

### Webhooks (external callers) — `/api/v1/webhooks`
`POST /stripe` · `POST /meta-lead` · `GET /whatsapp` (verify) ·
`POST /whatsapp` (inbound).

### Platform admin — `/api/platform/admin`
`POST /auth/login` · `GET /metrics` · `GET /orgs` · `GET /orgs/{id}` ·
`PATCH /orgs/{id}/suspend` · `PATCH /orgs/{id}/reactivate`.

---

*Generated from the live OpenAPI spec (`PGManage API`, 84 paths). To refresh
this map after API changes, re-pull `openapi.json` (command above) and update
the groups here.*
