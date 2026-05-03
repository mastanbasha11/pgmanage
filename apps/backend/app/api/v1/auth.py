"""Authentication endpoints — signup, login, OTP, token refresh."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, get_org_schema_name, set_schema
from app.core.dependencies import get_org_context, OrgContext
from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_invite_token,
    generate_otp,
    get_password_hash,
    verify_otp,
    verify_password,
)
from app.models.platform import Organisation, SubscriptionPlan
from app.models.user import User

router = APIRouter(prefix="/auth")


def get_redis():
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:80]


# ── Pydantic schemas (local to this file for brevity) ────────────────────────

class SignupRequest(BaseModel):
    org_name: str
    owner_name: str
    owner_email: EmailStr
    owner_phone: str
    password: str
    city: str

    @field_validator("owner_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        # Accept any common Indian mobile form; normalise to +91XXXXXXXXXX.
        digits = re.sub(r"[^\d]", "", v or "")
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        elif digits.startswith("0") and len(digits) == 11:
            digits = digits[1:]
        if not re.match(r"^[6-9]\d{9}$", digits):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return f"+91{digits}"

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OTPRequest(BaseModel):
    phone: str
    org_slug: str


class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str
    org_slug: str


class RefreshRequest(BaseModel):
    refresh_token: str


class StaffInviteRequest(BaseModel):
    phone: str
    name: str
    role: str
    property_ids: list[UUID] | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/signup", status_code=status.HTTP_201_CREATED, summary="Register new organisation")
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    """
    Sign up a new PG owner. Creates:
    1. Organisation row in public schema
    2. Org-specific PostgreSQL schema with all tables
    3. Owner user in the org schema
    4. Default expense categories for first property
    5. 30-day Growth trial
    """
    # Check slug uniqueness
    slug = slugify(body.org_name)
    existing = await db.execute(
        text("SELECT id FROM public.organisations WHERE slug = :slug"),
        {"slug": slug},
    )
    if existing.scalar_one_or_none():
        slug = f"{slug}-{body.owner_phone[-4:]}"

    # Check email uniqueness across orgs
    email_check = await db.execute(
        text("SELECT id FROM public.organisations WHERE owner_email = :email"),
        {"email": body.owner_email},
    )
    if email_check.scalar_one_or_none():
        raise ConflictError("An account with this email already exists")

    # Get Growth plan for trial
    plan_result = await db.execute(
        text("SELECT id FROM public.subscription_plans WHERE name = 'Growth' AND is_active = true LIMIT 1")
    )
    plan_id = plan_result.scalar_one_or_none()

    # Create organisation
    trial_end = datetime.now(timezone.utc).replace(
        microsecond=0
    )
    from datetime import timedelta
    trial_end = datetime.now(timezone.utc) + timedelta(days=settings.TRIAL_DAYS)

    org_id_result = await db.execute(
        text("""
            INSERT INTO public.organisations
                (name, slug, owner_email, owner_phone, plan_id, trial_ends_at, plan_expires_at, schema_name, is_active)
            VALUES
                (:name, :slug, :email, :phone, :plan_id, :trial_end, :plan_expires_at, :schema_name, true)
            RETURNING id, schema_name
        """),
        {
            "name": body.org_name,
            "slug": slug,
            "email": body.owner_email,
            "phone": body.owner_phone,
            "plan_id": plan_id,
            "trial_end": trial_end,
            "plan_expires_at": trial_end,
            "schema_name": "",  # will update
        },
    )
    row = org_id_result.fetchone()
    org_id = row[0]

    schema_name = f"org_{str(org_id).replace('-', '_')}"

    await db.execute(
        text("UPDATE public.organisations SET schema_name = :schema WHERE id = :id"),
        {"schema": schema_name, "id": org_id},
    )
    await db.commit()

    # Create org schema and tables
    await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
    await db.commit()

    # Provision tables in the new schema (reuse migration DDL)
    from app.models.schemas_migration import provision_org_schema
    await provision_org_schema(org_id, db)

    # Set search path to org schema
    await set_schema(db, schema_name)

    # Create owner user
    pw_hash = get_password_hash(body.password)
    user_result = await db.execute(
        text("""
            INSERT INTO users (org_id, name, phone, email, password_hash, role, property_access, is_active)
            VALUES (:org_id, :name, :phone, :email, :pw_hash, 'OWNER'::user_role_enum, NULL, true)
            RETURNING id
        """),
        {
            "org_id": org_id,
            "name": body.owner_name,
            "phone": body.owner_phone,
            "email": body.owner_email,
            "pw_hash": pw_hash,
        },
    )
    user_id = user_result.scalar_one()
    await db.commit()

    # Issue tokens
    token_data = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "org_id": str(org_id),
        "role": "OWNER",
        "name": body.owner_name,
        "email": body.owner_email,
        "property_ids": None,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"sub": str(user_id), "org_id": str(org_id)})

    return {
        "org_id": str(org_id),
        "org_slug": slug,
        "user_id": str(user_id),
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "user_id": str(user_id),
            "org_id": str(org_id),
            "name": body.owner_name,
            "email": body.owner_email,
            "role": "OWNER",
            "property_ids": None,
        },
    }


@router.post("/login", summary="Login with email and password")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Find org by owner email
    org_result = await db.execute(
        text("SELECT id, schema_name, is_active FROM public.organisations WHERE owner_email = :email LIMIT 1"),
        {"email": body.email},
    )
    org_row = org_result.fetchone()
    if not org_row:
        raise AuthenticationError("Invalid email or password")

    org_id, schema_name, is_active = org_row
    if not is_active:
        raise AuthenticationError("Organisation account is inactive")

    await set_schema(db, schema_name)

    user_result = await db.execute(
        text("SELECT id, name, email, password_hash, role, property_access, is_active FROM users WHERE email = :email LIMIT 1"),
        {"email": body.email},
    )
    user = user_result.fetchone()
    if not user or not user.password_hash:
        raise AuthenticationError("Invalid email or password")

    if not verify_password(body.password, user.password_hash):
        raise AuthenticationError("Invalid email or password")

    if not user.is_active:
        raise AuthenticationError("Your account has been deactivated")

    # Update last login
    await db.execute(
        text("UPDATE users SET last_login_at = NOW() WHERE id = :id"),
        {"id": user.id},
    )
    await db.commit()

    property_ids = [str(p) for p in user.property_access] if user.property_access else None
    token_data = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "org_id": str(org_id),
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "property_ids": property_ids,
    }
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token({"sub": str(user.id), "org_id": str(org_id)}),
        "token_type": "bearer",
        "user": {
            "user_id": str(user.id),
            "org_id": str(org_id),
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "property_ids": property_ids,
        },
    }


@router.post("/otp/request", summary="Request phone OTP (staff or tenant)")
async def request_otp(body: OTPRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Send OTP to phone via WhatsApp. Rate-limited by middleware."""
    # Find org
    org_result = await db.execute(
        text("SELECT id FROM public.organisations WHERE slug = :slug AND is_active = true LIMIT 1"),
        {"slug": body.org_slug},
    )
    org_id = org_result.scalar_one_or_none()
    if not org_id:
        raise NotFoundError("Organisation")

    otp = generate_otp()
    redis = get_redis()
    key = f"otp:{body.org_slug}:{body.phone}"

    await redis.setex(key, settings.OTP_EXPIRE_SECONDS, otp)
    # Track attempts
    attempts_key = f"otp_attempts:{body.org_slug}:{body.phone}"
    await redis.incr(attempts_key)
    await redis.expire(attempts_key, settings.OTP_EXPIRE_SECONDS)
    await redis.aclose()

    # TODO: Send via WhatsApp (Meta Cloud API) or SMS
    # For dev: log OTP (remove in prod)
    if settings.is_local:
        print(f"DEV OTP for {body.phone}: {otp}")

    return {"message": "OTP sent successfully", "expires_in": settings.OTP_EXPIRE_SECONDS}


@router.post("/otp/verify", summary="Verify OTP and get JWT")
async def verify_otp_endpoint(body: OTPVerifyRequest, db: AsyncSession = Depends(get_db)):
    org_result = await db.execute(
        text("SELECT id, schema_name FROM public.organisations WHERE slug = :slug AND is_active = true LIMIT 1"),
        {"slug": body.org_slug},
    )
    org_row = org_result.fetchone()
    if not org_row:
        raise NotFoundError("Organisation")

    org_id, schema_name = org_row

    redis = get_redis()
    key = f"otp:{body.org_slug}:{body.phone}"
    stored_otp = await redis.get(key)

    if not stored_otp:
        await redis.aclose()
        raise AuthenticationError("OTP expired or not found")

    if not verify_otp(body.otp, stored_otp):
        await redis.aclose()
        raise AuthenticationError("Invalid OTP")

    await redis.delete(key)
    await redis.aclose()

    # Find user in org schema
    await set_schema(db, schema_name)
    user_result = await db.execute(
        text("SELECT id, name, email, role, property_access FROM users WHERE phone = :phone AND is_active = true LIMIT 1"),
        {"phone": body.phone},
    )
    user = user_result.fetchone()
    if not user:
        raise AuthenticationError("No active account found for this phone number")

    property_ids = [str(p) for p in user.property_access] if user.property_access else None
    token_data = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "org_id": str(org_id),
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "property_ids": property_ids,
    }
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token({"sub": str(user.id), "org_id": str(org_id)}),
        "token_type": "bearer",
    }


@router.post("/refresh", summary="Refresh access token")
async def refresh_tokens(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise AuthenticationError("Invalid refresh token")

    if payload.get("type") != "refresh":
        raise AuthenticationError("Invalid token type")

    org_id = payload.get("org_id")
    user_id = payload.get("sub")

    org_result = await db.execute(
        text("SELECT schema_name FROM public.organisations WHERE id = :id AND is_active = true"),
        {"id": org_id},
    )
    schema_name = org_result.scalar_one_or_none()
    if not schema_name:
        raise AuthenticationError("Organisation not found")

    await set_schema(db, schema_name)
    user_result = await db.execute(
        text("SELECT id, name, email, role, property_access FROM users WHERE id = :id AND is_active = true"),
        {"id": user_id},
    )
    user = user_result.fetchone()
    if not user:
        raise AuthenticationError("User not found")

    property_ids = [str(p) for p in user.property_access] if user.property_access else None
    token_data = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "org_id": str(org_id),
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "property_ids": property_ids,
    }
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token({"sub": str(user.id), "org_id": str(org_id)}),
        "token_type": "bearer",
    }


@router.get("/me", summary="Get current user profile")
async def get_me(ctx: OrgContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, name, email, phone, role, property_access, is_active, last_login_at FROM users WHERE id = :id"),
        {"id": ctx.user_id},
    )
    user = result.fetchone()
    if not user:
        raise NotFoundError("User")

    property_ids = [str(p) for p in user.property_access] if user.property_access else None
    return {
        "user": {
            "user_id": str(user.id),
            "org_id": str(ctx.org_id),
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "property_ids": property_ids,
        },
        "phone": user.phone,
        "is_active": user.is_active,
        "last_login_at": user.last_login_at,
    }


@router.post("/staff/invite", summary="Invite staff member via WhatsApp OTP")
async def invite_staff(
    body: StaffInviteRequest,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners can invite staff")

    invite_token = generate_invite_token()
    property_ids = [str(p) for p in body.property_ids] if body.property_ids else None

    await db.execute(
        text("""
            INSERT INTO users (org_id, name, phone, role, property_access, invite_token, is_active)
            VALUES (:org_id, :name, :phone, CAST(:role AS user_role_enum), :property_access, :invite_token, false)
            ON CONFLICT (phone) DO UPDATE SET invite_token = :invite_token, role = CAST(:role AS user_role_enum)
        """),
        {
            "org_id": str(ctx.org_id),
            "name": body.name,
            "phone": body.phone,
            "role": body.role,
            "property_access": property_ids,
            "invite_token": invite_token,
        },
    )
    await db.commit()

    # TODO: Send WhatsApp invite message with setup link
    return {"message": "Invite sent", "invite_token": invite_token}
