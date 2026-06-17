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


# ── Outstanding-aggregation regression ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_outstanding_uses_per_row_clamped_sum(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """
    Two tenants in the same month: one under-paid, one over-paid. The
    aggregate (sum_due - sum_paid - sum_discount) cancels out — the per-row
    clamped sum must still surface the real shortfall.

    This is the bug reported 2026-06-10: the Rent & Payments page Outstanding
    KPI showed ₹0 even though several tenants in the list had unpaid rent.
    Reason was the old `max(total_due - settled, 0)` formula. Fix in
    payments.py:/rent/ledger + dashboard.py:/dashboard/summary.
    """
    schema = test_property["schema_name"]
    property_id = test_property["property_id"]
    bed_a = test_property["bed_ids"][0]
    bed_b = test_property["bed_ids"][1]

    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    # Under-paid tenant: owes 9000, paid 0.
    t_under = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO tenants (id, org_id, property_id, bed_id, name, phone,
                id_type, id_number, emergency_contact_name, emergency_contact_phone,
                emergency_contact_relation, move_in_date, status)
            VALUES (:id, :org, :pid, :bed, 'Under Paid', '+919000000001',
                'AADHAR', '111111111111', 'P', '+919000000099', 'P',
                '2024-01-01', 'ACTIVE')
        """),
        {"id": str(t_under), "org": str(test_property["org_id"]),
         "pid": str(property_id), "bed": str(bed_a)},
    )
    await db.execute(
        text("""
            INSERT INTO rent_plans (tenant_id, property_id, monthly_rent_paise,
                security_deposit_paise, billing_day, effective_from, is_active)
            VALUES (:tid, :pid, 900000, 0, 1, '2024-01-01', true)
        """),
        {"tid": str(t_under), "pid": str(property_id)},
    )

    # Over-paid tenant: owes 9000, paid 18000 (e.g. paid this month + advance).
    t_over = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO tenants (id, org_id, property_id, bed_id, name, phone,
                id_type, id_number, emergency_contact_name, emergency_contact_phone,
                emergency_contact_relation, move_in_date, status)
            VALUES (:id, :org, :pid, :bed, 'Over Paid', '+919000000002',
                'AADHAR', '222222222222', 'P', '+919000000098', 'P',
                '2024-01-01', 'ACTIVE')
        """),
        {"id": str(t_over), "org": str(test_property["org_id"]),
         "pid": str(property_id), "bed": str(bed_b)},
    )
    await db.execute(
        text("""
            INSERT INTO rent_plans (tenant_id, property_id, monthly_rent_paise,
                security_deposit_paise, billing_day, effective_from, is_active)
            VALUES (:tid, :pid, 900000, 0, 1, '2024-01-01', true)
        """),
        {"tid": str(t_over), "pid": str(property_id)},
    )

    # Direct ledger inserts — the bug is in the aggregation, not the
    # ledger-generation flow, so we skip /rent/generate-ledger to keep the
    # arithmetic crystal-clear.
    await db.execute(
        text("""
            INSERT INTO rent_ledger_entries
                (tenant_id, property_id, month, year, amount_due_paise,
                 amount_paid_paise, discount_paise, status, due_date)
            VALUES
                (:t_under, :pid, 8, 2024, 900000, 0, 0, 'UNPAID', '2024-08-01'),
                (:t_over,  :pid, 8, 2024, 900000, 1800000, 0, 'PAID', '2024-08-01')
        """),
        {"t_under": str(t_under), "t_over": str(t_over), "pid": str(property_id)},
    )
    await db.commit()

    # Hit /rent/ledger and assert the stats.outstanding_paise reflects the
    # UNDER-PAID tenant only (₹9,000) — NOT 0, which is what the buggy
    # aggregate formula returned.
    response = await client.get(
        "/api/v1/rent/ledger",
        headers=auth_headers(test_owner["token"]),
        params={
            "property_id": str(property_id),
            "month": 8,
            "year": 2024,
        },
    )
    assert response.status_code == 200, response.text
    stats = response.json()["stats"]
    # Aggregate would say 0 (sum_due 18000 - sum_paid 18000 = 0).
    # Per-row clamped sum says 9000 (only the under-paid row's shortfall).
    assert stats["outstanding_paise"] == 900000, (
        f"Outstanding must be the per-row clamped sum (₹9,000), got "
        f"₹{stats['outstanding_paise'] // 100} — the aggregate-subtraction "
        "bug is back. See payments.py /rent/ledger."
    )


# ── Period attribution rule ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_collected_kpi_uses_fiscal_window_not_for_month(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """
    Period-attribution rule (project-period-attribution-rule):
    A late payment for May rent that is collected on May 12 — which falls in
    JUNE's fiscal window (11 May – 10 Jun by default settlement_day=10) —
    must contribute to JUNE's "Collected" KPI, NOT May's, even though the
    payment row's for_month=5.

    Conversely, "Expected" is rent BILLED for that rent month, so the May
    ledger entry stays in May's Expected — Collection Rate for June can
    exceed 100% when prior-month catch-ups land in June's window.
    """
    schema = test_property["schema_name"]
    pid = test_property["property_id"]
    bed = test_property["bed_ids"][0]

    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    # Set the property's settlement_day to 10 so the June fiscal window
    # is 11-May .. 10-Jun (the default if unset).
    await db.execute(
        text("UPDATE properties SET settlement_day = 10 WHERE id = :pid"),
        {"pid": str(pid)},
    )

    t = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO tenants (id, org_id, property_id, bed_id, name, phone,
                id_type, id_number, emergency_contact_name, emergency_contact_phone,
                emergency_contact_relation, move_in_date, status)
            VALUES (:id, :org, :pid, :bed, 'Late Payer', '+919000000010',
                'AADHAR', '101010101010', 'P', '+919000000099', 'P',
                '2024-01-01', 'ACTIVE')
        """),
        {"id": str(t), "org": str(test_property["org_id"]),
         "pid": str(pid), "bed": str(bed)},
    )
    # May ledger row (rent billed FOR May).
    await db.execute(
        text("""
            INSERT INTO rent_ledger_entries
                (tenant_id, property_id, month, year, amount_due_paise,
                 amount_paid_paise, discount_paise, status, due_date)
            VALUES (:tid, :pid, 5, 2024, 1200000, 1200000, 0, 'PAID', '2024-05-01')
        """),
        {"tid": str(t), "pid": str(pid)},
    )
    # June ledger row (rent billed FOR June). Untouched for the test.
    await db.execute(
        text("""
            INSERT INTO rent_ledger_entries
                (tenant_id, property_id, month, year, amount_due_paise,
                 amount_paid_paise, discount_paise, status, due_date)
            VALUES (:tid, :pid, 6, 2024, 1200000, 0, 0, 'UNPAID', '2024-06-01')
        """),
        {"tid": str(t), "pid": str(pid)},
    )
    # Payment collected on 2024-05-12 — inside JUNE's fiscal window
    # (11-May-2024 .. 10-Jun-2024). for_month=5 because it's paying off May rent.
    from uuid import uuid4 as _uuid4
    await db.execute(
        text("""
            INSERT INTO payments (
                org_id, property_id, tenant_id, amount_paise,
                payment_type, payment_mode, paid_to, for_month, for_year,
                collected_by, collected_at, notes, idempotency_key
            ) VALUES (
                :org_id, :pid, :tid, 1200000,
                'RENT'::payment_type_enum, 'UPI'::payment_mode_enum,
                'Shammi', 5, 2024, :user, '2024-05-12 10:00:00+00',
                'May rent paid late', :ikey
            )
        """),
        {
            "org_id": str(test_property["org_id"]),
            "pid": str(pid), "tid": str(t),
            "user": str(test_owner["user_id"]),
            "ikey": str(_uuid4()),
        },
    )
    await db.commit()

    # JUNE's Collected MUST include the May 12 catch-up (collected_at in
    # June's fiscal window) even though the payment is for_month=5.
    r = await client.get(
        "/api/v1/rent/ledger",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(pid), "month": 6, "year": 2024},
    )
    assert r.status_code == 200, r.text
    stats = r.json()["stats"]
    assert stats["collected_paise"] == 1200000, (
        f"June Collected must include the May-rent payment collected on May 12 "
        f"(fiscal window 11 May - 10 Jun). Got ₹{stats['collected_paise'] // 100}. "
        "See project-period-attribution-rule."
    )
    # Ledger-roll-up view is still available for callers that want it.
    assert stats["ledger_paid_paise"] == 0, (
        "June's ledger_paid_paise rolls up the JUNE ledger row only — should be 0 "
        "since the catch-up payment was applied to May's ledger row."
    )
