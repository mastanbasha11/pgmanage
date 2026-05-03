"""Tenant self-service portal — OTP login, ledger, complaints, announcements."""
from __future__ import annotations

import re
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, get_org_schema_name, set_schema
from app.core.dependencies import TenantContext, get_current_tenant
from app.core.exceptions import AuthenticationError, NotFoundError
from app.core.security import (
    create_tenant_token,
    generate_otp,
    verify_otp,
)

router = APIRouter(prefix="/tenant")


def get_redis():
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


class TenantOTPRequest(BaseModel):
    phone: str
    property_id: UUID
    org_slug: str


class TenantOTPVerify(BaseModel):
    phone: str
    otp: str
    property_id: UUID
    org_slug: str


class ComplaintSubmit(BaseModel):
    category: str
    description: str
    photo_s3_key: str | None = None


@router.post("/auth/otp", summary="Tenant: request OTP")
async def tenant_request_otp(body: TenantOTPRequest, db: AsyncSession = Depends(get_db)):
    # Verify org exists
    org_result = await db.execute(
        text("SELECT id, schema_name FROM public.organisations WHERE slug = :slug AND is_active = true LIMIT 1"),
        {"slug": body.org_slug},
    )
    org = org_result.fetchone()
    if not org:
        raise NotFoundError("Organisation")

    schema_name = org[1]
    await set_schema(db, schema_name)

    # Verify tenant exists with this phone
    tenant_result = await db.execute(
        text("SELECT id FROM tenants WHERE phone = :phone AND property_id = :pid AND status = 'ACTIVE' LIMIT 1"),
        {"phone": body.phone, "pid": str(body.property_id)},
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise NotFoundError("Tenant")

    otp = generate_otp()
    redis = get_redis()
    key = f"tenant_otp:{body.org_slug}:{body.phone}"
    await redis.setex(key, settings.OTP_EXPIRE_SECONDS, otp)
    await redis.aclose()

    if settings.is_local:
        print(f"TENANT OTP for {body.phone}: {otp}")

    # TODO: Send WhatsApp OTP using org's WABA credentials
    return {"message": "OTP sent", "expires_in": settings.OTP_EXPIRE_SECONDS}


@router.post("/auth/verify", summary="Tenant: verify OTP and get JWT")
async def tenant_verify_otp(body: TenantOTPVerify, db: AsyncSession = Depends(get_db)):
    org_result = await db.execute(
        text("SELECT id, schema_name FROM public.organisations WHERE slug = :slug AND is_active = true LIMIT 1"),
        {"slug": body.org_slug},
    )
    org = org_result.fetchone()
    if not org:
        raise NotFoundError("Organisation")

    org_id, schema_name = org

    redis = get_redis()
    key = f"tenant_otp:{body.org_slug}:{body.phone}"
    stored_otp = await redis.get(key)

    if not stored_otp or not verify_otp(body.otp, stored_otp):
        await redis.aclose()
        raise AuthenticationError("Invalid or expired OTP")

    await redis.delete(key)
    await redis.aclose()

    await set_schema(db, schema_name)
    tenant_result = await db.execute(
        text("SELECT id FROM tenants WHERE phone = :phone AND property_id = :pid AND status = 'ACTIVE' LIMIT 1"),
        {"phone": body.phone, "pid": str(body.property_id)},
    )
    tenant_id = tenant_result.scalar_one_or_none()
    if not tenant_id:
        raise AuthenticationError("Tenant not found")

    token = create_tenant_token(
        tenant_id=tenant_id,
        property_id=body.property_id,
        org_id=org_id,
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", summary="Tenant: own profile and room info")
async def tenant_me(ctx: TenantContext = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT t.id, t.name, t.phone, t.email, t.move_in_date, t.expected_move_out_date,
                   t.occupation, t.employer_name, t.hometown,
                   t.emergency_contact_name, t.emergency_contact_phone, t.emergency_contact_relation,
                   b.bed_label, r.room_number, r.display_name as room_name,
                   f.display_name as floor_name, p.name as property_name, p.address_line1
            FROM tenants t
            LEFT JOIN beds b ON b.id = t.bed_id
            LEFT JOIN rooms r ON r.id = b.room_id
            LEFT JOIN floors f ON f.id = r.floor_id
            LEFT JOIN properties p ON p.id = t.property_id
            WHERE t.id = :id
        """),
        {"id": str(ctx.tenant_id)},
    )
    tenant = result.mappings().fetchone()
    if not tenant:
        raise NotFoundError("Tenant")
    return dict(tenant)


@router.get("/ledger", summary="Tenant: own rent ledger")
async def tenant_ledger(ctx: TenantContext = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT id, month, year, amount_due_paise, amount_paid_paise,
                   (amount_due_paise - amount_paid_paise) as outstanding_paise,
                   status, due_date
            FROM rent_ledger_entries
            WHERE tenant_id = :id
            ORDER BY year DESC, month DESC
        """),
        {"id": str(ctx.tenant_id)},
    )
    entries = [dict(r) for r in result.mappings().fetchall()]

    # Security deposit
    rp_result = await db.execute(
        text("SELECT security_deposit_paise, advance_paid_paise FROM rent_plans WHERE tenant_id = :id AND is_active = true LIMIT 1"),
        {"id": str(ctx.tenant_id)},
    )
    rp = rp_result.mappings().fetchone()

    return {
        "entries": entries,
        "security_deposit_paise": rp["security_deposit_paise"] if rp else 0,
        "advance_paid_paise": rp["advance_paid_paise"] if rp else 0,
    }


@router.get("/complaints", summary="Tenant: own complaints")
async def tenant_complaints(ctx: TenantContext = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, category, description, status, response_note, created_at, resolved_at FROM complaints WHERE tenant_id = :id ORDER BY created_at DESC"),
        {"id": str(ctx.tenant_id)},
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows]}


@router.post("/complaints", status_code=201, summary="Tenant: raise complaint")
async def tenant_raise_complaint(
    body: ComplaintSubmit,
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            INSERT INTO complaints (tenant_id, property_id, org_id, category, description, photo_s3_key, status)
            VALUES (:tenant_id, :pid, :org_id, CAST(:category AS complaint_category_enum), :desc, :photo, 'OPEN'::complaint_status_enum)
            RETURNING id
        """),
        {
            "tenant_id": str(ctx.tenant_id), "pid": str(ctx.property_id),
            "org_id": str(ctx.org_id), "category": body.category,
            "desc": body.description, "photo": body.photo_s3_key,
        },
    )
    complaint_id = result.scalar_one()
    await db.commit()
    return {"complaint_id": str(complaint_id), "message": "Complaint submitted. We'll respond shortly."}


@router.get("/announcements", summary="Tenant: announcements targeted to them")
async def tenant_announcements(ctx: TenantContext = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT id, title, body, created_at
            FROM announcements
            WHERE property_id = :pid
                AND status = 'SENT'
                AND (target_type = 'ALL_TENANTS' OR :tenant_id = ANY(target_ids))
            ORDER BY created_at DESC
            LIMIT 20
        """),
        {"pid": str(ctx.property_id), "tenant_id": str(ctx.tenant_id)},
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows]}
