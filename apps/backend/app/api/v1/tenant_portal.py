"""Tenant self-service portal — phone-first OTP login, ledger, complaints, announcements.

Auth flow (v2 — phone-first, supports multi-org tenants):

  1. Tenant enters phone → POST /tenant/auth/otp { phone }.
     Server looks up public.tenant_identity by phone:
       - Found + has email → email OTP. Return { delivery: 'email', masked }.
       - Found, no email   → 'no_delivery_channel' error; owner must issue
         a code via the staff app.
       - Not found         → 404; tenant needs an invite (covered in v2).

  2. Tenant enters code → POST /tenant/auth/verify { phone, code }.
     Server validates code against Redis. Then:
       - 1 ACTIVE link → return JWT for that org directly.
       - >1 ACTIVE     → return { needs_org_pick: true, orgs: [...], ticket }.
       - 1 PENDING     → return { needs_pending: true, request_id, org } (v2).
       - 0             → 403 (shouldn't happen if step 1 succeeded).

  3. (multi-org case only) POST /tenant/auth/select-org { ticket, org_id }
     → JWT for the chosen org.

OTP delivery is email-only for v1; WhatsApp will be added in parallel once
Meta App Review clears. Codes are 6 digits, 5-minute TTL, Redis-backed.
"""
from __future__ import annotations

import json
from uuid import UUID, uuid4

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_schema
from app.core.dependencies import TenantContext, get_current_tenant
from app.core.exceptions import AuthenticationError, NotFoundError
from app.core.security import (
    create_tenant_token,
    generate_otp,
    verify_otp,
)
from app.services.email_service import send_tenant_otp_email

router = APIRouter(prefix="/tenant")


def get_redis():
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


# ── Phone normalisation ──────────────────────────────────────────────────────
# Matches the staff app's normalisation so a phone stored as '+919876543210'
# is found regardless of whether the user types '9876543210' or '09876543210'.

def _normalise_phone(raw: str) -> str:
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10 and digits[0] in "6789":
        return f"+91{digits}"
    # Fall back to raw — backend stores +91XXXXXXXXXX uniformly, so anything
    # else is a non-match.
    return raw.strip()


# ── Request / response models ────────────────────────────────────────────────

class TenantOTPRequest(BaseModel):
    phone: str


class TenantOTPVerify(BaseModel):
    phone: str
    code: str


class TenantSelectOrg(BaseModel):
    ticket: str
    org_id: UUID


class ComplaintSubmit(BaseModel):
    category: str
    description: str
    photo_s3_key: str | None = None


# ── Auth ────────────────────────────────────────────────────────────────────

@router.post("/auth/otp", summary="Tenant: request OTP (phone-first)")
async def tenant_request_otp(body: TenantOTPRequest, db: AsyncSession = Depends(get_db)):
    """
    Request a login code for `phone`. Caller does NOT need to know which org
    they belong to — we look that up via public.tenant_identity.
    """
    phone = _normalise_phone(body.phone)

    identity = (
        await db.execute(
            text(
                "SELECT id, email FROM public.tenant_identity WHERE phone = :p LIMIT 1"
            ),
            {"p": phone},
        )
    ).mappings().fetchone()

    if not identity:
        # Don't leak whether the phone is registered — return the same
        # response either way to avoid enumeration. v2 will let new tenants
        # start an invite-link join request here.
        return {
            "delivery": "none",
            "message": (
                "If your phone is registered, you'll receive a code shortly. "
                "If you can't sign in, ask your PG owner for a one-time code."
            ),
            "expires_in": settings.OTP_EXPIRE_SECONDS,
        }

    if not identity["email"]:
        raise HTTPException(
            status_code=409,
            detail={
                "error": {
                    "code": "NO_DELIVERY_CHANNEL",
                    "message": (
                        "No email on file. Ask your PG owner to add an email "
                        "or issue a one-time code from the staff app."
                    ),
                }
            },
        )

    code = generate_otp()
    r = get_redis()
    key = f"tenant_otp:{phone}"
    await r.setex(key, settings.OTP_EXPIRE_SECONDS, code)
    await r.aclose()

    if settings.is_local:
        # Dev-friendly: print the code so we don't need real SMTP to test.
        print(f"[TENANT OTP] {phone} → {code}")

    send_tenant_otp_email(
        to_email=identity["email"],
        code=code,
        expires_minutes=max(settings.OTP_EXPIRE_SECONDS // 60, 1),
    )

    # Mask the email for the response so the UI can show "code sent to a••@x.com"
    masked = _mask_email(identity["email"])
    return {
        "delivery": "email",
        "to": masked,
        "expires_in": settings.OTP_EXPIRE_SECONDS,
    }


def _mask_email(email: str) -> str:
    """`asha.rao@example.com` → `a••••@example.com`. Cheap obfuscation for UI."""
    try:
        local, domain = email.split("@", 1)
        if len(local) <= 1:
            return f"{local}@{domain}"
        return f"{local[0]}{'•' * min(len(local) - 1, 6)}@{domain}"
    except ValueError:
        return email


@router.post("/auth/verify", summary="Tenant: verify OTP")
async def tenant_verify_otp(body: TenantOTPVerify, db: AsyncSession = Depends(get_db)):
    """
    Verify the 6-digit code. Returns either a JWT (single-org tenant) or a
    short-lived `ticket` plus an `orgs` list when the phone matches multiple
    orgs — the UI prompts the user to pick one and posts to /select-org.
    """
    phone = _normalise_phone(body.phone)

    r = get_redis()
    key = f"tenant_otp:{phone}"
    stored = await r.get(key)
    if not stored or not verify_otp(body.code, stored):
        await r.aclose()
        raise AuthenticationError("Invalid or expired code")
    await r.delete(key)

    identity = (
        await db.execute(
            text("SELECT id FROM public.tenant_identity WHERE phone = :p LIMIT 1"),
            {"p": phone},
        )
    ).mappings().fetchone()
    if not identity:
        await r.aclose()
        raise AuthenticationError("Tenant identity not found")

    identity_id = identity["id"]

    # Bump last_login_at; non-critical so don't await commit yet.
    await db.execute(
        text("UPDATE public.tenant_identity SET last_login_at = NOW() WHERE id = :id"),
        {"id": str(identity_id)},
    )

    # Resolve ACTIVE links — what org(s) does this tenant currently belong to.
    links = (
        await db.execute(
            text(
                """
                SELECT l.org_id, l.schema_name, l.tenant_id, o.name AS org_name,
                       o.slug AS org_slug
                FROM public.tenant_identity_links l
                JOIN public.organisations o ON o.id = l.org_id
                WHERE l.identity_id = :iid AND l.status = 'ACTIVE'
                ORDER BY o.name
                """
            ),
            {"iid": str(identity_id)},
        )
    ).mappings().fetchall()

    if not links:
        await db.commit()
        await r.aclose()
        raise AuthenticationError(
            "No active tenant record for this phone. Contact your PG owner."
        )

    if len(links) == 1:
        link = links[0]
        # Need property_id for the JWT — read it off the tenant row.
        await set_schema(db, link["schema_name"])
        tenant_row = (
            await db.execute(
                text("SELECT id, property_id FROM tenants WHERE id = :id"),
                {"id": str(link["tenant_id"])},
            )
        ).mappings().fetchone()
        await db.commit()
        if not tenant_row:
            await r.aclose()
            raise AuthenticationError("Tenant record missing for this link")

        token = create_tenant_token(
            tenant_id=tenant_row["id"],
            property_id=tenant_row["property_id"],
            org_id=link["org_id"],
        )
        await r.aclose()
        return {
            "access_token": token,
            "token_type": "bearer",
            "org": {
                "id": str(link["org_id"]),
                "name": link["org_name"],
                "slug": link["org_slug"],
            },
        }

    # Multi-org: stash the verified identity in Redis under a ticket; the
    # /select-org endpoint will exchange it for a JWT after the user picks.
    ticket = uuid4().hex
    await r.setex(
        f"tenant_select_org:{ticket}",
        300,  # 5 min to pick — generous
        json.dumps({"identity_id": str(identity_id)}),
    )
    await db.commit()
    await r.aclose()
    return {
        "needs_org_pick": True,
        "ticket": ticket,
        "orgs": [
            {"id": str(l["org_id"]), "name": l["org_name"], "slug": l["org_slug"]}
            for l in links
        ],
    }


@router.post("/auth/select-org", summary="Tenant: exchange multi-org ticket for JWT")
async def tenant_select_org(body: TenantSelectOrg, db: AsyncSession = Depends(get_db)):
    """
    Step 2 for tenants whose phone matches multiple orgs. The `ticket` was
    issued by /verify and proves OTP was solved within the last 5 minutes.
    Single-use; consumed on success.
    """
    r = get_redis()
    payload = await r.get(f"tenant_select_org:{body.ticket}")
    if not payload:
        await r.aclose()
        raise AuthenticationError("Selection ticket expired or invalid")
    data = json.loads(payload)
    identity_id = data["identity_id"]

    link = (
        await db.execute(
            text(
                """
                SELECT schema_name, tenant_id
                FROM public.tenant_identity_links
                WHERE identity_id = :iid AND org_id = :oid AND status = 'ACTIVE'
                LIMIT 1
                """
            ),
            {"iid": identity_id, "oid": str(body.org_id)},
        )
    ).mappings().fetchone()
    if not link:
        await r.aclose()
        raise AuthenticationError("Org not linked to this identity")

    # Look up the tenant's property_id.
    await set_schema(db, link["schema_name"])
    tenant_row = (
        await db.execute(
            text("SELECT id, property_id FROM tenants WHERE id = :id"),
            {"id": str(link["tenant_id"])},
        )
    ).mappings().fetchone()
    if not tenant_row:
        await r.aclose()
        raise AuthenticationError("Tenant record missing for this link")

    await r.delete(f"tenant_select_org:{body.ticket}")
    await r.aclose()

    token = create_tenant_token(
        tenant_id=tenant_row["id"],
        property_id=tenant_row["property_id"],
        org_id=body.org_id,
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
