from __future__ import annotations

import random
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


# ── Password ─────────────────────────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


# ── OTP ───────────────────────────────────────────────────────────────────────

def generate_otp(length: int = 6) -> str:
    """Generate a numeric OTP."""
    return "".join(random.choices(string.digits, k=length))


def verify_otp(provided: str, stored: str) -> bool:
    """Constant-time OTP comparison."""
    return secrets.compare_digest(provided.strip(), stored.strip())


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": str(uuid4()),
        "type": "access",
    })
    return jwt.encode(
        to_encode,
        settings.RS256_PRIVATE_KEY if settings.use_rs256 else settings.SECRET_KEY,
        algorithm=settings.effective_algorithm,
    )


def create_refresh_token(data: dict[str, Any]) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": str(uuid4()),
        "type": "refresh",
    })
    return jwt.encode(
        to_encode,
        settings.RS256_PRIVATE_KEY if settings.use_rs256 else settings.SECRET_KEY,
        algorithm=settings.effective_algorithm,
    )


def create_tenant_token(
    tenant_id: UUID,
    property_id: UUID,
    org_id: UUID,
) -> str:
    """Issue a short-lived JWT for tenant portal access."""
    return create_access_token({
        "sub": str(tenant_id),
        "tenant_id": str(tenant_id),
        "property_id": str(property_id),
        "org_id": str(org_id),
        "role": "TENANT",
    })


def create_platform_admin_token(admin_id: UUID) -> str:
    """Issue a JWT for super admin panel with separate audience."""
    return create_access_token({
        "sub": str(admin_id),
        "admin_id": str(admin_id),
        "role": "PLATFORM_ADMIN",
        "aud": "platform-admin",
    })


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT. Raises JWTError on failure."""
    key = settings.RS256_PUBLIC_KEY if settings.use_rs256 else settings.SECRET_KEY
    return jwt.decode(
        token,
        key,
        algorithms=[settings.effective_algorithm],
    )


def generate_idempotency_key() -> str:
    return str(uuid4())


def generate_invite_token() -> str:
    """Generate a secure random token for staff invites."""
    return secrets.token_urlsafe(32)
