"""
Tenant self-service portal tests.
Covers OTP auth (mocked Redis path), tenant profile, ledger, complaints, and announcements.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_tenant_token
from tests.conftest import auth_headers


# ── Portal auth ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_portal_me_requires_auth(client: AsyncClient):
    """Portal /me endpoint needs a token."""
    response = await client.get("/api/v1/tenant/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_staff_token_cannot_use_portal(
    client: AsyncClient, test_owner: dict
):
    """A staff (OWNER) token is rejected by the tenant portal → 403."""
    response = await client.get(
        "/api/v1/tenant/me",
        headers=auth_headers(test_owner["token"]),
    )
    # get_current_tenant rejects non-TENANT roles
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_tenant_portal_me_returns_profile(
    client: AsyncClient, test_tenant: dict, tenant_portal_token: str
):
    """GET /tenant/me returns the tenant's full profile and room info."""
    response = await client.get(
        "/api/v1/tenant/me",
        headers=auth_headers(tenant_portal_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(test_tenant["tenant_id"])
    assert data["name"] == "Test Tenant"
    assert data["phone"] == "+919876543299"
    assert data["bed_label"] == "A"  # Bed A from fixture
    assert data["room_number"] == "101"
    assert data["property_name"] == "Test PG House"


# ── Tenant ledger via portal ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_ledger_via_portal(
    client: AsyncClient, test_tenant: dict, tenant_portal_token: str
):
    """GET /tenant/ledger returns the tenant's own ledger."""
    response = await client.get(
        "/api/v1/tenant/ledger",
        headers=auth_headers(tenant_portal_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "entries" in data
    assert "security_deposit_paise" in data
    assert "advance_paid_paise" in data
    assert data["security_deposit_paise"] == 1400000  # from test_tenant fixture


@pytest.mark.asyncio
async def test_tenant_ledger_shows_generated_entries(
    client: AsyncClient,
    test_tenant: dict,
    test_owner: dict,
    tenant_portal_token: str,
):
    """After ledger generation, tenant sees their rent entries."""
    # Owner generates ledger
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(test_tenant["property_id"]),
            "month": 9,
            "year": 2024,
        },
    )
    response = await client.get(
        "/api/v1/tenant/ledger",
        headers=auth_headers(tenant_portal_token),
    )
    assert response.status_code == 200
    entries = response.json()["entries"]
    months = [e["month"] for e in entries]
    assert 9 in months


# ── Tenant complaints via portal ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_raise_complaint(
    client: AsyncClient, test_tenant: dict, tenant_portal_token: str
):
    """Tenant can raise a complaint from the portal."""
    response = await client.post(
        "/api/v1/tenant/complaints",
        headers=auth_headers(tenant_portal_token),
        json={
            "category": "MAINTENANCE",
            "description": "Light bulb fused in my room.",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "complaint_id" in data
    assert "message" in data


@pytest.mark.asyncio
async def test_tenant_list_own_complaints(
    client: AsyncClient, test_tenant: dict, tenant_portal_token: str
):
    """GET /tenant/complaints returns this tenant's complaints only."""
    # Raise a complaint first
    await client.post(
        "/api/v1/tenant/complaints",
        headers=auth_headers(tenant_portal_token),
        json={
            "category": "CLEANLINESS",
            "description": "Bathroom not cleaned.",
        },
    )
    response = await client.get(
        "/api/v1/tenant/complaints",
        headers=auth_headers(tenant_portal_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) >= 1
    for item in data["items"]:
        assert "id" in item
        assert "category" in item
        assert "status" in item


@pytest.mark.asyncio
async def test_tenant_complaint_has_correct_structure(
    client: AsyncClient, test_tenant: dict, tenant_portal_token: str
):
    """Complaint items include all required fields."""
    await client.post(
        "/api/v1/tenant/complaints",
        headers=auth_headers(tenant_portal_token),
        json={"category": "NOISE", "description": "Loud TV next room."},
    )
    response = await client.get(
        "/api/v1/tenant/complaints",
        headers=auth_headers(tenant_portal_token),
    )
    items = response.json()["items"]
    if items:
        item = items[0]
        assert "id" in item
        assert "category" in item
        assert "description" in item
        assert "status" in item
        assert "created_at" in item


# ── Tenant announcements via portal ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_portal_announcements_empty_initially(
    client: AsyncClient, test_tenant: dict, tenant_portal_token: str
):
    """Tenant sees no announcements when none have been sent."""
    response = await client.get(
        "/api/v1/tenant/announcements",
        headers=auth_headers(tenant_portal_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    # Empty because no SENT announcements exist
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_tenant_sees_sent_all_tenants_announcement(
    client: AsyncClient,
    test_owner: dict,
    test_tenant: dict,
    tenant_portal_token: str,
    db: AsyncSession,
):
    """Tenant sees a SENT announcement targeted to ALL_TENANTS."""
    # Create and manually set to SENT
    create_resp = await client.post(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_tenant["property_id"]),
            "title": "Important Notice",
            "body": "Water off Sunday 9-12.",
        },
    )
    announcement_id = create_resp.json()["id"]

    # Manually mark it as SENT in the DB (since there's no send endpoint)
    schema = test_tenant["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    await db.execute(
        text("UPDATE announcements SET status = 'SENT', sent_at = NOW() WHERE id = :id"),
        {"id": announcement_id},
    )
    await db.commit()

    response = await client.get(
        "/api/v1/tenant/announcements",
        headers=auth_headers(tenant_portal_token),
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) >= 1
    titles = [item["title"] for item in items]
    assert "Important Notice" in titles


# ── OTP flow (phone-first, multi-org safe) ────────────────────────────────────
#
# The new auth flow is:
#   1. POST /tenant/auth/otp { phone }            -> generates code, emails it
#   2. POST /tenant/auth/verify { phone, code }   -> returns JWT (single org)
#                                                    or { ticket, orgs } (multi)
#   3. POST /tenant/auth/select-org { ticket, org_id }  (multi only) -> JWT
#
# Tests below seed public.tenant_identity + tenant_identity_links manually,
# since the test_tenant fixture predates migration 019.
#
# settings.TENANT_OTP_INLINE controls whether /auth/otp returns the code
# inline (pre-WhatsApp/SMS mode) or 409s on no-email. Tests pin the flag
# explicitly per case so they pass regardless of the default.

from app.core.config import settings as _settings


@pytest.fixture
def _otp_inline_off():
    """Force post-launch behaviour (no inline code) for this test."""
    prev = _settings.TENANT_OTP_INLINE
    _settings.TENANT_OTP_INLINE = False
    yield
    _settings.TENANT_OTP_INLINE = prev


@pytest.fixture
def _otp_inline_on():
    """Force pre-launch behaviour (code in response) for this test."""
    prev = _settings.TENANT_OTP_INLINE
    _settings.TENANT_OTP_INLINE = True
    yield
    _settings.TENANT_OTP_INLINE = prev


async def _seed_identity(
    db: AsyncSession,
    *,
    phone: str,
    email: str | None,
    org_id,
    schema_name: str,
    tenant_id,
) -> str:
    """Insert a tenant_identity row + ACTIVE link. Returns the identity id."""
    row = (
        await db.execute(
            text(
                """
                INSERT INTO public.tenant_identity (phone, email)
                VALUES (:p, :e)
                ON CONFLICT (phone) DO UPDATE SET email = EXCLUDED.email
                RETURNING id
                """
            ),
            {"p": phone, "e": email},
        )
    ).scalar_one()
    await db.execute(
        text(
            """
            INSERT INTO public.tenant_identity_links
                (identity_id, org_id, schema_name, tenant_id, status)
            VALUES (:iid, :oid, :sch, :tid, 'ACTIVE')
            ON CONFLICT (identity_id, org_id) DO UPDATE
              SET schema_name = EXCLUDED.schema_name,
                  tenant_id = EXCLUDED.tenant_id,
                  status = 'ACTIVE'
            """
        ),
        {
            "iid": str(row),
            "oid": str(org_id),
            "sch": schema_name,
            "tid": str(tenant_id),
        },
    )
    await db.commit()
    return str(row)


@pytest.mark.asyncio
async def test_otp_request_unknown_phone_does_not_leak(client: AsyncClient):
    """Unknown phone must NOT 404 — we don't want to leak which numbers are
    registered. Response is 200 with delivery:none."""
    r = await client.post(
        "/api/v1/tenant/auth/otp",
        json={"phone": "+919000099991"},
    )
    assert r.status_code == 200
    assert r.json()["delivery"] == "none"


@pytest.mark.asyncio
async def test_otp_request_known_phone_no_email_returns_409_when_inline_off(
    client: AsyncClient, test_tenant: dict, db: AsyncSession, _otp_inline_off
):
    """With inline-mode OFF (post-WhatsApp/SMS), identity without an email
    cannot receive a code → 409."""
    await _seed_identity(
        db,
        phone="+919876543299",
        email=None,
        org_id=test_tenant["org_id"],
        schema_name=test_tenant["schema_name"],
        tenant_id=test_tenant["tenant_id"],
    )
    r = await client.post(
        "/api/v1/tenant/auth/otp",
        json={"phone": "+919876543299"},
    )
    assert r.status_code == 409
    # http_exception_handler unwraps {"error": {...}} envelopes (see
    # app/core/exceptions.py http_exception_handler) — so body is the envelope.
    assert r.json()["error"]["code"] == "NO_DELIVERY_CHANNEL"


@pytest.mark.asyncio
async def test_otp_request_no_email_inline_on_returns_code(
    client: AsyncClient, test_tenant: dict, db: AsyncSession, _otp_inline_on
):
    """Pre-launch (inline ON): no email is fine — the code rides in the
    response so the app can show it on-screen."""
    await _seed_identity(
        db,
        phone="+919876543299",
        email=None,
        org_id=test_tenant["org_id"],
        schema_name=test_tenant["schema_name"],
        tenant_id=test_tenant["tenant_id"],
    )
    r = await client.post(
        "/api/v1/tenant/auth/otp",
        json={"phone": "+919876543299"},
    )
    assert r.status_code == 200
    j = r.json()
    assert j["delivery"] == "inline"
    assert isinstance(j["code"], str) and len(j["code"]) == 6 and j["code"].isdigit()
    assert j["to"] is None  # no email on file
    assert j["email_delivered"] is False


@pytest.mark.asyncio
async def test_otp_request_with_email_inline_off_emails(
    client: AsyncClient, test_tenant: dict, db: AsyncSession, _otp_inline_off
):
    """Post-launch (inline OFF) + email on file → delivery=email."""
    await _seed_identity(
        db,
        phone="+919876543299",
        email="t.tenant@example.com",
        org_id=test_tenant["org_id"],
        schema_name=test_tenant["schema_name"],
        tenant_id=test_tenant["tenant_id"],
    )
    r = await client.post(
        "/api/v1/tenant/auth/otp",
        json={"phone": "+919876543299"},
    )
    assert r.status_code == 200
    j = r.json()
    assert j["delivery"] == "email"
    assert j["to"].endswith("@example.com")
    assert "•" in j["to"]


@pytest.mark.asyncio
async def test_otp_request_with_email_inline_on_returns_code_and_attempts_email(
    client: AsyncClient, test_tenant: dict, db: AsyncSession, _otp_inline_on
):
    """Pre-launch (inline ON) + email on file: code returned inline AND
    the email send is attempted (best-effort)."""
    await _seed_identity(
        db,
        phone="+919876543299",
        email="t.tenant@example.com",
        org_id=test_tenant["org_id"],
        schema_name=test_tenant["schema_name"],
        tenant_id=test_tenant["tenant_id"],
    )
    r = await client.post(
        "/api/v1/tenant/auth/otp",
        json={"phone": "+919876543299"},
    )
    assert r.status_code == 200
    j = r.json()
    assert j["delivery"] == "inline"
    assert len(j["code"]) == 6
    assert j["to"].endswith("@example.com")
    # SMTP isn't configured in tests, so the send call returns False —
    # but the code path was exercised.
    assert "email_delivered" in j


@pytest.mark.asyncio
async def test_otp_verify_invalid_code_returns_401(
    client: AsyncClient, test_tenant: dict, db: AsyncSession
):
    """Wrong code → 401."""
    await _seed_identity(
        db,
        phone="+919876543299",
        email="t.tenant@example.com",
        org_id=test_tenant["org_id"],
        schema_name=test_tenant["schema_name"],
        tenant_id=test_tenant["tenant_id"],
    )
    r = await client.post(
        "/api/v1/tenant/auth/verify",
        json={"phone": "+919876543299", "code": "000000"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_otp_verify_correct_code_returns_jwt_single_org(
    client: AsyncClient, test_tenant: dict, db: AsyncSession
):
    """Single-org tenant: verify returns access_token directly."""
    import redis.asyncio as aioredis

    from app.core.config import settings

    await _seed_identity(
        db,
        phone="+919876543299",
        email="t.tenant@example.com",
        org_id=test_tenant["org_id"],
        schema_name=test_tenant["schema_name"],
        tenant_id=test_tenant["tenant_id"],
    )
    # Inject a known code into Redis directly — saves dealing with SMTP.
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await r.setex("tenant_otp:+919876543299", 60, "123456")
    await r.aclose()

    resp = await client.post(
        "/api/v1/tenant/auth/verify",
        json={"phone": "+919876543299", "code": "123456"},
    )
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert "access_token" in j
    assert j["token_type"] == "bearer"
    assert j["org"]["id"] == str(test_tenant["org_id"])

    # The token works against /tenant/me.
    me = await client.get(
        "/api/v1/tenant/me",
        headers=auth_headers(j["access_token"]),
    )
    assert me.status_code == 200
    assert me.json()["phone"] == "+919876543299"


@pytest.mark.asyncio
async def test_phone_normalisation_strips_country_code(
    client: AsyncClient, test_tenant: dict, db: AsyncSession
):
    """A tenant whose phone is stored as '+919876543299' must be findable
    whether the user types '9876543299', '09876543299', or '919876543299'."""
    import redis.asyncio as aioredis

    from app.core.config import settings

    # Flush rate-limit counters — /tenant/auth/* is capped at 5/min and we
    # make several requests here on the shared testclient IP.
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await r.flushdb()
    await r.aclose()

    await _seed_identity(
        db,
        phone="+919876543299",
        email="t.tenant@example.com",
        org_id=test_tenant["org_id"],
        schema_name=test_tenant["schema_name"],
        tenant_id=test_tenant["tenant_id"],
    )
    for variant in ("9876543299", "09876543299", "919876543299"):
        resp = await client.post("/api/v1/tenant/auth/otp", json={"phone": variant})
        assert resp.status_code == 200, (variant, resp.text)
        # `delivery` is inline (default) or email (when inline is off) —
        # both indicate the phone was successfully resolved to an identity.
        assert resp.json()["delivery"] in {"inline", "email"}, variant


# ── Cross-role isolation ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_token_cannot_call_staff_endpoints(
    client: AsyncClient, tenant_portal_token: str
):
    """Tenant JWT is rejected by staff endpoints → 403."""
    # get_org_context rejects TENANT role
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(tenant_portal_token),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_tenant_token_cannot_create_payments(
    client: AsyncClient, tenant_portal_token: str, test_tenant: dict
):
    """Tenant cannot record payments on the staff API → 403."""
    response = await client.post(
        "/api/v1/payments",
        headers=auth_headers(tenant_portal_token),
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 700000,
            "payment_type": "RENT",
            "payment_mode": "CASH",
        },
    )
    assert response.status_code == 403


# ── KYC: PATCH /tenant/me/kyc ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_me_returns_vehicle_and_kyc_complete_flag(
    client: AsyncClient, tenant_portal_token: str, test_tenant: dict
):
    """/me surfaces vehicle fields + a derived kyc_complete flag the
    resident app uses to decide whether to show the onboarding flow."""
    r = await client.get("/api/v1/tenant/me", headers=auth_headers(tenant_portal_token))
    assert r.status_code == 200
    body = r.json()
    # Vehicle defaults from the migration backfill.
    assert body["vehicle_type"] == "NONE"
    assert body["vehicle_registration"] is None
    # Fixture has name + emergency contact, vehicle answer present → complete.
    assert body["kyc_complete"] is True


@pytest.mark.asyncio
async def test_tenant_kyc_patch_updates_vehicle(
    client: AsyncClient, tenant_portal_token: str
):
    """Resident sets vehicle_type=TWO_WHEELER with a registration."""
    r = await client.patch(
        "/api/v1/tenant/me/kyc",
        headers=auth_headers(tenant_portal_token),
        json={"vehicle_type": "TWO_WHEELER", "vehicle_registration": "KA 01 AB 1234"},
    )
    assert r.status_code == 200
    me = await client.get("/api/v1/tenant/me", headers=auth_headers(tenant_portal_token))
    assert me.json()["vehicle_type"] == "TWO_WHEELER"
    assert me.json()["vehicle_registration"] == "KA 01 AB 1234"


@pytest.mark.asyncio
async def test_tenant_kyc_patch_rejects_vehicle_without_registration(
    client: AsyncClient, tenant_portal_token: str
):
    """TWO_WHEELER / FOUR_WHEELER must include a registration plate."""
    r = await client.patch(
        "/api/v1/tenant/me/kyc",
        headers=auth_headers(tenant_portal_token),
        json={"vehicle_type": "FOUR_WHEELER", "vehicle_registration": "   "},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VEHICLE_REGISTRATION_REQUIRED"


@pytest.mark.asyncio
async def test_tenant_kyc_patch_clears_registration_when_type_none(
    client: AsyncClient, tenant_portal_token: str
):
    """Switching to NONE clears any prior plate (no stale data on the row)."""
    # First set a plate
    await client.patch(
        "/api/v1/tenant/me/kyc",
        headers=auth_headers(tenant_portal_token),
        json={"vehicle_type": "TWO_WHEELER", "vehicle_registration": "KA 01 AB 1234"},
    )
    # Then say "no vehicle"
    r = await client.patch(
        "/api/v1/tenant/me/kyc",
        headers=auth_headers(tenant_portal_token),
        json={"vehicle_type": "NONE"},
    )
    assert r.status_code == 200
    me = await client.get("/api/v1/tenant/me", headers=auth_headers(tenant_portal_token))
    assert me.json()["vehicle_type"] == "NONE"
    assert me.json()["vehicle_registration"] is None


@pytest.mark.asyncio
async def test_tenant_kyc_patch_updates_emergency_contact(
    client: AsyncClient, tenant_portal_token: str
):
    """Emergency contact fields editable via KYC endpoint."""
    r = await client.patch(
        "/api/v1/tenant/me/kyc",
        headers=auth_headers(tenant_portal_token),
        json={
            "emergency_contact_name": "Mom",
            "emergency_contact_phone": "+919000000099",
            "emergency_contact_relation": "Parent",
        },
    )
    assert r.status_code == 200
    me = await client.get("/api/v1/tenant/me", headers=auth_headers(tenant_portal_token))
    assert me.json()["emergency_contact_name"] == "Mom"


@pytest.mark.asyncio
async def test_tenant_kyc_patch_requires_tenant_token(
    client: AsyncClient, test_owner: dict
):
    """Staff token can't hit /tenant/me/kyc → 403."""
    r = await client.patch(
        "/api/v1/tenant/me/kyc",
        headers=auth_headers(test_owner["token"]),
        json={"vehicle_type": "NONE"},
    )
    assert r.status_code == 403
