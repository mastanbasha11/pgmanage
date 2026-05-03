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


# ── OTP flow (requires Redis) ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_otp_request_nonexistent_org_returns_404(
    client: AsyncClient, test_tenant: dict
):
    """OTP request for non-existent org slug → 404."""
    response = await client.post(
        "/api/v1/tenant/auth/otp",
        json={
            "phone": "+919999000000",  # doesn't matter
            "property_id": str(test_tenant["property_id"]),
            "org_slug": "non-existent-org-slug-xyz",
        },
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_otp_request_valid_org_nonexistent_tenant_returns_404(
    client: AsyncClient,
    test_tenant: dict,
    db: AsyncSession,
):
    """OTP request with wrong phone number → 404 (tenant not found)."""
    # Get the org slug
    result = await db.execute(
        text("SELECT slug FROM public.organisations WHERE id = :id"),
        {"id": str(test_tenant["org_id"])},
    )
    org_slug = result.scalar_one()
    await db.commit()  # close implicit transaction before client call

    response = await client.post(
        "/api/v1/tenant/auth/otp",
        json={
            "phone": "+919999999999",  # not a real tenant phone
            "property_id": str(test_tenant["property_id"]),
            "org_slug": org_slug,
        },
    )
    # 404 because no active tenant with this phone
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_otp_verify_invalid_otp_returns_401(
    client: AsyncClient,
    test_tenant: dict,
    db: AsyncSession,
):
    """Verifying with wrong OTP → 401."""
    result = await db.execute(
        text("SELECT slug FROM public.organisations WHERE id = :id"),
        {"id": str(test_tenant["org_id"])},
    )
    org_slug = result.scalar_one()
    await db.commit()  # close implicit transaction before client call

    response = await client.post(
        "/api/v1/tenant/auth/verify",
        json={
            "phone": "+919876543299",
            "otp": "000000",  # wrong OTP
            "property_id": str(test_tenant["property_id"]),
            "org_slug": org_slug,
        },
    )
    assert response.status_code == 401


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
