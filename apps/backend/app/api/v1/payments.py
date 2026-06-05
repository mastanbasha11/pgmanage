"""Rent and payment management endpoints."""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import ConflictError, IdempotencyError, NotFoundError
from app.services.audit_constants import Event
from app.services.audit_service import log_event

router = APIRouter()


class PaymentCreate(BaseModel):
    tenant_id: UUID
    amount_paise: int
    discount_paise: int = 0
    for_days: int | None = None
    payment_type: str
    payment_mode: str = "CASH"
    reference_number: str | None = None
    upi_id: str | None = None
    paid_to: str | None = None
    for_month: int | None = None
    for_year: int | None = None
    notes: str | None = None
    collected_at: datetime | None = None


@router.post("/payments", status_code=status.HTTP_201_CREATED, summary="Record payment")
async def record_payment(
    body: PaymentCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    x_idempotency_key: str | None = Header(None, alias="X-Idempotency-Key"),
):
    """
    Record a rent/advance/deposit payment.
    Provide X-Idempotency-Key header to prevent duplicate payments on retry.
    """
    idempotency_key = x_idempotency_key or str(uuid4())

    # Reject zero-everything submissions (frontend should already block, but
    # defend against malformed clients / direct API calls).
    if (body.amount_paise or 0) <= 0 and (body.discount_paise or 0) <= 0:
        from fastapi import HTTPException
        raise HTTPException(400, "Either amount_paise or discount_paise must be > 0")

    # Check idempotency
    existing = await db.execute(
        text("SELECT id FROM payments WHERE idempotency_key = :key"),
        {"key": idempotency_key},
    )
    if existing.scalar_one_or_none():
        raise IdempotencyError()

    # Verify tenant
    tenant_result = await db.execute(
        text("SELECT id, property_id, name FROM tenants WHERE id = :id AND org_id = :org_id AND is_deleted = false"),
        {"id": str(body.tenant_id), "org_id": str(ctx.org_id)},
    )
    tenant = tenant_result.mappings().fetchone()
    if not tenant:
        raise NotFoundError("Tenant", body.tenant_id)

    property_id = tenant["property_id"]
    collected_at = body.collected_at or datetime.now(timezone.utc)

    # Create payment
    payment_result = await db.execute(
        text("""
            INSERT INTO payments (
                org_id, property_id, tenant_id, amount_paise, discount_paise,
                for_days, payment_type, payment_mode, reference_number, upi_id,
                paid_to, for_month, for_year, collected_by, collected_at,
                notes, idempotency_key
            )
            VALUES (
                :org_id, :pid, :tenant_id, :amount, :discount,
                :for_days, CAST(:pay_type AS payment_type_enum),
                CAST(:pay_mode AS payment_mode_enum), :ref_num, :upi,
                :paid_to, :month, :year, :collected_by, :collected_at,
                :notes, :idempotency_key
            )
            RETURNING id
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(property_id),
            "tenant_id": str(body.tenant_id), "amount": body.amount_paise,
            "discount": max(int(body.discount_paise or 0), 0),
            "for_days": body.for_days,
            "pay_type": body.payment_type, "pay_mode": body.payment_mode,
            "ref_num": body.reference_number, "upi": body.upi_id,
            "paid_to": (body.paid_to or "").strip() or None,
            "month": body.for_month, "year": body.for_year,
            "collected_by": str(ctx.user_id), "collected_at": collected_at,
            "notes": body.notes, "idempotency_key": idempotency_key,
        },
    )
    payment_id = payment_result.scalar_one()

    # Update rent ledger if this is a RENT payment
    if body.payment_type == "RENT" and body.for_month and body.for_year:
        ledger_result = await db.execute(
            text("""
                SELECT id, amount_due_paise, amount_paid_paise, discount_paise
                FROM rent_ledger_entries
                WHERE tenant_id = :tid AND month = :month AND year = :year
            """),
            {"tid": str(body.tenant_id), "month": body.for_month, "year": body.for_year},
        )
        ledger = ledger_result.mappings().fetchone()

        if ledger:
            new_paid = (ledger["amount_paid_paise"] or 0) + body.amount_paise
            new_discount = (ledger["discount_paise"] or 0) + max(int(body.discount_paise or 0), 0)
            covered = new_paid + new_discount
            due = ledger["amount_due_paise"] or 0
            if covered >= due:
                new_status = "PAID"
            elif covered > 0:
                new_status = "PARTIAL"
            else:
                new_status = "UNPAID"
            await db.execute(
                text("""
                    UPDATE rent_ledger_entries
                    SET amount_paid_paise = :paid,
                        discount_paise = :discount,
                        status = CAST(:status AS rent_status_enum),
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {
                    "paid": new_paid, "discount": new_discount,
                    "status": new_status, "id": str(ledger["id"]),
                },
            )

    # Audit log (every financial write)
    await db.execute(
        text("""
            INSERT INTO audit_log (org_id, property_id, actor_id, actor_role, action, table_name, record_id, new_values)
            VALUES (:org_id, :pid, :actor, :role, 'INSERT'::audit_action_enum, 'payments', :record_id, CAST(:new_vals AS jsonb))
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(property_id),
            "actor": str(ctx.user_id), "role": ctx.role,
            "record_id": str(payment_id),
            "new_vals": json.dumps({
                "amount_paise": body.amount_paise,
                "payment_type": body.payment_type,
                "payment_mode": body.payment_mode,
                "for_month": body.for_month,
                "for_year": body.for_year,
            }),
        },
    )

    _is_advance = body.payment_type == "ADVANCE"
    _rupees = f"₹{body.amount_paise / 100:,.0f}"
    await log_event(
        db,
        Event.ADVANCE_RECORDED if _is_advance else Event.PAYMENT_RECORDED,
        description=(
            f"{ctx.name} recorded {_rupees} "
            f"{'advance' if _is_advance else body.payment_type.lower() + ' payment'} "
            f"for {tenant['name']}"
        ),
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="payment",
        entity_id=payment_id,
        entity_name=tenant["name"],
        property_id=property_id,
        tenant_id=body.tenant_id,
        metadata={
            # Full payment attributes so the audit feed reproduces what was
            # entered (paid_to / mode / ref number) without needing to open
            # the payment record. None-valued keys keep the schema stable.
            "amount_paise": body.amount_paise,
            "discount_paise": max(int(body.discount_paise or 0), 0) or None,
            "payment_type": body.payment_type,
            "payment_mode": body.payment_mode,
            "paid_to": (body.paid_to or "").strip() or None,
            "reference_number": (body.reference_number or "").strip() or None,
            "upi_id": (body.upi_id or "").strip() or None,
            "for_days": body.for_days,
            "for_month": body.for_month,
            "for_year": body.for_year,
            "notes": (body.notes or "").strip() or None,
        },
    )

    await db.commit()
    return {"payment_id": str(payment_id), "idempotency_key": idempotency_key, "message": "Payment recorded"}


@router.get("/payments", summary="List payments")
async def list_payments(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    tenant_id: UUID | None = Query(None),
    month: int | None = Query(None),
    year: int | None = Query(None),
    payment_type: str | None = Query(None),
    limit: int = Query(50, le=200),
):
    conditions = ["p.org_id = :org_id", "p.is_deleted = false"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}

    if property_id:
        conditions.append("p.property_id = :pid")
        params["pid"] = str(property_id)
    if tenant_id:
        conditions.append("p.tenant_id = :tenant_id")
        params["tenant_id"] = str(tenant_id)
    if month:
        conditions.append("p.for_month = :month")
        params["month"] = month
    if year:
        conditions.append("p.for_year = :year")
        params["year"] = year
    if payment_type:
        conditions.append("p.payment_type = CAST(:payment_type AS payment_type_enum)")
        params["payment_type"] = payment_type

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"""
            SELECT p.id, p.amount_paise, p.discount_paise, p.payment_type, p.payment_mode,
                   p.reference_number, p.upi_id, p.paid_to, p.for_days,
                   p.for_month, p.for_year, p.collected_at, p.notes,
                   t.name as tenant_name, t.phone as tenant_phone,
                   u.name as collected_by_name
            FROM payments p
            JOIN tenants t ON t.id = p.tenant_id
            LEFT JOIN users u ON u.id = p.collected_by
            WHERE {where}
            ORDER BY p.collected_at DESC
            LIMIT :limit
        """),
        {**params, "limit": limit},
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.get("/rent/ledger", summary="All tenants' ledger for a month/year")
async def rent_ledger(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID = Query(...),
    month: int = Query(...),
    year: int = Query(...),
):
    # Resolve fiscal period for this (property, month, year)
    from app.services.billing_period import get_fiscal_period
    fiscal = await get_fiscal_period(property_id, month, year, db)
    period_start = fiscal.period_start
    period_end = fiscal.period_end
    # First-of-the-viewed-month — used to exclude tenants who already checked out
    # before this month (e.g. ledger generated in advance, then tenant left).
    result = await db.execute(
        text(r"""
            SELECT rle.id, rle.tenant_id, rle.month, rle.year,
                   rle.amount_due_paise, rle.amount_paid_paise, rle.discount_paise,
                   (rle.amount_due_paise - rle.amount_paid_paise - rle.discount_paise) as outstanding_paise,
                   rle.status, rle.due_date,
                   t.name as tenant_name, t.phone,
                   t.actual_move_out_date,
                   b.bed_label,
                   r.room_number,
                   f.floor_number, f.display_name as floor_name,
                   rt.name as room_type,
                   collectors.collected_by
            FROM rent_ledger_entries rle
            JOIN tenants t ON t.id = rle.tenant_id
            LEFT JOIN beds b ON b.id = t.bed_id
            LEFT JOIN rooms r ON r.id = b.room_id
            LEFT JOIN floors f ON f.id = r.floor_id
            LEFT JOIN room_types rt ON rt.id = r.room_type_id
            LEFT JOIN LATERAL (
                -- Only attribute a "collector" when actual cash was collected.
                -- Discount-only rows (amount = 0) shouldn't surface a name.
                SELECT array_agg(DISTINCT COALESCE(NULLIF(TRIM(p.paid_to), ''), u.name))
                  FILTER (WHERE COALESCE(NULLIF(TRIM(p.paid_to), ''), u.name) IS NOT NULL)
                    AS collected_by
                FROM payments p
                LEFT JOIN users u ON u.id = p.collected_by
                WHERE p.tenant_id = rle.tenant_id
                  AND p.is_deleted = false
                  AND p.payment_type = 'RENT'
                  AND p.for_month = rle.month
                  AND p.for_year = rle.year
                  AND p.amount_paise > 0
            ) collectors ON true
            WHERE rle.property_id = :pid AND rle.month = :month AND rle.year = :year
              -- Tenant must have been active past the END of the view month.
              -- A check-out anywhere in/before this month → hide their row.
              AND (
                t.actual_move_out_date IS NULL
                OR t.actual_move_out_date
                   >= (make_date(:year, :month, 1) + INTERVAL '1 month')::date
              )
            ORDER BY f.floor_number NULLS LAST,
                     NULLIF(regexp_replace(r.room_number, '\D', '', 'g'), '')::int NULLS LAST,
                     r.room_number, b.bed_label
        """),
        {"pid": str(property_id), "month": month, "year": year},
    )
    rows = result.mappings().fetchall()

    # Recompute status to reflect discount in case some entries were saved before
    # the discount column existed.
    items = []
    for r in rows:
        d = dict(r)
        covered = (d.get("amount_paid_paise") or 0) + (d.get("discount_paise") or 0)
        due = d.get("amount_due_paise") or 0
        if covered >= due and due > 0:
            d["status"] = "PAID"
        elif covered > 0:
            d["status"] = "PARTIAL"
        else:
            d["status"] = "UNPAID"
        items.append(d)

    total_due = sum(r["amount_due_paise"] for r in items)
    total_paid = sum(r["amount_paid_paise"] for r in items)
    total_discount = sum(r["discount_paise"] or 0 for r in items)
    settled = total_paid + total_discount

    # Per-collector breakdown using the fiscal period (collected_at in [start, end]).
    # Splits Rent vs Advance/Deposit per person — and FOLDS bookings in:
    #   bookings.kind='DAILY'   → rent bucket  (short-stay rent income)
    #   bookings.kind='ADVANCE' → advance bucket (advance for a future move-in)
    by_collector = await db.execute(
        text("""
            WITH unioned AS (
                SELECT
                    COALESCE(NULLIF(p.paid_to, ''), u.name, 'Unattributed') AS collector,
                    p.amount_paise,
                    CASE WHEN p.payment_type = 'RENT' THEN 'rent' ELSE 'advance' END AS bucket
                FROM payments p
                LEFT JOIN users u ON u.id = p.collected_by
                WHERE p.property_id = :pid
                  AND p.is_deleted = false
                  AND p.amount_paise > 0
                  AND p.payment_type IN ('RENT', 'ADVANCE', 'DEPOSIT')
                  AND (p.collected_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :start AND :end
                UNION ALL
                SELECT
                    COALESCE(NULLIF(b.paid_to, ''), u.name, 'Unattributed') AS collector,
                    b.amount_paise,
                    CASE WHEN b.kind = 'DAILY' THEN 'rent' ELSE 'advance' END AS bucket
                FROM bookings b
                LEFT JOIN users u ON u.id = b.collected_by
                WHERE b.property_id = :pid
                  AND b.is_deleted = false
                  AND b.amount_paise > 0
                  AND b.collected_at BETWEEN :start AND :end
            )
            SELECT
                collector,
                COALESCE(SUM(amount_paise) FILTER (WHERE bucket = 'rent'), 0) AS rent_paise,
                COALESCE(SUM(amount_paise) FILTER (WHERE bucket = 'advance'), 0) AS advance_paise,
                COUNT(*) FILTER (WHERE bucket = 'rent') AS rent_payments,
                COUNT(*) FILTER (WHERE bucket = 'advance') AS advance_payments
            FROM unioned
            GROUP BY collector
            HAVING COALESCE(SUM(amount_paise), 0) > 0
            ORDER BY SUM(amount_paise) DESC
        """),
        {"pid": str(property_id), "start": period_start, "end": period_end},
    )
    collectors = []
    for r in by_collector.mappings().fetchall():
        d = dict(r)
        rent = d.get("rent_paise") or 0
        adv = d.get("advance_paise") or 0
        collectors.append({
            "collector": d["collector"],
            "rent_paise": rent,
            "advance_paise": adv,
            "amount_paise": rent + adv,
            "payments": (d.get("rent_payments") or 0) + (d.get("advance_payments") or 0),
        })

    # Property-wide advance & refund + period-bound rent collected, for the
    # KPI cards. Bookings are folded in:
    #   DAILY    → rent_collected_in_period
    #   ADVANCE  → advance_received
    adv_refund = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(amount_paise) FILTER (
                    WHERE payment_type IN ('ADVANCE', 'DEPOSIT')
                ), 0) AS advance_paise,
                COALESCE(SUM(amount_paise) FILTER (
                    WHERE payment_type = 'REFUND'
                ), 0) AS refund_paise,
                COALESCE(SUM(amount_paise) FILTER (
                    WHERE payment_type = 'RENT'
                ), 0) AS rent_collected_in_period_paise
            FROM payments
            WHERE property_id = :pid
              AND is_deleted = false
              AND (collected_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :start AND :end
        """),
        {"pid": str(property_id), "start": period_start, "end": period_end},
    )
    ar = adv_refund.mappings().fetchone() or {}
    advance_received = ar.get("advance_paise", 0) or 0
    refunds_given = ar.get("refund_paise", 0) or 0
    rent_collected_in_period = ar.get("rent_collected_in_period_paise", 0) or 0

    book_split = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(amount_paise) FILTER (WHERE kind = 'ADVANCE'), 0) AS advance_paise,
                COALESCE(SUM(amount_paise) FILTER (WHERE kind = 'DAILY'), 0) AS daily_paise
            FROM bookings
            WHERE property_id = :pid
              AND is_deleted = false
              AND collected_at BETWEEN :start AND :end
        """),
        {"pid": str(property_id), "start": period_start, "end": period_end},
    )
    bs = book_split.mappings().fetchone() or {}
    advance_received += bs.get("advance_paise", 0) or 0
    rent_collected_in_period += bs.get("daily_paise", 0) or 0

    return {
        "property_id": str(property_id),
        "month": month, "year": year,
        "items": items,
        "total": len(items),
        "stats": {
            "expected_paise": total_due,
            # 'collected_paise' historically meant "sum across ledger items".
            # For the partner-style P&L we want the period-bound collection.
            "collected_paise": total_paid,
            "collected_in_period_paise": rent_collected_in_period,
            "discount_paise": total_discount,
            "settled_paise": settled,
            "outstanding_paise": max(total_due - settled, 0),
            "advance_received_paise": advance_received,
            "refunds_given_paise": refunds_given,
            "collection_rate": round(settled / total_due * 100, 1) if total_due > 0 else 0,
        },
        "collectors": collectors,
        "period": {
            "start": str(period_start),
            "end": str(period_end),
            "settlement_day": fiscal.settlement_day,
            "overridden": fiscal.overridden,
            "prev_overridden": fiscal.prev_overridden,
        },
    }


@router.get("/rent/overdue", summary="Tenants with overdue rent")
async def overdue_tenants(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
):
    conditions = [
        "rle.status IN ('UNPAID'::rent_status_enum, 'PARTIAL'::rent_status_enum)",
        "t.status = 'ACTIVE'::tenant_status_enum",
        "t.org_id = :org_id",
        # Exclude entries where the bill is already covered by paid+discount,
        # in case status hasn't been recomputed yet.
        "(rle.amount_due_paise - rle.amount_paid_paise - COALESCE(rle.discount_paise,0)) > 0",
        # Same checked-out-tenant rule as /rent/ledger: require active beyond
        # the entry's billing month.
        "(t.actual_move_out_date IS NULL "
        "OR t.actual_move_out_date >= (make_date(rle.year, rle.month, 1) + INTERVAL '1 month')::date)",
    ]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}

    if property_id:
        conditions.append("rle.property_id = :pid")
        params["pid"] = str(property_id)

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"""
            SELECT t.id, t.name, t.phone,
                   COUNT(rle.id) as months_overdue,
                   SUM(rle.amount_due_paise - rle.amount_paid_paise - COALESCE(rle.discount_paise,0))
                       as total_outstanding_paise,
                   b.bed_label, r.room_number
            FROM tenants t
            JOIN rent_ledger_entries rle ON rle.tenant_id = t.id
            LEFT JOIN beds b ON b.id = t.bed_id
            LEFT JOIN rooms r ON r.id = b.room_id
            WHERE {where}
            GROUP BY t.id, t.name, t.phone, b.bed_label, r.room_number
            ORDER BY total_outstanding_paise DESC
        """),
        params,
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/rent/generate-ledger", summary="Generate ledger entries for a month")
async def generate_ledger(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID = Query(...),
    month: int = Query(...),
    year: int = Query(...),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can manually generate ledger entries")

    # Find all active tenants with active rent plans for this property
    result = await db.execute(
        text("""
            SELECT t.id as tenant_id, rp.monthly_rent_paise, rp.food_charges_paise,
                   rp.other_charges_json, rp.billing_day, rp.discount_amount_paise
            FROM tenants t
            JOIN rent_plans rp ON rp.tenant_id = t.id AND rp.is_active = true
            WHERE t.property_id = :pid AND t.status = 'ACTIVE'::tenant_status_enum AND t.is_deleted = false
        """),
        {"pid": str(property_id)},
    )
    tenants = result.mappings().fetchall()
    created = 0

    for tenant in tenants:
        other_charges = sum(
            c.get("amount_paise", 0) for c in (tenant["other_charges_json"] or [])
        )
        total_due = (
            tenant["monthly_rent_paise"]
            + tenant["food_charges_paise"]
            + other_charges
            - tenant["discount_amount_paise"]
        )
        billing_day = tenant["billing_day"]
        due_date = date(year, month, min(billing_day, 28))

        # Upsert: don't duplicate existing entries
        await db.execute(
            text("""
                INSERT INTO rent_ledger_entries (tenant_id, property_id, month, year, amount_due_paise, due_date, status)
                VALUES (:tid, :pid, :month, :year, :due, :due_date, 'UNPAID'::rent_status_enum)
                ON CONFLICT (tenant_id, month, year) DO NOTHING
            """),
            {
                "tid": str(tenant["tenant_id"]), "pid": str(property_id),
                "month": month, "year": year, "due": total_due, "due_date": due_date,
            },
        )
        created += 1

    await db.commit()
    return {"message": f"Ledger generated", "entries_created": created, "month": month, "year": year}
