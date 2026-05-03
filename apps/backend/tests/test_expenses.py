"""
Expense management endpoint tests.
Covers creation, approval workflow, filtering, categories, and RBAC.
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


# ── Expense payload helper ─────────────────────────────────────────────────────

def _expense_payload(
    property_id: uuid.UUID,
    category_id: uuid.UUID,
    amount_paise: int = 50000,
    purchase_date: str = "2024-06-15",
) -> dict:
    return {
        "property_id": str(property_id),
        "category_id": str(category_id),
        "amount_paise": amount_paise,
        "description": "Plumber visit",
        "vendor_name": "Ravi Plumbing",
        "purchase_date": purchase_date,
        "payment_mode": "CASH",
    }


# ── Create expense ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_expense_requires_auth(client: AsyncClient):
    response = await client.post("/api/v1/expenses", json={})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_owner_creates_expense_auto_approved(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """OWNER's expense is auto-approved immediately."""
    response = await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    assert response.status_code == 201
    data = response.json()
    assert "expense_id" in data
    assert data["approval_status"] == "APPROVED"


@pytest.mark.asyncio
async def test_partner_creates_expense_auto_approved(
    client: AsyncClient, test_partner: dict, test_property: dict
):
    """PARTNER's expense is also auto-approved."""
    response = await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_partner["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    assert response.status_code == 201
    assert response.json()["approval_status"] == "APPROVED"


@pytest.mark.asyncio
async def test_supervisor_creates_expense_pending_approval(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR's expense goes to PENDING status."""
    response = await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_supervisor["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    assert response.status_code == 201
    assert response.json()["approval_status"] == "PENDING"


# ── List expenses ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_expenses_empty_initially(
    client: AsyncClient, test_owner: dict
):
    response = await client.get(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_list_expenses_after_create(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Expenses appear in list after creation."""
    await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    response = await client.get(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    assert response.json()["total"] >= 1


@pytest.mark.asyncio
async def test_list_expenses_filter_by_property(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """?property_id filter scopes results."""
    await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    response = await client.get(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    assert response.json()["total"] >= 1


@pytest.mark.asyncio
async def test_list_expenses_filter_by_approval_status(
    client: AsyncClient,
    test_owner: dict,
    test_supervisor: dict,
    test_property: dict,
):
    """?approval_status=PENDING returns only pending expenses."""
    # Create one pending (supervisor)
    await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_supervisor["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    response = await client.get(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
        params={"approval_status": "PENDING"},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert all(item["approval_status"] == "PENDING" for item in items)


@pytest.mark.asyncio
async def test_list_expenses_filter_by_date_range(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """?start_date and ?end_date filter by purchase date."""
    await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
        json=_expense_payload(
            test_property["property_id"],
            test_property["category_id"],
            purchase_date="2024-06-15",
        ),
    )
    response = await client.get(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
        params={"start_date": "2024-06-01", "end_date": "2024-06-30"},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    # All returned expenses should be in June 2024
    for item in items:
        d = item["purchase_date"]
        assert d.startswith("2024-06")


# ── Expense summary ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_expense_summary_by_category(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /expenses/summary returns per-category breakdown."""
    # Create two approved expenses
    for i in range(2):
        await client.post(
            "/api/v1/expenses",
            headers=auth_headers(test_owner["token"]),
            json=_expense_payload(
                test_property["property_id"],
                test_property["category_id"],
                amount_paise=50000,
                purchase_date=f"2024-07-{10 + i}",
            ),
        )
    response = await client.get(
        "/api/v1/expenses/summary",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(test_property["property_id"]),
            "start_date": "2024-07-01",
            "end_date": "2024-07-31",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "by_category" in data
    assert "total_paise" in data
    assert data["total_paise"] == 100000  # 2 × 50000
    assert len(data["by_category"]) >= 1
    for cat in data["by_category"]:
        assert "percentage" in cat


# ── Approve / reject expense ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_approve_pending_expense(
    client: AsyncClient,
    test_owner: dict,
    test_supervisor: dict,
    test_property: dict,
):
    """OWNER can approve a PENDING expense."""
    # Supervisor creates a pending expense
    create_resp = await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_supervisor["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    expense_id = create_resp.json()["expense_id"]

    # Owner approves it
    response = await client.patch(
        f"/api/v1/expenses/{expense_id}/approve",
        headers=auth_headers(test_owner["token"]),
        json={"approved": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_reject_expense_with_reason(
    client: AsyncClient,
    test_owner: dict,
    test_supervisor: dict,
    test_property: dict,
):
    """OWNER can reject with a reason."""
    create_resp = await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_supervisor["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    expense_id = create_resp.json()["expense_id"]

    response = await client.patch(
        f"/api/v1/expenses/{expense_id}/approve",
        headers=auth_headers(test_owner["token"]),
        json={"approved": False, "rejection_reason": "Insufficient documentation"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "REJECTED"


@pytest.mark.asyncio
async def test_reject_expense_without_reason_returns_400(
    client: AsyncClient,
    test_owner: dict,
    test_supervisor: dict,
    test_property: dict,
):
    """Rejecting without reason → 400."""
    create_resp = await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_supervisor["token"]),
        json=_expense_payload(test_property["property_id"], test_property["category_id"]),
    )
    expense_id = create_resp.json()["expense_id"]

    response = await client.patch(
        f"/api/v1/expenses/{expense_id}/approve",
        headers=auth_headers(test_owner["token"]),
        json={"approved": False},  # no rejection_reason
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_supervisor_cannot_approve_expense(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR cannot approve expenses → 403."""
    response = await client.patch(
        f"/api/v1/expenses/{uuid.uuid4()}/approve",
        headers=auth_headers(test_supervisor["token"]),
        json={"approved": True},
    )
    assert response.status_code == 403


# ── Expense categories ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_expense_categories(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /expense-categories returns categories for a property."""
    response = await client.get(
        "/api/v1/expense-categories",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    # One category was seeded in test_property fixture
    assert len(data["items"]) >= 1
    cat = data["items"][0]
    assert "id" in cat
    assert "name" in cat
    assert "icon_name" in cat


@pytest.mark.asyncio
async def test_list_expense_categories_requires_property_id(
    client: AsyncClient, test_owner: dict
):
    """Missing property_id → 422."""
    response = await client.get(
        "/api/v1/expense-categories",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 422
