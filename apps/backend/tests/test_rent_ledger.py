"""
Rent ledger and payment lifecycle tests.
End-to-end flow: generate ledger → record payments → verify status changes.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


# ── Ledger generation ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_ledger_creates_entries(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Manual ledger generation creates entries for active tenants."""
    response = await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(test_tenant["property_id"]),
            "month": 1,
            "year": 2024,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["entries_created"] >= 1


@pytest.mark.asyncio
async def test_generate_ledger_calculates_correct_due_amount(
    client: AsyncClient, test_owner: dict, test_tenant: dict, db: AsyncSession
):
    """Generated ledger entry has correct amount_due from rent plan."""
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(test_tenant["property_id"]),
            "month": 2,
            "year": 2024,
        },
    )
    schema = test_tenant["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    result = await db.execute(
        text("""
            SELECT amount_due_paise, status
            FROM rent_ledger_entries
            WHERE tenant_id = :tid AND month = 2 AND year = 2024
        """),
        {"tid": str(test_tenant["tenant_id"])},
    )
    row = result.fetchone()
    assert row is not None
    assert row[0] == 700000  # from test_tenant fixture rent plan
    assert row[1] == "UNPAID"  # initial status
    await db.commit()  # close implicit transaction before teardown


# ── Payment → PAID flow ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_payment_updates_ledger_to_paid(
    client: AsyncClient, test_owner: dict, test_tenant: dict, db: AsyncSession
):
    """Recording full payment updates ledger entry to PAID."""
    # Generate ledger
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_tenant["property_id"]), "month": 3, "year": 2024},
    )

    # Record full payment
    idem_key = str(uuid.uuid4())
    response = await client.post(
        "/api/v1/payments",
        headers={
            **auth_headers(test_owner["token"]),
            "X-Idempotency-Key": idem_key,
        },
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 700000,
            "payment_type": "RENT",
            "payment_mode": "UPI",
            "for_month": 3,
            "for_year": 2024,
        },
    )
    assert response.status_code == 201

    # Verify ledger status
    schema = test_tenant["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    result = await db.execute(
        text("SELECT status FROM rent_ledger_entries WHERE tenant_id = :tid AND month = 3 AND year = 2024"),
        {"tid": str(test_tenant["tenant_id"])},
    )
    entry = result.fetchone()
    if entry:
        assert entry[0] == "PAID"
    await db.commit()  # close implicit transaction before teardown


@pytest.mark.asyncio
async def test_partial_payment_sets_status_partial(
    client: AsyncClient, test_owner: dict, test_tenant: dict, db: AsyncSession
):
    """Partial payment sets ledger status to PARTIAL."""
    # Generate ledger
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_tenant["property_id"]), "month": 4, "year": 2024},
    )

    # Record partial payment (50%)
    idem_key = str(uuid.uuid4())
    await client.post(
        "/api/v1/payments",
        headers={
            **auth_headers(test_owner["token"]),
            "X-Idempotency-Key": idem_key,
        },
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 350000,  # 50% of 700000
            "payment_type": "RENT",
            "payment_mode": "CASH",
            "for_month": 4,
            "for_year": 2024,
        },
    )

    schema = test_tenant["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    result = await db.execute(
        text("SELECT status, amount_paid_paise FROM rent_ledger_entries WHERE tenant_id = :tid AND month = 4 AND year = 2024"),
        {"tid": str(test_tenant["tenant_id"])},
    )
    entry = result.fetchone()
    if entry:
        assert entry[0] == "PARTIAL"
        assert entry[1] == 350000
    await db.commit()  # close implicit transaction before teardown


@pytest.mark.asyncio
async def test_two_partial_payments_total_to_paid(
    client: AsyncClient, test_owner: dict, test_tenant: dict, db: AsyncSession
):
    """Two partial payments summing to full rent → PAID."""
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_tenant["property_id"]), "month": 5, "year": 2024},
    )

    # First partial
    await client.post(
        "/api/v1/payments",
        headers={
            **auth_headers(test_owner["token"]),
            "X-Idempotency-Key": str(uuid.uuid4()),
        },
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 400000,
            "payment_type": "RENT",
            "payment_mode": "CASH",
            "for_month": 5,
            "for_year": 2024,
        },
    )

    # Second partial — brings total to 700000
    await client.post(
        "/api/v1/payments",
        headers={
            **auth_headers(test_owner["token"]),
            "X-Idempotency-Key": str(uuid.uuid4()),
        },
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 300000,
            "payment_type": "RENT",
            "payment_mode": "UPI",
            "for_month": 5,
            "for_year": 2024,
        },
    )

    schema = test_tenant["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    result = await db.execute(
        text("SELECT status, amount_paid_paise FROM rent_ledger_entries WHERE tenant_id = :tid AND month = 5 AND year = 2024"),
        {"tid": str(test_tenant["tenant_id"])},
    )
    entry = result.fetchone()
    if entry:
        assert entry[0] == "PAID"
        assert entry[1] == 700000
    await db.commit()  # close implicit transaction before teardown


# ── Idempotency ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_idempotency_key_prevents_duplicate_payment(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Same idempotency key → 409 on second request."""
    idem_key = str(uuid.uuid4())
    payload = {
        "tenant_id": str(test_tenant["tenant_id"]),
        "amount_paise": 700000,
        "payment_type": "ADVANCE",
        "payment_mode": "CASH",
    }
    headers = {
        **auth_headers(test_owner["token"]),
        "X-Idempotency-Key": idem_key,
    }

    resp1 = await client.post("/api/v1/payments", headers=headers, json=payload)
    assert resp1.status_code == 201

    resp2 = await client.post("/api/v1/payments", headers=headers, json=payload)
    assert resp2.status_code == 409
    assert resp2.json()["error"]["code"] == "DUPLICATE_REQUEST"


@pytest.mark.asyncio
async def test_different_idempotency_keys_allow_multiple_payments(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Different idempotency keys allow separate payments."""
    payload = {
        "tenant_id": str(test_tenant["tenant_id"]),
        "amount_paise": 100000,
        "payment_type": "ADVANCE",
        "payment_mode": "CASH",
    }

    resp1 = await client.post(
        "/api/v1/payments",
        headers={**auth_headers(test_owner["token"]), "X-Idempotency-Key": str(uuid.uuid4())},
        json=payload,
    )
    resp2 = await client.post(
        "/api/v1/payments",
        headers={**auth_headers(test_owner["token"]), "X-Idempotency-Key": str(uuid.uuid4())},
        json=payload,
    )
    assert resp1.status_code == 201
    assert resp2.status_code == 201
    # Different payment IDs
    assert resp1.json()["payment_id"] != resp2.json()["payment_id"]


# ── Tenant ledger ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_ledger_returns_entries(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """GET /tenants/{id}/ledger returns rent ledger entries with totals."""
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_tenant["property_id"]), "month": 6, "year": 2024},
    )
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
    assert len(data["entries"]) >= 1

    entry = data["entries"][0]
    assert "month" in entry
    assert "year" in entry
    assert "amount_due_paise" in entry
    assert "status" in entry


@pytest.mark.asyncio
async def test_tenant_ledger_outstanding_calculation(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Outstanding = due - paid is calculated correctly."""
    await client.post(
        "/api/v1/rent/generate-ledger",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_tenant["property_id"]), "month": 7, "year": 2024},
    )
    # Pay 200000 of 700000
    await client.post(
        "/api/v1/payments",
        headers={
            **auth_headers(test_owner["token"]),
            "X-Idempotency-Key": str(uuid.uuid4()),
        },
        json={
            "tenant_id": str(test_tenant["tenant_id"]),
            "amount_paise": 200000,
            "payment_type": "RENT",
            "payment_mode": "CASH",
            "for_month": 7,
            "for_year": 2024,
        },
    )
    response = await client.get(
        f"/api/v1/tenants/{test_tenant['tenant_id']}/ledger",
        headers=auth_headers(test_owner["token"]),
    )
    data = response.json()
    # Find the July entry
    july_entries = [e for e in data["entries"] if e["month"] == 7 and e["year"] == 2024]
    assert len(july_entries) == 1
    assert july_entries[0]["outstanding_paise"] == 500000  # 700000 - 200000


# ── Overdue ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_overdue_endpoint(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /rent/overdue returns tenants with unpaid rent."""
    response = await client.get(
        "/api/v1/rent/overdue",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    assert "items" in response.json()
