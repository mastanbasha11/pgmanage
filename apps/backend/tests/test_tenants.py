"""
Tenant management endpoint tests.
Covers check-in, listing, detail, checkout, and ledger.
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


# ── Check-in ───────────────────────────────────────────────────────────────────

def _checkin_payload(bed_id: uuid.UUID, phone: str = "+919876543001") -> dict:
    return {
        "name": "Ravi Kumar",
        "phone": phone,
        "id_type": "AADHAR",
        "id_number": "987654321012",
        "emergency_contact_name": "Meena Kumar",
        "emergency_contact_phone": "+919876543002",
        "emergency_contact_relation": "Spouse",
        "bed_id": str(bed_id),
        "move_in_date": "2024-03-01",
        "rent_plan": {
            "monthly_rent_paise": 700000,
            "security_deposit_paise": 1400000,
            "billing_day": 1,
            "effective_from": "2024-03-01",
        },
    }


@pytest.mark.asyncio
async def test_checkin_tenant_success(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /tenants checks in a tenant into a vacant bed."""
    bed_id = test_property["bed_ids"][0]  # Bed A — vacant
    response = await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        json=_checkin_payload(bed_id),
    )
    assert response.status_code == 201
    data = response.json()
    assert "tenant_id" in data
    assert data["message"] == "Tenant checked in successfully"


@pytest.mark.asyncio
async def test_checkin_tenant_marks_bed_occupied(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """After check-in, the bed status becomes OCCUPIED."""
    bed_id = test_property["bed_ids"][0]
    await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        json=_checkin_payload(bed_id),
    )
    schema = test_property["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    result = await db.execute(text("SELECT status FROM beds WHERE id = :id"), {"id": str(bed_id)})
    status = result.scalar_one()
    assert status == "OCCUPIED"
    await db.commit()  # close implicit transaction before teardown


@pytest.mark.asyncio
async def test_checkin_occupied_bed_returns_409(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Checking in to an already-occupied bed returns 409."""
    occupied_bed_id = test_tenant["bed_id"]
    response = await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        json=_checkin_payload(occupied_bed_id, phone="+919876543003"),
    )
    assert response.status_code == 409
    assert "OCCUPIED" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_checkin_duplicate_phone_same_property_returns_409(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Duplicate phone number in same property → 409."""
    vacant_bed_id = test_tenant["bed_ids"][1]  # Bed B
    # test_tenant already has phone +919876543299 in this property
    response = await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        json=_checkin_payload(vacant_bed_id, phone="+919876543299"),
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_checkin_nonexistent_bed_returns_404(
    client: AsyncClient, test_owner: dict
):
    """Non-existent bed_id → 404."""
    response = await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        json=_checkin_payload(uuid.uuid4()),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_checkin_requires_auth(client: AsyncClient, test_property: dict):
    """Unauthenticated check-in → 401."""
    response = await client.post(
        "/api/v1/tenants",
        json=_checkin_payload(test_property["bed_ids"][0]),
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_checkin_persists_vehicle_when_provided(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Check-in payload accepts vehicle_type + vehicle_registration and
    writes them onto the tenants row."""
    bed_id = test_property["bed_ids"][0]
    payload = {
        **_checkin_payload(bed_id),
        "vehicle_type": "TWO_WHEELER",
        "vehicle_registration": "KA 01 AB 1234",
    }
    response = await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        json=payload,
    )
    assert response.status_code == 201, response.text
    tenant_id = response.json()["tenant_id"]

    schema = test_property["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    row = (
        await db.execute(
            text("SELECT vehicle_type, vehicle_registration FROM tenants WHERE id = :id"),
            {"id": tenant_id},
        )
    ).mappings().fetchone()
    assert row["vehicle_type"] == "TWO_WHEELER"
    assert row["vehicle_registration"] == "KA 01 AB 1234"
    await db.commit()


@pytest.mark.asyncio
async def test_checkin_defaults_vehicle_to_none_when_omitted(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Pre-existing clients that don't send vehicle fields land on NONE."""
    bed_id = test_property["bed_ids"][0]
    response = await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        json=_checkin_payload(bed_id),
    )
    assert response.status_code == 201
    tenant_id = response.json()["tenant_id"]
    schema = test_property["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    row = (
        await db.execute(
            text("SELECT vehicle_type FROM tenants WHERE id = :id"),
            {"id": tenant_id},
        )
    ).mappings().fetchone()
    assert row["vehicle_type"] == "NONE"
    await db.commit()


@pytest.mark.asyncio
async def test_checkin_rejects_invalid_vehicle_type(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Garbage in the vehicle_type field is 422'd by Pydantic, not 500'd by PG."""
    bed_id = test_property["bed_ids"][0]
    payload = {**_checkin_payload(bed_id), "vehicle_type": "ROCKET"}
    response = await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        json=payload,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_checkin_supervisor_can_checkin(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR can check in a tenant (no role restriction)."""
    bed_id = test_property["bed_ids"][0]
    response = await client.post(
        "/api/v1/tenants",
        headers=auth_headers(test_supervisor["token"]),
        json=_checkin_payload(bed_id),
    )
    assert response.status_code == 201


# ── List tenants ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_tenants_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/tenants")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_list_tenants_returns_active(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """GET /tenants returns active tenants."""
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    ids = [t["id"] for t in data["items"]]
    assert str(test_tenant["tenant_id"]) in ids


@pytest.mark.asyncio
async def test_list_tenants_filter_by_property(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """?property_id filter scopes results to that property."""
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_tenant["property_id"])},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert all(
        item["property_name"] == "Test PG House"
        for item in items
    )


@pytest.mark.asyncio
async def test_list_tenants_search_by_name(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """?search filters by tenant name."""
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        params={"search": "Test Tenant"},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) >= 1
    assert any("Test Tenant" in t["name"] for t in items)


@pytest.mark.asyncio
async def test_list_tenants_search_no_match(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """?search with no matching name returns empty list."""
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(test_owner["token"]),
        params={"search": "ZZZNOMATCH999"},
    )
    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.asyncio
async def test_list_tenants_supervisor_sees_own_property(
    client: AsyncClient, test_supervisor: dict, test_tenant: dict
):
    """SUPERVISOR sees tenants only from their assigned property."""
    response = await client.get(
        "/api/v1/tenants",
        headers=auth_headers(test_supervisor["token"]),
        params={"property_id": str(test_tenant["property_id"])},
    )
    assert response.status_code == 200


# ── Get tenant detail ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_tenant_detail(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """GET /tenants/{id} returns full tenant profile with rent plan."""
    response = await client.get(
        f"/api/v1/tenants/{test_tenant['tenant_id']}",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(test_tenant["tenant_id"])
    assert data["name"] == "Test Tenant"
    assert data["phone"] == "+919876543299"
    assert data["active_rent_plan"] is not None
    assert data["active_rent_plan"]["monthly_rent_paise"] == 700000


@pytest.mark.asyncio
async def test_get_tenant_not_found(client: AsyncClient, test_owner: dict):
    """Non-existent tenant → 404."""
    response = await client.get(
        f"/api/v1/tenants/{uuid.uuid4()}",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_tenant_cross_org_returns_404(
    client: AsyncClient, test_owner: dict, db
):
    """Tenant from another org is not visible (multi-tenancy isolation)."""
    # Create another org's tenant ID
    other_tenant_id = uuid.uuid4()
    # test_owner's JWT has a specific org_id. Querying a non-existent tenant
    # in that org's schema returns 404 — the other org's data is not accessible.
    response = await client.get(
        f"/api/v1/tenants/{other_tenant_id}",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 404


# ── Checkout ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_checkout_tenant_success(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """POST /tenants/{id}/checkout checks out an active tenant."""
    response = await client.post(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/checkout",
        headers=auth_headers(test_owner["token"]),
        json={
            "actual_move_out_date": "2024-12-31",
            "final_payment_amount_paise": 0,
            "refund_amount_paise": 0,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Tenant checked out successfully"
    assert data["actual_move_out_date"] == "2024-12-31"


@pytest.mark.asyncio
async def test_checkout_frees_the_bed(
    client: AsyncClient, test_owner: dict, test_tenant: dict, db: AsyncSession
):
    """After checkout, the bed becomes VACANT again."""
    await client.post(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/checkout",
        headers=auth_headers(test_owner["token"]),
        json={"actual_move_out_date": "2024-12-31"},
    )
    schema = test_tenant["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    result = await db.execute(
        text("SELECT status FROM beds WHERE id = :id"),
        {"id": str(test_tenant["bed_id"])},
    )
    assert result.scalar_one() == "VACANT"
    await db.commit()  # close implicit transaction before teardown


@pytest.mark.asyncio
async def test_checkout_twice_returns_409(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Checking out an already checked-out tenant → 409."""
    checkout_body = {"actual_move_out_date": "2024-12-31"}
    await client.post(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/checkout",
        headers=auth_headers(test_owner["token"]),
        json=checkout_body,
    )
    response = await client.post(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/checkout",
        headers=auth_headers(test_owner["token"]),
        json=checkout_body,
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_checkout_nonexistent_tenant_404(
    client: AsyncClient, test_owner: dict
):
    response = await client.post(
        f"/api/v1/tenants/{uuid.uuid4()}/checkout",
        headers=auth_headers(test_owner["token"]),
        json={"actual_move_out_date": "2024-12-31"},
    )
    assert response.status_code == 404


# ── Notice to vacate ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_give_notice_sets_both_dates(
    client: AsyncClient, test_owner: dict, test_tenant: dict, db: AsyncSession
):
    """POST /tenants/{id}/notice stores notice_given_date + expected_move_out_date."""
    tid = test_tenant["tenant_id"]
    response = await client.post(
        f"/api/v1/tenants/{tid}/notice",
        headers=auth_headers(test_owner["token"]),
        json={
            "expected_move_out_date": "2026-07-31",
            "notice_given_date": "2026-06-30",
            "notes": "Got a job in Bangalore",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["notice_given_date"] == "2026-06-30"
    assert body["expected_move_out_date"] == "2026-07-31"

    schema = test_tenant["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    row = (
        await db.execute(
            text(
                "SELECT notice_given_date, expected_move_out_date FROM tenants WHERE id = :id"
            ),
            {"id": str(tid)},
        )
    ).mappings().fetchone()
    assert str(row["notice_given_date"]) == "2026-06-30"
    assert str(row["expected_move_out_date"]) == "2026-07-31"
    await db.commit()


@pytest.mark.asyncio
async def test_give_notice_defaults_to_today_when_unspecified(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Omit notice_given_date → server stamps today; clearing is null=null."""
    tid = test_tenant["tenant_id"]
    response = await client.post(
        f"/api/v1/tenants/{tid}/notice",
        headers=auth_headers(test_owner["token"]),
        json={"expected_move_out_date": "2026-08-15"},
    )
    assert response.status_code == 200
    assert response.json()["notice_given_date"] is not None  # server-filled

    # Clear by passing null vacate date.
    clear = await client.post(
        f"/api/v1/tenants/{tid}/notice",
        headers=auth_headers(test_owner["token"]),
        json={"expected_move_out_date": None},
    )
    assert clear.status_code == 200
    cleared = clear.json()
    assert cleared["notice_given_date"] is None
    assert cleared["expected_move_out_date"] is None


@pytest.mark.asyncio
async def test_give_notice_rejects_non_active_tenant(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    # Check out first.
    await client.post(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/checkout",
        headers=auth_headers(test_owner["token"]),
        json={"actual_move_out_date": "2024-12-31"},
    )
    # Notice on CHECKED_OUT → 409.
    response = await client.post(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/notice",
        headers=auth_headers(test_owner["token"]),
        json={"expected_move_out_date": "2026-07-31"},
    )
    assert response.status_code == 409


# ── Re-check-in ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recheckin_after_checkout_restores_active(
    client: AsyncClient, test_owner: dict, test_tenant: dict, db: AsyncSession
):
    """A CHECKED_OUT tenant can be brought back: same row, new bed + plan."""
    tid = test_tenant["tenant_id"]
    # Check out first.
    co = await client.post(
        f"/api/v1/tenants/{tid}/checkout",
        headers=auth_headers(test_owner["token"]),
        json={"actual_move_out_date": "2024-12-31"},
    )
    assert co.status_code == 200

    # The same bed is now VACANT — we can re-check in onto it.
    bed_id = test_tenant["bed_ids"][0]
    response = await client.post(
        f"/api/v1/tenants/{tid}/recheckin",
        headers=auth_headers(test_owner["token"]),
        json={
            "bed_id": str(bed_id),
            "move_in_date": "2025-01-15",
            "rent_plan": {
                "monthly_rent_paise": 1200000,
                "security_deposit_paise": 500000,
                "advance_paid_paise": 0,
                "billing_day": 1,
                "effective_from": "2025-01-15",
            },
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["tenant_id"] == str(tid)

    # Confirm DB state: tenant ACTIVE with new bed assigned + fresh active rent_plan.
    schema = test_tenant["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    row = (
        await db.execute(
            text(
                "SELECT t.status, t.bed_id, t.actual_move_out_date, b.status AS bed_status "
                "FROM tenants t JOIN beds b ON b.id = t.bed_id WHERE t.id = :id"
            ),
            {"id": str(tid)},
        )
    ).mappings().fetchone()
    assert row["status"] == "ACTIVE"
    assert row["actual_move_out_date"] is None
    assert row["bed_status"] == "OCCUPIED"
    plans = (
        await db.execute(
            text("SELECT count(*) FROM rent_plans WHERE tenant_id = :id AND is_active = true"),
            {"id": str(tid)},
        )
    ).scalar_one()
    assert plans == 1
    await db.commit()


@pytest.mark.asyncio
async def test_recheckin_rejects_active_tenant(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Only CHECKED_OUT tenants can be re-checked-in; ACTIVE → 409."""
    response = await client.post(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/recheckin",
        headers=auth_headers(test_owner["token"]),
        json={
            "bed_id": str(test_tenant["bed_ids"][0]),
            "move_in_date": "2025-01-15",
            "rent_plan": {
                "monthly_rent_paise": 1000000,
                "security_deposit_paise": 0,
                "advance_paid_paise": 0,
                "billing_day": 1,
                "effective_from": "2025-01-15",
            },
        },
    )
    assert response.status_code == 409


# ── Tenant ledger ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_ledger_empty_initially(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """GET /tenants/{id}/ledger returns empty entries for a new tenant."""
    response = await client.get(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/ledger",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert "entries" in data
    assert "total_due_paise" in data
    assert "total_paid_paise" in data
    assert "total_outstanding_paise" in data
    assert data["total_due_paise"] == 0  # no ledger entries yet


@pytest.mark.asyncio
async def test_tenant_ledger_after_generate(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Ledger has entries after generating rent for a month."""
    # Generate ledger
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(test_tenant["property_id"]),
            "month": 5,
            "year": 2024,
        },
    )
    response = await client.get(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/ledger",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["entries"]) >= 1
    assert data["total_due_paise"] == 700000


# ── Document upload URL ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_document_upload_url_tenant_not_found(
    client: AsyncClient, test_owner: dict
):
    """Upload URL for non-existent tenant → 404."""
    response = await client.post(
        f"/api/v1/tenants/{uuid.uuid4()}/documents",
        headers=auth_headers(test_owner["token"]),
        params={"doc_type": "id_document", "filename": "id.jpg"},
    )
    assert response.status_code == 404
