"""Tenant management: check-in, list, detail, checkout, documents."""
from __future__ import annotations

import csv
import io
import json
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import ConflictError, NotFoundError
from app.services.audit_constants import Event
from app.services.audit_service import diff_changes, log_event
from app.services.s3_service import generate_presigned_upload_url


_PHONE_RE = re.compile(r"[^\d]")


def _normalise_phone(raw: str) -> str | None:
    digits = _PHONE_RE.sub("", raw or "")
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if re.match(r"^[6-9]\d{9}$", digits):
        return f"+91{digits}"
    return None

router = APIRouter()

UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "/app/uploads"))
ID_PROOF_DIR = "tenants"
_ALLOWED_ID_PROOF_EXT = {"jpg", "jpeg", "png", "webp", "pdf", "heic", "heif"}


def _id_proof_target(org_id: UUID, tenant_id: UUID, ext: str) -> Path:
    """`/app/uploads/{org_id}/tenants/{tenant_id}.{ext}` — flat per tenant."""
    return UPLOAD_ROOT / str(org_id) / ID_PROOF_DIR / f"{tenant_id}.{ext}"


# ── Schemas ────────────────────────────────────────────────────────────────────

class OtherCharge(BaseModel):
    label: str
    amount_paise: int


class RentPlanCreate(BaseModel):
    monthly_rent_paise: int
    security_deposit_paise: int = 0
    advance_paid_paise: int = 0
    """Refundable advance — combined with security_deposit_paise at checkout for refund calc."""
    non_refundable_advance_paise: int = 0
    """Non-refundable advance / joining fee — kept by the PG, not refunded at checkout."""
    discount_amount_paise: int = 0
    discount_reason: str | None = None
    food_included: bool = False
    food_charges_paise: int = 0
    other_charges: list[OtherCharge] = []
    billing_day: int = 1
    effective_from: date


class TenantCreate(BaseModel):
    name: str
    phone: str
    email: str | None = None
    id_type: str = "AADHAR"
    id_number: str
    emergency_contact_name: str
    emergency_contact_phone: str
    emergency_contact_relation: str
    occupation: str | None = None
    employer_name: str | None = None
    hometown: str | None = None
    permanent_address: str | None = None
    bed_id: UUID
    move_in_date: date
    expected_move_out_date: date | None = None
    notes: str | None = None
    rent_plan: RentPlanCreate


class CheckoutRequest(BaseModel):
    actual_move_out_date: date
    final_payment_amount_paise: int = 0
    refund_amount_paise: int = 0
    refund_paid_by: str | None = None
    notes: str | None = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/tenants", status_code=status.HTTP_201_CREATED, summary="Check in tenant")
async def checkin_tenant(
    body: TenantCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    # Verify bed is vacant
    bed_result = await db.execute(
        text("SELECT id, room_id, property_id, status FROM beds WHERE id = :id"),
        {"id": str(body.bed_id)},
    )
    bed = bed_result.mappings().fetchone()
    if not bed:
        raise NotFoundError("Bed", body.bed_id)
    if bed["status"] != "VACANT":
        raise ConflictError(f"Bed is {bed['status']}, not available for check-in")

    property_id = bed["property_id"]

    # Check phone uniqueness per property
    existing = await db.execute(
        text("SELECT id FROM tenants WHERE phone = :phone AND property_id = :pid AND is_deleted = false"),
        {"phone": body.phone, "pid": str(property_id)},
    )
    if existing.scalar_one_or_none():
        raise ConflictError("A tenant with this phone number already exists in this property")

    # Create tenant
    tenant_result = await db.execute(
        text("""
            INSERT INTO tenants (
                org_id, property_id, bed_id, name, phone, email,
                id_type, id_number, emergency_contact_name, emergency_contact_phone,
                emergency_contact_relation, occupation, employer_name, hometown,
                permanent_address, move_in_date, expected_move_out_date, status,
                notes, created_by
            )
            VALUES (
                :org_id, :pid, :bed_id, :name, :phone, :email,
                CAST(:id_type AS id_type_enum), :id_number, :ec_name, :ec_phone, :ec_rel,
                :occupation, :employer, :hometown, :address,
                :move_in, :move_out, 'ACTIVE'::tenant_status_enum, :notes, :creator
            )
            RETURNING id
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(property_id), "bed_id": str(body.bed_id),
            "name": body.name, "phone": body.phone, "email": body.email,
            "id_type": body.id_type, "id_number": body.id_number,
            "ec_name": body.emergency_contact_name, "ec_phone": body.emergency_contact_phone,
            "ec_rel": body.emergency_contact_relation, "occupation": body.occupation,
            "employer": body.employer_name, "hometown": body.hometown,
            "address": body.permanent_address, "move_in": body.move_in_date,
            "move_out": body.expected_move_out_date, "notes": body.notes,
            "creator": str(ctx.user_id),
        },
    )
    tenant_id = tenant_result.scalar_one()

    # Create rent plan
    rp = body.rent_plan
    other_charges_json = json.dumps([c.model_dump() for c in rp.other_charges])
    await db.execute(
        text("""
            INSERT INTO rent_plans (
                tenant_id, property_id, monthly_rent_paise, security_deposit_paise,
                advance_paid_paise, non_refundable_advance_paise,
                discount_amount_paise, discount_reason,
                food_included, food_charges_paise, other_charges_json,
                billing_day, effective_from, is_active, created_by
            )
            VALUES (
                :tenant_id, :pid, :monthly_rent, :deposit, :advance, :non_refund_advance,
                :discount, :discount_reason, :food_included, :food_charges,
                CAST(:other_charges AS jsonb), :billing_day, :effective_from, true, :creator
            )
        """),
        {
            "tenant_id": str(tenant_id), "pid": str(property_id),
            "monthly_rent": rp.monthly_rent_paise, "deposit": rp.security_deposit_paise,
            "advance": rp.advance_paid_paise,
            "non_refund_advance": rp.non_refundable_advance_paise,
            "discount": rp.discount_amount_paise,
            "discount_reason": rp.discount_reason, "food_included": rp.food_included,
            "food_charges": rp.food_charges_paise, "other_charges": other_charges_json,
            "billing_day": rp.billing_day, "effective_from": rp.effective_from,
            "creator": str(ctx.user_id),
        },
    )

    # Mark bed as occupied
    await db.execute(
        text("UPDATE beds SET status = 'OCCUPIED'::bed_status_enum, updated_at = NOW() WHERE id = :id"),
        {"id": str(body.bed_id)},
    )

    # Audit log
    await db.execute(
        text("""
            INSERT INTO audit_log (org_id, property_id, actor_id, actor_role, action, table_name, record_id, new_values)
            VALUES (:org_id, :pid, :actor, :role, 'INSERT'::audit_action_enum, 'tenants', :record_id, CAST(:new_vals AS jsonb))
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(property_id),
            "actor": str(ctx.user_id), "role": ctx.role,
            "record_id": str(tenant_id),
            "new_vals": json.dumps({"name": body.name, "phone": body.phone, "bed_id": str(body.bed_id)}),
        },
    )

    await log_event(
        db,
        Event.TENANT_CHECKIN,
        description=f"{ctx.name} checked in {body.name}",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="tenant",
        entity_id=tenant_id,
        entity_name=body.name,
        property_id=property_id,
        tenant_id=tenant_id,
        metadata={
            "bed_id": str(body.bed_id),
            "move_in_date": str(body.move_in_date),
            "monthly_rent_paise": rp.monthly_rent_paise,
            "advance_paid_paise": rp.advance_paid_paise,
        },
    )

    await db.commit()
    return {"tenant_id": str(tenant_id), "message": "Tenant checked in successfully"}


@router.get("/tenants", summary="List tenants")
async def list_tenants(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    upcoming_moveout: bool = Query(False),
    limit: int = Query(200, le=500),
    cursor: str | None = Query(None),
    sort_by: str = Query("room", regex="^(room|name|move_in)$"),
):
    """
    Sorted by floor → room → bed by default ('room' sort_by) so the list mirrors
    the physical layout of the building. Pass sort_by=name or =move_in to override.
    """
    conditions = ["t.org_id = :org_id", "t.is_deleted = false"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}

    if property_id:
        conditions.append("t.property_id = :property_id")
        params["property_id"] = str(property_id)
    elif ctx.role not in ("OWNER", "PARTNER") and ctx.property_ids:
        pids = [str(p) for p in ctx.property_ids]
        conditions.append(f"t.property_id = ANY(ARRAY{pids}::uuid[])")

    # status=None or "ACTIVE" → only active (default, back-compat).
    # status="ALL" → no status filter (active + checked-out + reserved).
    # status="CHECKED_OUT" / etc. → exact match.
    if status and status.upper() == "ALL":
        pass  # no status filter
    elif status:
        conditions.append("t.status = CAST(:status AS tenant_status_enum)")
        params["status"] = status
    else:
        conditions.append("t.status = 'ACTIVE'::tenant_status_enum")

    if search:
        conditions.append("(t.name ILIKE :search OR t.phone ILIKE :search)")
        params["search"] = f"%{search}%"

    if upcoming_moveout:
        conditions.append("t.expected_move_out_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'")

    order_by = {
        "room": "f.floor_number NULLS LAST, "
                "NULLIF(regexp_replace(r.room_number, '\\D', '', 'g'), '')::int NULLS LAST, "
                "r.room_number, b.bed_label, t.name",
        "name": "t.name",
        "move_in": "t.move_in_date DESC, t.name",
    }[sort_by]

    where_clause = " AND ".join(conditions)
    result = await db.execute(
        text(rf"""
            SELECT t.id, t.name, t.phone, t.email, t.status,
                   t.move_in_date, t.expected_move_out_date,
                   b.id as bed_id, b.bed_label,
                   r.id as room_id, r.room_number, r.display_name as room_name,
                   f.id as floor_id, f.floor_number, f.display_name as floor_name,
                   rt.name as room_type,
                   p.name as property_name,
                   rp.monthly_rent_paise,
                   COALESCE(rle.amount_due_paise - rle.amount_paid_paise, 0) as outstanding_paise,
                   COALESCE(rle.status::text, 'UNPAID') as rent_status,
                   t.is_deleted
            FROM tenants t
            LEFT JOIN beds b ON b.id = t.bed_id
            LEFT JOIN rooms r ON r.id = b.room_id
            LEFT JOIN floors f ON f.id = r.floor_id
            LEFT JOIN room_types rt ON rt.id = r.room_type_id
            LEFT JOIN properties p ON p.id = t.property_id
            LEFT JOIN LATERAL (
                SELECT monthly_rent_paise FROM rent_plans
                WHERE tenant_id = t.id AND is_active = true
                ORDER BY effective_from DESC LIMIT 1
            ) rp ON true
            LEFT JOIN rent_ledger_entries rle ON rle.tenant_id = t.id
                AND rle.month = EXTRACT(MONTH FROM CURRENT_DATE)
                AND rle.year = EXTRACT(YEAR FROM CURRENT_DATE)
            WHERE {where_clause}
            ORDER BY {order_by}
            LIMIT :limit
        """),
        {**params, "limit": limit},
    )
    rows = result.mappings().fetchall()

    # is_active for backwards compat with the frontend
    items = []
    for r in rows:
        d = dict(r)
        d["is_active"] = (d.get("status") == "ACTIVE")
        items.append(d)
    return {"items": items, "total": len(items), "next_cursor": None}


class TenantUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    id_type: str | None = None
    id_number: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relation: str | None = None
    occupation: str | None = None
    employer_name: str | None = None
    hometown: str | None = None
    permanent_address: str | None = None
    expected_move_out_date: date | None = None
    notes: str | None = None
    # Rent-plan fields editable after check-in. They land on the active rent_plan
    # row, not on the tenants row.
    security_deposit_paise: int | None = None
    advance_paid_paise: int | None = None
    non_refundable_advance_paise: int | None = None


class RefundUpdate(BaseModel):
    """Payload to record (or correct) a refund after the tenant has checked out."""
    refund_amount_paise: int
    refund_paid_by: str | None = None
    refund_date: date
    notes: str | None = None
    payment_mode: str = "CASH"
    reference_number: str | None = None


@router.patch("/tenants/{tenant_id}", summary="Update tenant profile")
async def update_tenant(
    tenant_id: UUID,
    body: TenantUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        from fastapi import HTTPException
        raise HTTPException(400, "No fields to update")

    # Pull rent-plan fields out — they update rent_plans, not tenants.
    rent_plan_updates: dict[str, Any] = {}
    for k in (
        "security_deposit_paise",
        "advance_paid_paise",
        "non_refundable_advance_paise",
    ):
        if k in updates:
            rent_plan_updates[k] = int(updates.pop(k))

    rent_plan_changes: dict[str, dict] = {}
    if rent_plan_updates:
        rp_cols = ", ".join(rent_plan_updates.keys())
        old_rp = (await db.execute(
            text(f"SELECT {rp_cols} FROM rent_plans WHERE tenant_id = :tid AND is_active = true"),
            {"tid": str(tenant_id)},
        )).mappings().fetchone()
        rp_set = ", ".join(f"{k} = :{k}" for k in rent_plan_updates)
        result = await db.execute(
            text(
                f"UPDATE rent_plans SET {rp_set}, updated_at = NOW() "
                f"WHERE tenant_id = :tid AND is_active = true"
            ),
            {**rent_plan_updates, "tid": str(tenant_id)},
        )
        if result.rowcount == 0:
            from fastapi import HTTPException
            raise HTTPException(
                400,
                "No active rent plan for this tenant; cannot update deposit/advance.",
            )
        rent_plan_changes = diff_changes(dict(old_rp) if old_rp else {}, rent_plan_updates)

    if not updates:
        await log_event(
            db,
            Event.TENANT_PROFILE_UPDATED,
            description=f"{ctx.name} updated deposit/advance",
            actor_user_id=ctx.user_id,
            actor_role=ctx.role,
            actor_name=ctx.name,
            entity_type="tenant",
            entity_id=tenant_id,
            tenant_id=tenant_id,
            metadata={"changes": rent_plan_changes},
        )
        await db.commit()
        return {"message": "Tenant updated"}

    # Phone normalisation if provided
    if "phone" in updates:
        normalised = _normalise_phone(updates["phone"])
        if not normalised:
            from fastapi import HTTPException
            raise HTTPException(400, "Invalid phone")
        updates["phone"] = normalised
        # Phone uniqueness per property
        existing = await db.execute(
            text("""
                SELECT id FROM tenants
                WHERE phone = :phone AND id <> :id AND is_deleted = false
                  AND property_id = (SELECT property_id FROM tenants WHERE id = :id)
            """),
            {"phone": updates["phone"], "id": str(tenant_id)},
        )
        if existing.scalar_one_or_none():
            raise ConflictError("A tenant with this phone number already exists in this property")
    if "emergency_contact_phone" in updates:
        normalised = _normalise_phone(updates["emergency_contact_phone"])
        if not normalised:
            from fastapi import HTTPException
            raise HTTPException(400, "Invalid emergency contact phone")
        updates["emergency_contact_phone"] = normalised

    # Capture old values BEFORE the update for a precise before/after diff.
    tenant_cols = ", ".join(updates.keys())
    old_tenant = (await db.execute(
        text(f"SELECT {tenant_cols} FROM tenants WHERE id = :id AND org_id = :org_id"),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )).mappings().fetchone()
    tenant_changes = diff_changes(dict(old_tenant) if old_tenant else {}, updates)

    set_parts = []
    for k in updates:
        if k == "id_type":
            set_parts.append("id_type = CAST(:id_type AS id_type_enum)")
        else:
            set_parts.append(f"{k} = :{k}")
    set_clause = ", ".join(set_parts)
    updates["id"] = str(tenant_id)
    updates["org_id"] = str(ctx.org_id)
    await db.execute(
        text(
            f"UPDATE tenants SET {set_clause}, updated_at = NOW() "
            f"WHERE id = :id AND org_id = :org_id AND is_deleted = false"
        ),
        updates,
    )

    await log_event(
        db,
        Event.TENANT_PROFILE_UPDATED,
        description=f"{ctx.name} updated tenant profile",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="tenant",
        entity_id=tenant_id,
        tenant_id=tenant_id,
        metadata={"changes": {**tenant_changes, **rent_plan_changes}},
    )
    await db.commit()
    return {"message": "Tenant updated"}


@router.get("/tenants/{tenant_id}", summary="Tenant full profile")
async def get_tenant(
    tenant_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT t.*, b.bed_label, r.room_number, r.display_name as room_name,
                   f.display_name as floor_name, p.name as property_name
            FROM tenants t
            LEFT JOIN beds b ON b.id = t.bed_id
            LEFT JOIN rooms r ON r.id = b.room_id
            LEFT JOIN floors f ON f.id = r.floor_id
            LEFT JOIN properties p ON p.id = t.property_id
            WHERE t.id = :id AND t.org_id = :org_id
        """),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )
    tenant = result.mappings().fetchone()
    if not tenant:
        raise NotFoundError("Tenant", tenant_id)

    # Latest rent plan — return even if inactive (after checkout) so the UI can
    # still display deposit/advance for refund reconciliation.
    rp_result = await db.execute(
        text(
            "SELECT * FROM rent_plans WHERE tenant_id = :id "
            "ORDER BY is_active DESC, effective_from DESC LIMIT 1"
        ),
        {"id": str(tenant_id)},
    )
    rent_plan = rp_result.mappings().fetchone()

    # Refund total paid so far (REFUND payments)
    refund_result = await db.execute(
        text(
            "SELECT COALESCE(SUM(amount_paise), 0) AS refunded "
            "FROM payments WHERE tenant_id = :id AND payment_type = 'REFUND'::payment_type_enum"
        ),
        {"id": str(tenant_id)},
    )
    refunded = refund_result.scalar_one() or 0

    return {
        **dict(tenant),
        "active_rent_plan": dict(rent_plan) if rent_plan else None,
        "refunded_paise": int(refunded),
    }


@router.post("/tenants/{tenant_id}/checkout", summary="Check out tenant")
async def checkout_tenant(
    tenant_id: UUID,
    body: CheckoutRequest,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    tenant_result = await db.execute(
        text("SELECT id, bed_id, property_id, name, status FROM tenants WHERE id = :id AND org_id = :org_id"),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )
    tenant = tenant_result.mappings().fetchone()
    if not tenant:
        raise NotFoundError("Tenant", tenant_id)
    if tenant["status"] != "ACTIVE":
        raise ConflictError("Tenant is not active")

    # Calculate total outstanding
    outstanding_result = await db.execute(
        text("""
            SELECT COALESCE(SUM(amount_due_paise - amount_paid_paise), 0) as total_outstanding
            FROM rent_ledger_entries
            WHERE tenant_id = :id AND status IN ('UNPAID', 'PARTIAL')
        """),
        {"id": str(tenant_id)},
    )
    total_outstanding = outstanding_result.scalar_one() or 0

    # Mark tenant as checked out
    await db.execute(
        text("""
            UPDATE tenants SET status = 'CHECKED_OUT'::tenant_status_enum, actual_move_out_date = :move_out, updated_at = NOW()
            WHERE id = :id
        """),
        {"id": str(tenant_id), "move_out": body.actual_move_out_date},
    )

    # Free the bed
    if tenant["bed_id"]:
        await db.execute(
            text("UPDATE beds SET status = 'VACANT'::bed_status_enum, updated_at = NOW() WHERE id = :id"),
            {"id": str(tenant["bed_id"])},
        )

    # Deactivate rent plan
    await db.execute(
        text("UPDATE rent_plans SET is_active = false, effective_to = :date WHERE tenant_id = :tid AND is_active = true"),
        {"date": body.actual_move_out_date, "tid": str(tenant_id)},
    )

    # If refund details given, record as a REFUND payment row so it surfaces
    # in the rent KPI "Refunds Given" + dashboard.
    if (body.refund_amount_paise or 0) > 0:
        from uuid import uuid4 as _uuid4
        await db.execute(
            text("""
                INSERT INTO payments (
                    org_id, property_id, tenant_id, amount_paise,
                    payment_type, payment_mode,
                    paid_to, for_month, for_year, collected_by, collected_at,
                    notes, idempotency_key
                ) VALUES (
                    :org_id, :pid, :tenant_id, :amount,
                    'REFUND'::payment_type_enum, 'CASH'::payment_mode_enum,
                    :paid_by, :month, :year, :user, :collected_at,
                    :notes, :ikey
                )
            """),
            {
                "org_id": str(ctx.org_id),
                "pid": str(tenant["property_id"]),
                "tenant_id": str(tenant_id),
                "amount": int(body.refund_amount_paise or 0),
                "paid_by": (body.refund_paid_by or "").strip() or None,
                "month": body.actual_move_out_date.month,
                "year": body.actual_move_out_date.year,
                "user": str(ctx.user_id),
                "collected_at": body.actual_move_out_date,
                "notes": (body.notes or "").strip() or "Refund on checkout",
                "ikey": str(_uuid4()),
            },
        )

    # Audit log
    await db.execute(
        text("""
            INSERT INTO audit_log (org_id, property_id, actor_id, actor_role, action, table_name, record_id, new_values)
            VALUES (:org_id, :pid, :actor, :role, 'UPDATE'::audit_action_enum, 'tenants', :record_id, CAST(:new_vals AS jsonb))
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(tenant["property_id"]),
            "actor": str(ctx.user_id), "role": ctx.role,
            "record_id": str(tenant_id),
            "new_vals": json.dumps({"status": "CHECKED_OUT", "move_out_date": str(body.actual_move_out_date)}),
        },
    )

    await log_event(
        db,
        Event.TENANT_CHECKOUT,
        description=f"{ctx.name} checked out {tenant['name']}",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="tenant",
        entity_id=tenant_id,
        entity_name=tenant["name"],
        property_id=tenant["property_id"],
        tenant_id=tenant_id,
        metadata={
            "move_out_date": str(body.actual_move_out_date),
            "outstanding_paise": int(total_outstanding),
            "refund_amount_paise": int(body.refund_amount_paise or 0),
        },
    )

    await db.commit()

    return {
        "message": "Tenant checked out successfully",
        "total_outstanding_paise": total_outstanding,
        "refund_amount_paise": body.refund_amount_paise,
        "actual_move_out_date": str(body.actual_move_out_date),
    }


@router.post("/tenants/{tenant_id}/refund", summary="Record a refund post-checkout")
async def record_refund(
    tenant_id: UUID,
    body: RefundUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """
    For tenants already checked out: record (or top up) the deposit refund as a
    REFUND payment row. Multiple calls append more rows — they don't overwrite,
    so the partner can split a refund across days/modes if needed.
    """
    if ctx.role not in ("OWNER", "PARTNER", "PROPERTY_MANAGER"):
        raise HTTPException(403, "Only owners/managers can record refunds")
    if (body.refund_amount_paise or 0) <= 0:
        raise HTTPException(400, "Refund amount must be positive")

    tenant_result = await db.execute(
        text("SELECT id, property_id, name, status FROM tenants WHERE id = :id AND org_id = :org_id AND is_deleted = false"),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )
    tenant = tenant_result.mappings().fetchone()
    if not tenant:
        raise NotFoundError("Tenant", tenant_id)
    if tenant["status"] != "CHECKED_OUT":
        raise ConflictError("Tenant must be checked out before recording a refund")

    from uuid import uuid4 as _uuid4
    await db.execute(
        text("""
            INSERT INTO payments (
                org_id, property_id, tenant_id, amount_paise,
                payment_type, payment_mode,
                paid_to, for_month, for_year, collected_by, collected_at,
                notes, reference_number, idempotency_key
            ) VALUES (
                :org_id, :pid, :tenant_id, :amount,
                'REFUND'::payment_type_enum, CAST(:mode AS payment_mode_enum),
                :paid_by, :month, :year, :user, :collected_at,
                :notes, :ref, :ikey
            )
        """),
        {
            "org_id": str(ctx.org_id),
            "pid": str(tenant["property_id"]),
            "tenant_id": str(tenant_id),
            "amount": int(body.refund_amount_paise),
            "mode": body.payment_mode or "CASH",
            "paid_by": (body.refund_paid_by or "").strip() or None,
            "month": body.refund_date.month,
            "year": body.refund_date.year,
            "user": str(ctx.user_id),
            "collected_at": body.refund_date,
            "notes": (body.notes or "").strip() or "Refund recorded after checkout",
            "ref": (body.reference_number or "").strip() or None,
            "ikey": str(_uuid4()),
        },
    )

    await db.execute(
        text("""
            INSERT INTO audit_log (org_id, property_id, actor_id, actor_role, action, table_name, record_id, new_values)
            VALUES (:org_id, :pid, :actor, :role, 'INSERT'::audit_action_enum, 'payments', :record_id, CAST(:new_vals AS jsonb))
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(tenant["property_id"]),
            "actor": str(ctx.user_id), "role": ctx.role,
            "record_id": str(tenant_id),
            "new_vals": json.dumps({
                "type": "REFUND",
                "amount_paise": int(body.refund_amount_paise),
                "refund_date": str(body.refund_date),
            }),
        },
    )

    await log_event(
        db,
        Event.REFUND_ISSUED,
        description=f"{ctx.name} refunded ₹{int(body.refund_amount_paise) / 100:,.0f} to {tenant['name']}",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="tenant",
        entity_id=tenant_id,
        entity_name=tenant["name"],
        property_id=tenant["property_id"],
        tenant_id=tenant_id,
        metadata={
            "refund_amount_paise": int(body.refund_amount_paise),
            "refund_date": str(body.refund_date),
            "payment_mode": body.payment_mode or "CASH",
        },
    )

    await db.commit()
    return {
        "message": "Refund recorded",
        "refund_amount_paise": int(body.refund_amount_paise),
    }


@router.post("/tenants/{tenant_id}/id-proof", summary="Upload Aadhar / address-proof (image or PDF)")
async def upload_id_proof(
    tenant_id: UUID,
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Accepts an image (jpg/png/webp/heic) or a PDF. Images are compressed to
    JPEG (max 1600px wide, q85). PDFs are stored as-is. Stored under
    /app/uploads/{org_id}/tenants/{tenant_id}.{ext}.
    """
    if ctx.role not in ("OWNER", "PARTNER", "PROPERTY_MANAGER", "SUPERVISOR"):
        raise HTTPException(403, "Insufficient permission to upload ID proofs")

    own = await db.execute(
        text("SELECT id FROM tenants WHERE id = :id AND org_id = :org_id AND is_deleted = false"),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )
    if not own.scalar_one_or_none():
        raise NotFoundError("Tenant", tenant_id)

    filename = (file.filename or "").lower()
    suffix = filename.rsplit(".", 1)[-1] if "." in filename else ""
    if suffix not in _ALLOWED_ID_PROOF_EXT:
        # Fall back to content-type sniff
        ct = (file.content_type or "").lower()
        if ct.startswith("image/"):
            suffix = "jpg"
        elif ct == "application/pdf":
            suffix = "pdf"
        else:
            raise HTTPException(400, "Upload must be an image or PDF")

    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:  # 15 MB hard cap
        raise HTTPException(413, "File too large (max 15 MB)")

    org_dir = UPLOAD_ROOT / str(ctx.org_id) / ID_PROOF_DIR
    try:
        org_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(500, f"Could not create upload directory: {e}")

    if suffix == "pdf":
        target = _id_proof_target(ctx.org_id, tenant_id, "pdf")
        for ext in ("jpg", "jpeg", "png", "webp", "heic", "heif"):
            _id_proof_target(ctx.org_id, tenant_id, ext).unlink(missing_ok=True)
        try:
            target.write_bytes(raw)
        except OSError as e:
            raise HTTPException(500, f"Could not write file to disk: {e}")
        ext_saved = "pdf"
    else:
        try:
            from PIL import Image, ImageOps
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"Image processing not available: {e}")
        try:
            with Image.open(io.BytesIO(raw)) as img:
                img = ImageOps.exif_transpose(img).convert("RGB")
                if img.width > 1600:
                    ratio = 1600 / img.width
                    img = img.resize((1600, int(img.height * ratio)))
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85, optimize=True)
                jpg_bytes = buf.getvalue()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"Could not read image: {e}")
        target = _id_proof_target(ctx.org_id, tenant_id, "jpg")
        for ext in ("pdf", "jpeg", "png", "webp", "heic", "heif"):
            _id_proof_target(ctx.org_id, tenant_id, ext).unlink(missing_ok=True)
        try:
            target.write_bytes(jpg_bytes)
        except OSError as e:
            raise HTTPException(500, f"Could not write file to disk: {e}")
        ext_saved = "jpg"

    rel_path = f"{ctx.org_id}/{ID_PROOF_DIR}/{tenant_id}.{ext_saved}"
    try:
        await db.execute(
            text("""
                UPDATE tenants SET id_proof_path = :path, updated_at = NOW()
                WHERE id = :id AND org_id = :org_id
            """),
            {"id": str(tenant_id), "org_id": str(ctx.org_id), "path": rel_path},
        )
        await log_event(
            db,
            Event.TENANT_ID_UPLOADED,
            description=f"{ctx.name} uploaded ID proof",
            actor_user_id=ctx.user_id,
            actor_role=ctx.role,
            actor_name=ctx.name,
            entity_type="tenant",
            entity_id=tenant_id,
            tenant_id=tenant_id,
            metadata={"file_type": ext_saved},
        )
        await db.commit()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Could not save ID proof path: {e}")
    return {"id_proof_path": rel_path, "size_bytes": target.stat().st_size}


@router.get(
    "/tenants/{tenant_id}/id-proof",
    summary="Stream the tenant ID proof (auth-checked)",
)
async def get_id_proof(
    tenant_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text("""
            SELECT id_proof_path FROM tenants
            WHERE id = :id AND org_id = :org_id AND is_deleted = false
        """),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )
    rel = row.scalar_one_or_none()
    if not rel:
        raise NotFoundError("ID proof", tenant_id)
    full = UPLOAD_ROOT / rel
    if not full.exists():
        raise NotFoundError("ID proof", tenant_id)
    media = "application/pdf" if rel.lower().endswith(".pdf") else "image/jpeg"
    return FileResponse(str(full), media_type=media, filename=full.name)


@router.delete("/tenants/{tenant_id}/id-proof", summary="Remove the tenant ID proof")
async def delete_id_proof(
    tenant_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER", "PROPERTY_MANAGER"):
        raise HTTPException(403, "Insufficient permission")
    row = await db.execute(
        text("SELECT id_proof_path FROM tenants WHERE id = :id AND org_id = :org_id"),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )
    rel = row.scalar_one_or_none()
    if rel:
        try:
            (UPLOAD_ROOT / rel).unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass
    await db.execute(
        text(
            "UPDATE tenants SET id_proof_path = NULL, updated_at = NOW() "
            "WHERE id = :id AND org_id = :org_id"
        ),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )
    await db.commit()
    return {"message": "ID proof removed"}


@router.get("/tenants/{tenant_id}/ledger", summary="Tenant rent ledger")
async def tenant_ledger(
    tenant_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT id, month, year, amount_due_paise, amount_paid_paise,
                   (amount_due_paise - amount_paid_paise) as outstanding_paise,
                   status, due_date, notes, created_at
            FROM rent_ledger_entries
            WHERE tenant_id = :id
            ORDER BY year DESC, month DESC
        """),
        {"id": str(tenant_id)},
    )
    entries = [dict(r) for r in result.mappings().fetchall()]

    totals_result = await db.execute(
        text("""
            SELECT SUM(amount_due_paise) as total_due, SUM(amount_paid_paise) as total_paid
            FROM rent_ledger_entries WHERE tenant_id = :id
        """),
        {"id": str(tenant_id)},
    )
    totals = totals_result.mappings().fetchone()

    return {
        "tenant_id": str(tenant_id),
        "entries": entries,
        "total_due_paise": totals["total_due"] or 0,
        "total_paid_paise": totals["total_paid"] or 0,
        "total_outstanding_paise": (totals["total_due"] or 0) - (totals["total_paid"] or 0),
    }


SAMPLE_CSV = (
    "name,phone,email,id_type,id_number,emergency_contact_name,emergency_contact_phone,"
    "emergency_contact_relation,bed_label,room_number,floor_name,move_in_date,monthly_rent,"
    "security_deposit,advance_paid,billing_day\n"
    "Rahul Sharma,9876543210,rahul@example.com,AADHAR,1234 5678 9012,Suresh Sharma,9876500000,"
    "Father,A,101,Ground,2026-05-01,7000,7000,0,1\n"
    "Priya Verma,+91 9876512345,priya@example.com,AADHAR,2222 3333 4444,Anita Verma,9876511111,"
    "Mother,B,102,1st,2026-05-05,8500,8500,0,1\n"
)


@router.get(
    "/tenants/import/sample.csv",
    summary="Download sample CSV for tenant bulk import",
    response_class=PlainTextResponse,
)
async def tenants_import_sample(
    ctx: OrgContext = Depends(get_org_context),
):
    return PlainTextResponse(
        SAMPLE_CSV,
        headers={
            "Content-Disposition": 'attachment; filename="pgmanage_tenants_sample.csv"',
            "Content-Type": "text/csv",
        },
    )


@router.post("/tenants/bulk-import", summary="Bulk import tenants from a CSV file")
async def bulk_import_tenants(
    property_id: UUID = Query(..., description="Property the tenants will be imported into"),
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Each row creates a tenant + an active rent plan and assigns the named bed.
    Required columns: name, phone, id_type, id_number, emergency_contact_name,
                     emergency_contact_phone, emergency_contact_relation,
                     bed_label, room_number, floor_name, move_in_date, monthly_rent.
    Optional: email, security_deposit, advance_paid, billing_day.
    """
    if ctx.role not in ("OWNER", "PARTNER", "PROPERTY_MANAGER"):
        from fastapi import HTTPException
        raise HTTPException(403, "Only owners or property managers can bulk-import tenants")

    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    required = {
        "name", "phone", "id_type", "id_number",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
        "bed_label", "room_number", "floor_name", "move_in_date", "monthly_rent",
    }
    missing = required - {c.strip() for c in (reader.fieldnames or [])}
    if missing:
        from fastapi import HTTPException
        raise HTTPException(400, f"CSV is missing required columns: {sorted(missing)}")

    created = 0
    errors: list[dict[str, Any]] = []

    for idx, row in enumerate(reader, start=2):  # row 1 = header
        try:
            row = {k.strip(): (v or "").strip() for k, v in row.items() if k}

            # Resolve bed by floor_name + room_number + bed_label
            bed_q = await db.execute(
                text("""
                    SELECT b.id, b.status
                    FROM beds b
                    JOIN rooms r ON r.id = b.room_id
                    JOIN floors f ON f.id = r.floor_id
                    WHERE b.property_id = :pid
                      AND lower(f.display_name) = lower(:floor_name)
                      AND r.room_number = :room_number
                      AND b.bed_label = :bed_label
                """),
                {
                    "pid": str(property_id),
                    "floor_name": row["floor_name"],
                    "room_number": row["room_number"],
                    "bed_label": row["bed_label"],
                },
            )
            bed = bed_q.mappings().fetchone()
            if not bed:
                errors.append({"row": idx, "name": row.get("name"), "error": "Bed not found"})
                continue
            if bed["status"] != "VACANT":
                errors.append({"row": idx, "name": row.get("name"), "error": f"Bed is {bed['status']}"})
                continue

            phone = _normalise_phone(row["phone"])
            if not phone:
                errors.append({"row": idx, "name": row.get("name"), "error": "Invalid phone"})
                continue

            ec_phone = _normalise_phone(row["emergency_contact_phone"])
            if not ec_phone:
                errors.append({"row": idx, "name": row.get("name"), "error": "Invalid emergency phone"})
                continue

            id_type = (row.get("id_type") or "AADHAR").upper()
            if id_type not in {"AADHAR", "PASSPORT", "DRIVING_LICENSE", "OTHER"}:
                id_type = "OTHER"

            try:
                move_in = date.fromisoformat(row["move_in_date"])
            except ValueError:
                errors.append({"row": idx, "name": row.get("name"), "error": "move_in_date must be YYYY-MM-DD"})
                continue

            try:
                monthly_paise = int(round(float(row["monthly_rent"]) * 100))
            except ValueError:
                errors.append({"row": idx, "name": row.get("name"), "error": "monthly_rent must be a number"})
                continue

            deposit_paise = int(round(float(row.get("security_deposit") or 0) * 100))
            advance_paise = int(round(float(row.get("advance_paid") or 0) * 100))
            billing_day = int(row.get("billing_day") or 1)
            if billing_day < 1 or billing_day > 28:
                billing_day = 1

            # Phone uniqueness per property
            existing = await db.execute(
                text("SELECT 1 FROM tenants WHERE phone = :phone AND property_id = :pid AND is_deleted = false"),
                {"phone": phone, "pid": str(property_id)},
            )
            if existing.scalar_one_or_none():
                errors.append({"row": idx, "name": row.get("name"), "error": "Phone already in use"})
                continue

            tenant_q = await db.execute(
                text("""
                    INSERT INTO tenants (
                        org_id, property_id, bed_id, name, phone, email,
                        id_type, id_number, emergency_contact_name, emergency_contact_phone,
                        emergency_contact_relation, move_in_date, status, created_by
                    )
                    VALUES (
                        :org_id, :pid, :bed_id, :name, :phone, :email,
                        CAST(:id_type AS id_type_enum), :id_number, :ec_name, :ec_phone, :ec_rel,
                        :move_in, 'ACTIVE'::tenant_status_enum, :creator
                    )
                    RETURNING id
                """),
                {
                    "org_id": str(ctx.org_id), "pid": str(property_id),
                    "bed_id": str(bed["id"]), "name": row["name"], "phone": phone,
                    "email": row.get("email") or None,
                    "id_type": id_type, "id_number": row["id_number"],
                    "ec_name": row["emergency_contact_name"], "ec_phone": ec_phone,
                    "ec_rel": row["emergency_contact_relation"], "move_in": move_in,
                    "creator": str(ctx.user_id),
                },
            )
            tenant_id = tenant_q.scalar_one()

            await db.execute(
                text("""
                    INSERT INTO rent_plans (
                        tenant_id, property_id, monthly_rent_paise, security_deposit_paise,
                        advance_paid_paise, food_included, food_charges_paise,
                        billing_day, effective_from, is_active, created_by
                    )
                    VALUES (
                        :tenant_id, :pid, :monthly, :deposit, :advance,
                        false, 0, :billing_day, :effective, true, :creator
                    )
                """),
                {
                    "tenant_id": str(tenant_id), "pid": str(property_id),
                    "monthly": monthly_paise, "deposit": deposit_paise,
                    "advance": advance_paise, "billing_day": billing_day,
                    "effective": move_in, "creator": str(ctx.user_id),
                },
            )

            await db.execute(
                text("UPDATE beds SET status = 'OCCUPIED'::bed_status_enum, updated_at = NOW() WHERE id = :id"),
                {"id": str(bed["id"])},
            )
            created += 1
        except Exception as e:  # noqa: BLE001
            errors.append({"row": idx, "name": row.get("name"), "error": str(e)})

    await db.commit()
    return {
        "created": created,
        "errors": errors,
        "total_rows": created + len(errors),
    }


@router.post("/tenants/{tenant_id}/documents", summary="Get presigned URL for document upload")
async def upload_document(
    tenant_id: UUID,
    doc_type: str = Query(default="id_document"),
    filename: str = Query(default="document.jpg"),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    tenant_result = await db.execute(
        text("SELECT property_id FROM tenants WHERE id = :id AND org_id = :org_id"),
        {"id": str(tenant_id), "org_id": str(ctx.org_id)},
    )
    tenant = tenant_result.mappings().fetchone()
    if not tenant:
        raise NotFoundError("Tenant", tenant_id)

    upload_info = await generate_presigned_upload_url(
        org_id=ctx.org_id,
        property_id=tenant["property_id"],
        resource_type=f"tenants/{doc_type}",
        filename=filename,
    )
    return upload_info
