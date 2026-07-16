"""
MARKETING role — allow-list + deny-list smoke test.

A MARKETING rep exists to run the sales/onboarding funnel: capture
leads, work them through the pipeline, check in tenants when they
convert. They must be locked OUT of every financial + settings surface
(payments, refunds, expense approval, staff management, WhatsApp/Meta
settings, ROI, audit logs, etc.) so a leaked/compromised MARKETING
token stays scoped to sales operations.

Tests are grouped:
- `test_marketing_allowlist_*` → hit an endpoint we DO want them to
  reach; assert 2xx.
- `test_marketing_denylist_*`  → hit an endpoint they must NOT reach;
  assert 403 (via require_roles) or 401.

Add a case here whenever you add a new endpoint that touches money,
settings, or configuration — that way the guard test surface grows
with the surface it's guarding.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


# ── Allow-list ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_marketing_can_create_lead(
    client: AsyncClient, test_marketing: dict, test_property: dict
):
    resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_marketing["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "name": "Meta-ad prospect",
            "phone": "+919000000101",
            "source": "META_AD",
            "notes": "Interested in single AC",
        },
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_marketing_can_list_leads_and_pipeline_stats(
    client: AsyncClient, test_marketing: dict
):
    leads = await client.get(
        "/api/v1/leads", headers=auth_headers(test_marketing["token"])
    )
    assert leads.status_code == 200
    stats = await client.get(
        "/api/v1/leads/pipeline-stats", headers=auth_headers(test_marketing["token"])
    )
    assert stats.status_code == 200


@pytest.mark.asyncio
async def test_marketing_can_list_tenants_and_vacant_beds(
    client: AsyncClient, test_marketing: dict, test_property: dict
):
    tenants = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(test_marketing["token"]),
    )
    assert tenants.status_code == 200

    beds = await client.get(
        f"/api/v1/properties/{test_property['property_id']}/vacant-beds",
        headers=auth_headers(test_marketing["token"]),
    )
    assert beds.status_code == 200


@pytest.mark.asyncio
async def test_marketing_can_move_lead_through_pipeline(
    client: AsyncClient, test_marketing: dict, test_property: dict
):
    """Full drag-to-BOOKED flow: create → PATCH status transitions."""
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_marketing["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "name": "Pipeline mover",
            "phone": "+919000000102",
            "source": "WALKIN",
        },
    )
    lead_id = create.json()["lead_id"]
    for target in ("CONTACTED", "SITE_VISITED", "NEGOTIATING", "BOOKED"):
        patch = await client.patch(
            f"/api/v1/leads/{lead_id}",
            headers=auth_headers(test_marketing["token"]),
            json={"status": target},
        )
        assert patch.status_code == 200, (target, patch.text)


# ── Deny-list ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_marketing_cannot_create_staff(
    client: AsyncClient, test_marketing: dict
):
    """Only OWNER/PARTNER can invite team members."""
    resp = await client.post(
        "/api/v1/auth/staff",
        headers=auth_headers(test_marketing["token"]),
        json={
            "name": "Should be blocked",
            "email": "blocked@test.com",
            "phone": "+919000000201",
            "password": "password123",
            "role": "SUPERVISOR",
        },
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_marketing_cannot_change_settlement_day(
    client: AsyncClient, test_marketing: dict, test_property: dict
):
    """Settlement day drives every billing cycle — OWNER/PARTNER only."""
    resp = await client.patch(
        f"/api/v1/properties/{test_property['property_id']}/settlement-day",
        headers=auth_headers(test_marketing["token"]),
        json={"settlement_day": 5},
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_marketing_cannot_edit_whatsapp_settings(
    client: AsyncClient, test_marketing: dict, test_property: dict
):
    """WhatsApp Cloud API tokens are a security-sensitive surface — no MARKETING."""
    resp = await client.patch(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_marketing["token"]),
        json={"whatsapp_number": "+919000000000"},
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_marketing_cannot_edit_payback_plan(
    client: AsyncClient, test_marketing: dict, test_property: dict
):
    """ROI is a strategic financial view — OWNER/PARTNER only."""
    resp = await client.put(
        f"/api/v1/properties/{test_property['property_id']}/payback-plan",
        headers=auth_headers(test_marketing["token"]),
        json={
            "investment_paise": 100_00_000_00,
            "target_months": 18,
            "grace_months": 2,
            "lessor_rent_paise": 4_00_000_00,
        },
    )
    assert resp.status_code == 403, resp.text
