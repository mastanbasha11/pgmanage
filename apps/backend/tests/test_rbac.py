"""
RBAC (Role-Based Access Control) tests — the most critical correctness tests.
Validates that every role can only access what it's supposed to.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


# ── Authentication ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_request_returns_401(client: AsyncClient):
    """No token → 401 on all protected endpoints."""
    for path in [
        "/api/v1/tenants",
        "/api/v1/properties",
        "/api/v1/payments",
        "/api/v1/expenses",
        "/api/v1/leads",
        "/api/v1/dashboard/summary",
    ]:
        response = await client.get(path)
        assert response.status_code == 401, f"Expected 401 for {path}"


@pytest.mark.asyncio
async def test_invalid_token_returns_401(client: AsyncClient):
    """Tampered JWT → 401."""
    response = await client.get(
        "/api/v1/tenants",
        headers={"Authorization": "Bearer totally.invalid.token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_missing_bearer_scheme_returns_401(client: AsyncClient):
    """Token without 'Bearer' prefix → 401."""
    response = await client.get(
        "/api/v1/tenants",
        headers={"Authorization": "justtoken"},
    )
    assert response.status_code == 401


# ── Financial dashboard (OWNER/PARTNER only) ───────────────────────────────────

@pytest.mark.asyncio
async def test_supervisor_cannot_access_financial_dashboard(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR must receive 403 on financial dashboard."""
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_supervisor["token"]),
        params={"property_id": str(test_supervisor["property_id"])},
    )
    assert response.status_code == 403
    error = response.json()["error"]
    assert error["code"] in ("AUTHORIZATION_ERROR", "FORBIDDEN")


@pytest.mark.asyncio
async def test_owner_can_access_financial_dashboard(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """OWNER can access financial dashboard."""
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_supervisor_cannot_access_cashflow(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot see cashflow chart → 403."""
    response = await client.get(
        "/api/v1/dashboard/cashflow",
        headers=auth_headers(test_supervisor["token"]),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_supervisor_cannot_access_recent_activity(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot see recent activity feed → 403."""
    response = await client.get(
        "/api/v1/dashboard/recent-activity",
        headers=auth_headers(test_supervisor["token"]),
    )
    assert response.status_code == 403


# ── Property creation (OWNER/PARTNER only) ────────────────────────────────────

@pytest.mark.asyncio
async def test_supervisor_cannot_create_properties(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot create properties → 403."""
    response = await client.post(
        "/api/v1/properties",
        headers=auth_headers(test_supervisor["token"]),
        json={
            "name": "Blocked PG",
            "address_line1": "Test St",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
        },
    )
    assert response.status_code == 403


# ── Ledger generation (OWNER/PARTNER only) ────────────────────────────────────

@pytest.mark.asyncio
async def test_supervisor_cannot_generate_ledger(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR cannot generate rent ledger → 403."""
    response = await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_supervisor["token"]),
        params={
            "property_id": str(test_supervisor["property_id"]),
            "month": 1,
            "year": 2024,
        },
    )
    assert response.status_code == 403


# ── Expense approval (OWNER/PARTNER/PROPERTY_MANAGER only) ────────────────────

@pytest.mark.asyncio
async def test_supervisor_cannot_approve_expenses(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot approve expenses → 403."""
    response = await client.patch(
        f"/api/v1/expenses/{uuid.uuid4()}/approve",
        headers=auth_headers(test_supervisor["token"]),
        json={"approved": True},
    )
    assert response.status_code == 403


# ── Staff invite (OWNER/PARTNER only) ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_supervisor_cannot_invite_staff(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot invite staff → 403."""
    response = await client.post(
        "/api/v1/auth/staff/invite",
        headers=auth_headers(test_supervisor["token"]),
        json={"phone": "+919876543300", "name": "Staff", "role": "SUPERVISOR"},
    )
    assert response.status_code == 403


# ── Actions that ALL authenticated staff can do ───────────────────────────────

@pytest.mark.asyncio
async def test_owner_can_list_tenants(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """OWNER can list tenants."""
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    assert "items" in response.json()


@pytest.mark.asyncio
async def test_supervisor_can_list_tenants(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR can list tenants for their property."""
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(test_supervisor["token"]),
        params={"property_id": str(test_supervisor["property_id"])},
    )
    assert response.status_code == 200
    assert "items" in response.json()


@pytest.mark.asyncio
async def test_supervisor_can_record_payment(
    client: AsyncClient, test_supervisor: dict, test_tenant: dict
):
    """SUPERVISOR can record payments."""
    response = await client.post(
        "/api/v1/payments",
        headers={
            **auth_headers(test_supervisor["token"]),
            "X-Idempotency-Key": str(uuid.uuid4()),
        },
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 700000,
            "payment_type": "RENT",
            "payment_mode": "CASH",
            "for_month": 1,
            "for_year": 2024,
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_supervisor_can_list_payments(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR can list payments."""
    response = await client.get(
        "/api/v1/payments",
        headers=auth_headers(test_supervisor["token"]),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_supervisor_can_create_leads(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR can create leads."""
    response = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_supervisor["token"]),
        json={
            "property_id": str(test_supervisor["property_id"]),
            "name": "New Lead",
            "phone": "+919876543400",
            "source": "WALKIN",
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_supervisor_can_submit_expense(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR can submit expenses (pending approval)."""
    response = await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_supervisor["token"]),
        json={
            "property_id": str(test_supervisor["property_id"]),
            "category_id": str(test_property["category_id"]),
            "amount_paise": 25000,
            "purchase_date": "2024-06-15",
        },
    )
    assert response.status_code == 201
    assert response.json()["approval_status"] == "PENDING"


# ── Tenant portal role isolation ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_token_rejected_by_staff_endpoints(
    client: AsyncClient, tenant_portal_token: str
):
    """Tenant JWT is blocked by staff endpoints → 403."""
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(tenant_portal_token),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "AUTHORIZATION_ERROR"


@pytest.mark.asyncio
async def test_staff_token_rejected_by_tenant_portal(
    client: AsyncClient, test_owner: dict
):
    """Staff JWT is blocked by tenant portal → 403."""
    response = await client.get(
        "/api/v1/tenant/me",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 403


# ── Error response format ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_403_error_response_format(
    client: AsyncClient, test_supervisor: dict
):
    """403 responses follow the standard error format."""
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_supervisor["token"]),
    )
    assert response.status_code == 403
    data = response.json()
    assert "error" in data
    assert "code" in data["error"]
    assert "message" in data["error"]
