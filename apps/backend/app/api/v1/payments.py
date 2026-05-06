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
            SELECT p.id, p.amount_paise, p.payment_type, p.payment_mode,
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
            ) collectors ON true
            WHERE rle.property_id = :pid AND rle.month = :month AND rle.year = :year
              AND (
                t.actual_move_out_date IS NULL
                OR t.actual_move_out_date >= make_date(:year, :month, 1)
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

    # Per-collector breakdown for the same month/year (RENT payments only).
    by_collector = await db.execute(
        text("""
            SELECT
                COALESCE(NULLIF(p.paid_to, ''), u.name, 'Unattributed') AS collector,
                COUNT(*) AS payments,
                SUM(p.amount_paise) AS amount_paise
            FROM payments p
            LEFT JOIN users u ON u.id = p.collected_by
            WHERE p.property_id = :pid
              AND p.is_deleted = false
              AND p.payment_type = 'RENT'
              AND p.for_month = :month AND p.for_year = :year
            GROUP BY 1
            ORDER BY amount_paise DESC
        """),
        {"pid": str(property_id), "month": month, "year": year},
    )
    collectors = [dict(c) for c in by_collector.mappings().fetchall()]

    return {
        "property_id": str(property_id),
        "month": month, "year": year,
        "items": items,
        "total": len(items),
        "stats": {
            "expected_paise": total_due,
            "collected_paise": total_paid,
            "discount_paise": total_discount,
            "settled_paise": settled,
            "outstanding_paise": max(total_due - settled, 0),
            "collection_rate": round(settled / total_due * 100, 1) if total_due > 0 else 0,
        },
        "collectors": collectors,
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
