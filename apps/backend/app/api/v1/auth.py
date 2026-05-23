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
from app.services.audit_constants import Event
from app.services.audit_service import log_event

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
    Sign up a new PG owner.

    Creates:
    1. Organisation row in public schema (is_active=False, approved_at=NULL — pending approval)
    2. Org-specific PostgreSQL schema with all tables
    3. Owner user in the org schema
    4. 30-day Growth trial

    The user must be approved by the platform admin before they can log in.
    A signed-link email is sent to ADMIN_NOTIFICATION_EMAIL.
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

    # Pending approval until platform admin approves: is_active=false, approved_at=NULL
    org_id_result = await db.execute(
        text("""
            INSERT INTO public.organisations
                (name, slug, owner_email, owner_phone, plan_id, trial_ends_at, plan_expires_at, schema_name, is_active, website_lead_token)
            VALUES
                (:name, :slug, :email, :phone, :plan_id, :trial_end, :plan_expires_at, :schema_name, false, :website_token)
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
            # Public site key for the owner's website booking form (not a secret).
            "website_token": generate_invite_token(),
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

    # Build signed approval/reject links and email the platform admin.
    # The token is a JWT signed with SECRET_KEY (HS256, 7-day expiry) — no DB lookup needed at click time.
    from datetime import timedelta
    from jose import jwt as _jwt

    approval_payload = {
        "org_id": str(org_id),
        "type": "org_approval",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
    }
    approval_token = _jwt.encode(approval_payload, settings.SECRET_KEY, algorithm="HS256")

    base = settings.APP_BASE_URL.rstrip("/")
    approve_url = f"{base}/api/v1/auth/approve?token={approval_token}&action=approve"
    reject_url = f"{base}/api/v1/auth/approve?token={approval_token}&action=reject"

    try:
        from app.services.email_service import send_signup_approval_email
        send_signup_approval_email(
            org_id=str(org_id),
            org_name=body.org_name,
            owner_name=body.owner_name,
            owner_email=body.owner_email,
            owner_phone=body.owner_phone,
            city=body.city,
            approve_url=approve_url,
            reject_url=reject_url,
        )
    except Exception:  # noqa: BLE001 — never fail signup on email failure
        import logging
        logging.exception("Failed to send signup approval email")

    return {
        "status": "pending_approval",
        "org_id": str(org_id),
        "org_slug": slug,
        "user_id": str(user_id),
        "message": (
            "Account created. The platform admin has been notified and will review your "
            "signup shortly. You'll get an email when your account is approved."
        ),
    }


@router.post("/login", summary="Login with email and password")
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Step 1 — fast path: org owner whose `owner_email` matches.
    org_result = await db.execute(
        text("""
            SELECT id, schema_name, is_active, approved_at
            FROM public.organisations
            WHERE owner_email = :email LIMIT 1
        """),
        {"email": body.email},
    )
    org_row = org_result.fetchone()

    # Step 2 — staff fallback: scan each active org's users table for this email.
    # Cheap while we have few orgs; replace with a public email-index table when we scale.
    if not org_row:
        all_orgs = await db.execute(
            text("""
                SELECT id, schema_name, is_active, approved_at
                FROM public.organisations
                WHERE schema_name != ''
                ORDER BY created_at DESC
            """)
        )
        for cand in all_orgs.fetchall():
            _, schema, _, _ = cand
            await set_schema(db, schema)
            hit = await db.execute(
                text("SELECT id FROM users WHERE email = :email AND is_active = true LIMIT 1"),
                {"email": body.email},
            )
            if hit.scalar_one_or_none():
                org_row = cand
                break

    if not org_row:
        raise AuthenticationError("Invalid email or password")

    org_id, schema_name, is_active, approved_at = org_row
    # Pending approval case: signup happened but admin hasn't approved yet.
    if approved_at is None:
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "PENDING_APPROVAL",
                    "message": "Your account is pending admin approval. You'll receive an email when it's ready.",
                    "details": {},
                }
            },
        )
    if not is_active:
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "ACCOUNT_INACTIVE",
                    "message": "Your organisation account has been deactivated. Contact support.",
                    "details": {},
                }
            },
        )

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

    await log_event(
        db,
        Event.USER_LOGIN,
        description=f"{user.name} logged in",
        actor_user_id=user.id,
        actor_role=user.role,
        actor_name=user.name,
        actor_ip=request.client.host if request.client else None,
        entity_type="user",
        entity_id=user.id,
        entity_name=user.name,
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


# ── Password reset ──────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", summary="Request a password-reset email")
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Always returns 200 (don't leak account existence). Sends a reset email
    only if we find a matching user. Token is a JWT signed with SECRET_KEY,
    expires in 1 hour.
    """
    email = body.email.lower().strip()

    # Find which org schema this user belongs to (matches login logic).
    org_result = await db.execute(
        text("""
            SELECT id, schema_name
            FROM public.organisations
            WHERE owner_email = :email AND is_active = true AND approved_at IS NOT NULL
            LIMIT 1
        """),
        {"email": email},
    )
    org_row = org_result.fetchone()

    if not org_row:
        all_orgs = await db.execute(
            text("""
                SELECT id, schema_name
                FROM public.organisations
                WHERE is_active = true AND approved_at IS NOT NULL
                ORDER BY created_at DESC
            """)
        )
        for cand in all_orgs.fetchall():
            _, schema = cand
            await set_schema(db, schema)
            hit = await db.execute(
                text("SELECT id, name FROM users WHERE email = :email AND is_active = true LIMIT 1"),
                {"email": email},
            )
            row = hit.fetchone()
            if row:
                org_row = cand
                break

    if not org_row:
        # Pretend success
        return {"status": "ok", "message": "If that email is registered, a reset link has been sent."}

    org_id, schema_name = org_row
    await set_schema(db, schema_name)
    user_result = await db.execute(
        text("SELECT id, name FROM users WHERE email = :email AND is_active = true LIMIT 1"),
        {"email": email},
    )
    user = user_result.fetchone()
    if not user:
        return {"status": "ok", "message": "If that email is registered, a reset link has been sent."}

    # Build a signed token. JWT-only — no DB row needed; the token IS the state.
    from datetime import timedelta
    from jose import jwt as _jwt
    payload = {
        "sub": str(user.id),
        "org_id": str(org_id),
        "email": email,
        "type": "password_reset",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "iat": datetime.now(timezone.utc),
    }
    token = _jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

    base = settings.APP_BASE_URL.rstrip("/")
    reset_url = f"{base}/auth/reset-password?token={token}"

    try:
        from app.services.email_service import send_password_reset_email
        send_password_reset_email(
            to_email=email,
            user_name=user.name,
            reset_url=reset_url,
            expires_in_hours=1,
        )
    except Exception:
        import logging
        logging.exception("Failed to send password reset email")

    return {"status": "ok", "message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password", summary="Set a new password using a reset token")
async def reset_password(body: ResetPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    # Reset tokens are signed with HS256 + SECRET_KEY (same as the org-approval
    # token), NOT the RS256 access-token key — so decode them the same way.
    from jose import jwt as _jwt
    try:
        payload = _jwt.decode(body.token, settings.SECRET_KEY, algorithms=["HS256"])
    except Exception:
        raise AuthenticationError("Invalid or expired reset link")

    if payload.get("type") != "password_reset":
        raise AuthenticationError("Invalid reset token")

    org_id = payload.get("org_id")
    user_id = payload.get("sub")
    if not org_id or not user_id:
        raise AuthenticationError("Malformed reset token")

    # Resolve schema
    org_result = await db.execute(
        text("SELECT schema_name FROM public.organisations WHERE id = :id AND is_active = true"),
        {"id": org_id},
    )
    schema_name = org_result.scalar_one_or_none()
    if not schema_name:
        raise AuthenticationError("Organisation not found")
    await set_schema(db, schema_name)

    new_hash = get_password_hash(body.new_password)
    result = await db.execute(
        text(
            "UPDATE users SET password_hash = :pw, updated_at = NOW() "
            "WHERE id = :id AND is_active = true RETURNING email"
        ),
        {"pw": new_hash, "id": user_id},
    )
    row = result.fetchone()
    if not row:
        raise AuthenticationError("User not found")

    await log_event(
        db,
        Event.PASSWORD_RESET,
        description=f"Password reset for {row[0]}",
        actor_user_id=user_id,
        actor_name=row[0],
        actor_ip=request.client.host if request.client else None,
        entity_type="user",
        entity_id=user_id,
        entity_name=row[0],
    )
    await db.commit()
    return {"status": "ok", "message": "Password updated. You can now sign in."}


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


# ── Manager / staff CRUD (OWNER only) ─────────────────────────────────────────

class StaffCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    role: str = "PROPERTY_MANAGER"
    property_ids: list[UUID] | None = None

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        digits = re.sub(r"[^\d]", "", v or "")
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        elif digits.startswith("0") and len(digits) == 11:
            digits = digits[1:]
        if not re.match(r"^[6-9]\d{9}$", digits):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return f"+91{digits}"

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        v = (v or "").upper()
        if v not in {"PROPERTY_MANAGER", "SUPERVISOR", "PARTNER"}:
            raise ValueError("Role must be PROPERTY_MANAGER, SUPERVISOR, or PARTNER")
        return v


@router.post("/staff", status_code=status.HTTP_201_CREATED, summary="Create a manager/staff account (owner only)")
async def create_staff(
    body: StaffCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Owner creates a manager with an initial password set by the owner.
    Manager logs in via email + password just like the owner does.
    """
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners can create staff accounts")

    # Email + phone uniqueness within this org
    existing = await db.execute(
        text("SELECT id FROM users WHERE email = :email OR phone = :phone LIMIT 1"),
        {"email": body.email, "phone": body.phone},
    )
    if existing.scalar_one_or_none():
        raise ConflictError("A staff member with this email or phone already exists")

    pw_hash = get_password_hash(body.password)
    property_ids = [str(p) for p in body.property_ids] if body.property_ids else None

    result = await db.execute(
        text("""
            INSERT INTO users (org_id, name, email, phone, password_hash, role, property_access, is_active)
            VALUES (:org_id, :name, :email, :phone, :pw, CAST(:role AS user_role_enum), :pa, true)
            RETURNING id, name, email, phone, role
        """),
        {
            "org_id": str(ctx.org_id),
            "name": body.name,
            "email": body.email,
            "phone": body.phone,
            "pw": pw_hash,
            "role": body.role,
            "pa": property_ids,
        },
    )
    row = result.mappings().fetchone()
    await db.commit()
    return dict(row) | {"property_ids": property_ids}


@router.get("/staff", summary="List staff in this organisation")
async def list_staff(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can list staff")
    result = await db.execute(
        text("""
            SELECT id, name, email, phone, role, property_access, is_active,
                   last_login_at, created_at
            FROM users
            ORDER BY role, name
        """),
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.patch("/staff/{user_id}/deactivate", summary="Deactivate a staff member")
async def deactivate_staff(
    user_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can deactivate staff")
    if str(user_id) == str(ctx.user_id):
        raise HTTPException(400, "You cannot deactivate yourself")
    await db.execute(
        text("UPDATE users SET is_active = false WHERE id = :id"),
        {"id": str(user_id)},
    )
    await db.commit()
    return {"message": "Staff deactivated"}


# ── Org approval (signup gate) ────────────────────────────────────────────────

@router.get("/approve", summary="Platform-admin one-click signup approval/rejection")
async def approve_org(token: str, action: str = "approve", db: AsyncSession = Depends(get_db)):
    """
    One-click endpoint linked from the email sent at signup. Verifies the signed
    JWT (HS256, 7-day expiry) and either:
      - action=approve → marks org is_active=true, approved_at=NOW
      - action=reject  → drops the org schema and removes the org row
    Returns a tiny inline HTML page so it works straight from email clients.
    """
    from fastapi.responses import HTMLResponse
    from jose import jwt as _jwt, JWTError

    try:
        payload = _jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return HTMLResponse(_approval_page("Invalid or expired link", success=False), status_code=400)

    if payload.get("type") != "org_approval":
        return HTMLResponse(_approval_page("Invalid link", success=False), status_code=400)

    org_id = payload.get("org_id")
    if not org_id:
        return HTMLResponse(_approval_page("Malformed token", success=False), status_code=400)

    org_q = await db.execute(
        text("""
            SELECT id, name, owner_email, owner_phone, schema_name, approved_at
            FROM public.organisations WHERE id = :id
        """),
        {"id": org_id},
    )
    org = org_q.mappings().fetchone()
    if not org:
        return HTMLResponse(_approval_page("Organisation not found (may have been rejected already).", success=False), status_code=404)

    if action == "reject":
        # Drop the org schema + remove the row.
        if org["schema_name"]:
            await db.execute(text(f'DROP SCHEMA IF EXISTS "{org["schema_name"]}" CASCADE'))
        await db.execute(text("DELETE FROM public.organisations WHERE id = :id"), {"id": org_id})
        await db.commit()
        return HTMLResponse(_approval_page(f"Rejected {org['name']}.", success=True))

    # approve
    if org["approved_at"] is not None:
        return HTMLResponse(_approval_page(f"{org['name']} was already approved.", success=True))

    await db.execute(
        text("""
            UPDATE public.organisations
            SET is_active = true, approved_at = NOW(), approved_by_email = :admin
            WHERE id = :id
        """),
        {"id": org_id, "admin": settings.ADMIN_NOTIFICATION_EMAIL or "platform-admin"},
    )
    await db.commit()

    # Best-effort welcome email to the owner
    try:
        from app.services.email_service import send_signup_approved_email
        send_signup_approved_email(
            owner_email=org["owner_email"],
            owner_name=org["name"],
            login_url=f"{settings.APP_BASE_URL.rstrip('/')}/auth/login",
        )
    except Exception:
        import logging
        logging.exception("Failed to send approved email")

    return HTMLResponse(_approval_page(f"Approved {org['name']}.", success=True))


def _approval_page(message: str, success: bool = True) -> str:
    color = "#0D9488" if success else "#dc2626"
    icon = "✓" if success else "✗"
    return f"""
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PGManage Approval</title></head>
<body style="font-family:-apple-system,sans-serif;background:#f8fafc;
             display:flex;align-items:center;justify-content:center;
             min-height:100vh;margin:0;color:#0F172A;">
  <div style="max-width:420px;background:white;border-radius:12px;
              padding:48px 40px;border:1px solid #e2e8f0;text-align:center;">
    <div style="width:56px;height:56px;border-radius:50%;background:{color}1a;
                color:{color};font-size:32px;line-height:56px;margin:0 auto 16px;">{icon}</div>
    <h2 style="margin:0 0 8px;">{message}</h2>
    <p style="color:#64748b;font-size:14px;margin:0;">
      You can close this tab.
    </p>
  </div>
</body></html>
"""
