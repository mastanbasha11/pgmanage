"""Bookings: daily stays + advance/future bookings (no tenant required)."""
from __future__ import annotations

import json
from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import NotFoundError
from app.services.audit_constants import Event
from app.services.audit_service import log_event

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class BookingCreate(BaseModel):
    property_id: UUID
    guest_name: str
    guest_phone: str | None = None
    room_label: str
    kind: str  # 'DAILY' | 'ADVANCE'
    amount_paise: int
    check_in_date: date
    check_out_date: date | None = None
    payment_mode: str = "CASH"
    reference_number: str | None = None
    collected_at: date
    paid_to: str | None = None
    """Person who actually received the cash (Mastan, Harshi, etc.)."""
    notes: str | None = None


class BookingUpdate(BaseModel):
    guest_name: str | None = None
    guest_phone: str | None = None
    room_label: str | None = None
    kind: str | None = None
    amount_paise: int | None = None
    check_in_date: date | None = None
    check_out_date: date | None = None
    payment_mode: str | None = None
    reference_number: str | None = None
    collected_at: date | None = None
    paid_to: str | None = None
    notes: str | None = None


_VALID_KINDS = {"DAILY", "ADVANCE"}


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post("/bookings", status_code=status.HTTP_201_CREATED, summary="Create a booking")
async def create_booking(
    body: BookingCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if body.kind not in _VALID_KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(_VALID_KINDS)}")
    if body.amount_paise <= 0:
        raise HTTPException(400, "amount_paise must be positive")

    result = await db.execute(
        text("""
            INSERT INTO bookings (
                org_id, property_id, guest_name, guest_phone, room_label, kind,
                amount_paise, check_in_date, check_out_date, payment_mode,
                reference_number, collected_at, collected_by, paid_to, notes
            )
            VALUES (
                :org_id, :pid, :name, :phone, :room, CAST(:kind AS booking_kind_enum),
                :amount, :ci, :co, CAST(:mode AS payment_mode_enum),
                :ref, :collected_at, :user, :paid_to, :notes
            )
            RETURNING id
        """),
        {
            "org_id": str(ctx.org_id),
            "pid": str(body.property_id),
            "name": body.guest_name.strip(),
            "phone": (body.guest_phone or "").strip() or None,
            "room": body.room_label.strip(),
            "kind": body.kind,
            "amount": body.amount_paise,
            "ci": body.check_in_date,
            "co": body.check_out_date,
            "mode": body.payment_mode,
            "ref": (body.reference_number or "").strip() or None,
            "collected_at": body.collected_at,
            "user": str(ctx.user_id),
            "paid_to": (body.paid_to or "").strip() or None,
            "notes": (body.notes or "").strip() or None,
        },
    )
    booking_id = result.scalar_one()

    await db.execute(
        text("""
            INSERT INTO audit_log (org_id, property_id, actor_id, actor_role, action, table_name, record_id, new_values)
            VALUES (:org_id, :pid, :actor, :role, 'INSERT'::audit_action_enum, 'bookings', :rid, CAST(:vals AS jsonb))
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(body.property_id),
            "actor": str(ctx.user_id), "role": ctx.role, "rid": str(booking_id),
            "vals": json.dumps({
                "kind": body.kind,
                "guest": body.guest_name,
                "amount_paise": body.amount_paise,
                "room_label": body.room_label,
            }),
        },
    )
    await log_event(
        db,
        Event.BOOKING_CREATED,
        description=f"{ctx.name} created a {body.kind.lower()} booking for {body.guest_name}",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="booking",
        entity_id=booking_id,
        entity_name=body.guest_name,
        property_id=body.property_id,
        metadata={"kind": body.kind, "amount_paise": body.amount_paise, "room_label": body.room_label},
    )
    await db.commit()
    return {"id": str(booking_id)}


@router.get("/bookings", summary="List bookings")
async def list_bookings(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    kind: str | None = Query(None),
    month: int | None = Query(None),
    year: int | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    q: str | None = Query(None, description="Free-text search on guest name / phone / room"),
    limit: int = Query(100, le=500),
):
    conditions = ["b.org_id = :org_id", "b.is_deleted = false"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}

    if property_id:
        conditions.append("b.property_id = :pid")
        params["pid"] = str(property_id)
    if kind:
        if kind not in _VALID_KINDS:
            raise HTTPException(400, f"kind must be one of {sorted(_VALID_KINDS)}")
        conditions.append("b.kind = CAST(:kind AS booking_kind_enum)")
        params["kind"] = kind

    # Period filter — default to month/year on collected_at (cash basis)
    if month and year and not (start_date or end_date):
        from calendar import monthrange
        start_date = date(year, month, 1)
        end_date = date(year, month, monthrange(year, month)[1])
    if start_date:
        conditions.append("b.collected_at >= :sd")
        params["sd"] = start_date
    if end_date:
        conditions.append("b.collected_at <= :ed")
        params["ed"] = end_date
    if q and q.strip():
        conditions.append(
            "(b.guest_name ILIKE :q OR b.guest_phone ILIKE :q OR b.room_label ILIKE :q)"
        )
        params["q"] = f"%{q.strip()}%"

    where = " AND ".join(conditions)
    res = await db.execute(
        text(f"""
            SELECT b.id, b.property_id, b.guest_name, b.guest_phone, b.room_label,
                   b.kind, b.amount_paise, b.check_in_date, b.check_out_date,
                   b.payment_mode, b.reference_number, b.collected_at, b.paid_to,
                   b.notes, b.created_at, b.updated_at,
                   p.name AS property_name,
                   u.name AS collected_by_name
            FROM bookings b
            LEFT JOIN properties p ON p.id = b.property_id
            LEFT JOIN users u ON u.id = b.collected_by
            WHERE {where}
            ORDER BY b.collected_at DESC, b.created_at DESC
            LIMIT :limit
        """),
        {**params, "limit": limit},
    )
    items = [dict(r) for r in res.mappings().fetchall()]

    # Aggregate totals for header
    total_res = await db.execute(
        text(f"""
            SELECT
                COALESCE(SUM(amount_paise), 0) AS total_paise,
                COALESCE(SUM(amount_paise) FILTER (WHERE kind = 'DAILY'), 0) AS daily_paise,
                COALESCE(SUM(amount_paise) FILTER (WHERE kind = 'ADVANCE'), 0) AS advance_paise,
                COUNT(*) AS count
            FROM bookings b
            WHERE {where}
        """),
        params,
    )
    totals = dict(total_res.mappings().fetchone() or {})

    return {
        "items": items,
        "total_paise": int(totals.get("total_paise", 0) or 0),
        "daily_paise": int(totals.get("daily_paise", 0) or 0),
        "advance_paise": int(totals.get("advance_paise", 0) or 0),
        "count": int(totals.get("count", 0) or 0),
    }


@router.patch("/bookings/{booking_id}", summary="Update a booking")
async def update_booking(
    booking_id: UUID,
    body: BookingUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER", "PROPERTY_MANAGER"):
        raise HTTPException(403, "Only owners or property managers can edit bookings")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "kind" in updates and updates["kind"] not in _VALID_KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(_VALID_KINDS)}")

    set_parts: list[str] = []
    params: dict[str, Any] = {"id": str(booking_id), "org_id": str(ctx.org_id)}
    for k, v in updates.items():
        if k == "kind":
            set_parts.append("kind = CAST(:kind AS booking_kind_enum)")
            params["kind"] = v
        elif k == "payment_mode":
            set_parts.append("payment_mode = CAST(:payment_mode AS payment_mode_enum)")
            params["payment_mode"] = v
        elif k in ("guest_name", "guest_phone", "room_label", "reference_number", "paid_to", "notes"):
            params[k] = (str(v).strip() or None) if k != "guest_name" else str(v).strip()
            set_parts.append(f"{k} = :{k}")
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v

    set_clause = ", ".join(set_parts)
    res = await db.execute(
        text(
            f"UPDATE bookings SET {set_clause}, updated_at = NOW() "
            f"WHERE id = :id AND org_id = :org_id AND is_deleted = false"
        ),
        params,
    )
    if res.rowcount == 0:
        raise NotFoundError("Booking", booking_id)
    await db.commit()
    return {"message": "Booking updated"}


@router.delete("/bookings/{booking_id}", summary="Soft-delete a booking")
async def delete_booking(
    booking_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER", "PROPERTY_MANAGER"):
        raise HTTPException(403, "Only owners or property managers can delete bookings")
    res = await db.execute(
        text(
            "UPDATE bookings SET is_deleted = true, updated_at = NOW() "
            "WHERE id = :id AND org_id = :org_id AND is_deleted = false"
        ),
        {"id": str(booking_id), "org_id": str(ctx.org_id)},
    )
    if res.rowcount == 0:
        raise NotFoundError("Booking", booking_id)

    await log_event(
        db,
        Event.BOOKING_CANCELLED,
        description=f"{ctx.name} cancelled a booking",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="booking",
        entity_id=booking_id,
    )
    await db.commit()
    return {"message": "Booking removed"}
