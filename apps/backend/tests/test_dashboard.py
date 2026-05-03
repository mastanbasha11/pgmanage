"""
Financial dashboard endpoint tests.
Covers OWNER-only access, summary KPIs, cashflow, and occupancy trends.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


# ── Dashboard summary ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dashboard_summary_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/dashboard/summary")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_summary_owner_succeeds(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """OWNER can access the financial dashboard summary."""
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(test_property["property_id"]),
            "month": 6,
            "year": 2024,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "gross_rent_expected_paise" in data
    assert "rent_collected_paise" in data
    assert "outstanding_paise" in data
    assert "collection_rate" in data
    assert "total_expenses_paise" in data
    assert "net_income_paise" in data
    assert "occupancy_rate" in data
    assert "active_tenants" in data
    assert data["month"] == 6
    assert data["year"] == 2024


@pytest.mark.asyncio
async def test_dashboard_summary_partner_succeeds(
    client: AsyncClient, test_partner: dict, test_property: dict
):
    """PARTNER can also access the financial dashboard."""
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_partner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_dashboard_summary_supervisor_forbidden(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR is blocked from financial dashboard → 403."""
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_supervisor["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 403
    error = response.json()["error"]
    assert error["code"] in ("AUTHORIZATION_ERROR", "FORBIDDEN")


@pytest.mark.asyncio
async def test_dashboard_summary_without_property_filter(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Summary works without property_id (aggregates all properties)."""
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_owner["token"]),
        params={"month": 6, "year": 2024},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_dashboard_summary_default_month_year(
    client: AsyncClient, test_owner: dict
):
    """Summary uses current month/year when not specified."""
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert "month" in data
    assert "year" in data


@pytest.mark.asyncio
async def test_dashboard_summary_with_tenant_data(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Summary reflects occupancy when tenants exist."""
    # Generate ledger and record payment
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(test_tenant["property_id"]),
            "month": 6,
            "year": 2024,
        },
    )
    response = await client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(test_tenant["property_id"]),
            "month": 6,
            "year": 2024,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["occupancy_rate"] > 0  # at least 1 occupied bed
    assert data["active_tenants"] >= 1


# ── Cashflow ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cashflow_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/dashboard/cashflow")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_cashflow_owner_succeeds(
    client: AsyncClient, test_owner: dict
):
    """OWNER can view cashflow chart."""
    response = await client.get(
        "/api/v1/dashboard/cashflow",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "months" in data
    assert data["months"] == 12  # default
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_cashflow_supervisor_forbidden(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot view cashflow → 403."""
    response = await client.get(
        "/api/v1/dashboard/cashflow",
        headers=auth_headers(test_supervisor["token"]),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cashflow_custom_months_param(
    client: AsyncClient, test_owner: dict
):
    """?months param controls how many months of data to return."""
    response = await client.get(
        "/api/v1/dashboard/cashflow",
        headers=auth_headers(test_owner["token"]),
        params={"months": 6},
    )
    assert response.status_code == 200
    assert response.json()["months"] == 6


@pytest.mark.asyncio
async def test_cashflow_months_exceeds_max_returns_422(
    client: AsyncClient, test_owner: dict
):
    """months > 24 → 422 validation error."""
    response = await client.get(
        "/api/v1/dashboard/cashflow",
        headers=auth_headers(test_owner["token"]),
        params={"months": 25},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_cashflow_data_structure(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Cashflow data items have correct fields when payment exists."""
    # Record a payment
    await client.post(
        "/api/v1/payments",
        headers={
            **auth_headers(test_owner["token"]),
            "X-Idempotency-Key": str(uuid.uuid4()),
        },
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 700000,
            "payment_type": "RENT",
            "payment_mode": "UPI",
        },
    )
    response = await client.get(
        "/api/v1/dashboard/cashflow",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()["data"]
    if data:
        for item in data:
            assert "year" in item
            assert "month" in item
            assert "income_paise" in item
            assert "expense_paise" in item
            assert "net_paise" in item


# ── Occupancy trend ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_occupancy_trend_owner_succeeds(
    client: AsyncClient, test_owner: dict
):
    """OWNER can view occupancy trend."""
    response = await client.get(
        "/api/v1/dashboard/occupancy-trend",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_occupancy_trend_supervisor_forbidden(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot view occupancy trend → 403."""
    response = await client.get(
        "/api/v1/dashboard/occupancy-trend",
        headers=auth_headers(test_supervisor["token"]),
    )
    assert response.status_code == 403


# ── Recent activity ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recent_activity_owner_succeeds(
    client: AsyncClient, test_owner: dict
):
    """OWNER can view recent activity feed."""
    response = await client.get(
        "/api/v1/dashboard/recent-activity",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_recent_activity_supervisor_forbidden(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot view recent activity → 403."""
    response = await client.get(
        "/api/v1/dashboard/recent-activity",
        headers=auth_headers(test_supervisor["token"]),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_recent_activity_includes_payments(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Recent activity shows payments after recording."""
    await client.post(
        "/api/v1/payments",
        headers={
            **auth_headers(test_owner["token"]),
            "X-Idempotency-Key": str(uuid.uuid4()),
        },
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 350000,
            "payment_type": "RENT",
            "payment_mode": "CASH",
        },
    )
    response = await client.get(
        "/api/v1/dashboard/recent-activity",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    items = response.json()["items"]
    types = [item["type"] for item in items]
    assert "PAYMENT" in types


@pytest.mark.asyncio
async def test_recent_activity_limit_param(
    client: AsyncClient, test_owner: dict
):
    """?limit param controls activity count."""
    response = await client.get(
        "/api/v1/dashboard/recent-activity",
        headers=auth_headers(test_owner["token"]),
        params={"limit": 5},
    )
    assert response.status_code == 200
    assert len(response.json()["items"]) <= 5


@pytest.mark.asyncio
async def test_recent_activity_limit_exceeds_max_returns_422(
    client: AsyncClient, test_owner: dict
):
    """limit > 50 → 422."""
    response = await client.get(
        "/api/v1/dashboard/recent-activity",
        headers=auth_headers(test_owner["token"]),
        params={"limit": 100},
    )
    assert response.status_code == 422
