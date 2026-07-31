"""
Public account-deletion request intake.

Google Play (Data safety) requires a reachable URL where a user can request
deletion of their account and associated data. The web page lives at
https://pgmanage.in/delete-account and its form POSTs here.

This endpoint is intentionally UNAUTHENTICATED — a resident who has been removed
by their operator may no longer be able to sign in, yet must still be able to
ask for deletion. It records the intent by emailing support (best-effort); no
data is deleted synchronously. Protections mirror the public-lead endpoint:
  - Rate limit — max 5 requests per IP per hour (Redis, fails open).
  - Validation — name/email required, role constrained, free text bounded.
"""
from __future__ import annotations

import logging
import re

import redis.asyncio as aioredis
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.config import settings
from app.services.email_service import send_account_deletion_request_email

logger = logging.getLogger("pgmanage.account")

router = APIRouter()

_RATE_LIMIT_PER_HOUR = 5
_PHONE_RE = re.compile(r"^\+?[0-9\s\-()]{7,20}$")
_ROLES = {"owner", "resident", "staff"}


class DeletionRequestIn(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    # Which app the request came from: the owner/staff app or the resident app.
    role: str = "resident"
    reason: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("name is required")
        return v

    @field_validator("phone")
    @classmethod
    def _phone_valid(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if not v:
            return None
        if not _PHONE_RE.match(v):
            raise ValueError("phone is invalid")
        return v

    @field_validator("role")
    @classmethod
    def _role_valid(cls, v: str) -> str:
        v = (v or "resident").strip().lower()
        if v not in _ROLES:
            raise ValueError("role must be one of: owner, resident, staff")
        return v


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (
        request.client.host if request.client else "unknown"
    )


async def _rate_limited(client_ip: str) -> bool:
    """True if this IP exceeded the hourly limit. Fails open if Redis is down."""
    try:
        r = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        key = f"acctdel:{client_ip}"
        current = await r.incr(key)
        if current == 1:
            await r.expire(key, 3600)
        await r.aclose()
        return current > _RATE_LIMIT_PER_HOUR
    except Exception:
        return False


@router.post("/account/deletion-request", summary="Request account and data deletion")
async def request_account_deletion(
    body: DeletionRequestIn,
    request: Request,
    background_tasks: BackgroundTasks,
):
    client_ip = _client_ip(request)
    if await _rate_limited(client_ip):
        logger.warning("deletion request rate-limited ip=%s", client_ip)
        raise HTTPException(
            status_code=429, detail="Too many requests. Please try again later."
        )

    app_label = "Owner/staff app" if body.role in {"owner", "staff"} else "Resident app"
    background_tasks.add_task(
        send_account_deletion_request_email,
        to_email=settings.SUPPORT_EMAIL,
        role=body.role,
        requester_name=body.name,
        requester_email=str(body.email),
        requester_phone=body.phone,
        reason=body.reason,
        app=app_label,
    )
    logger.info(
        "account deletion requested role=%s email=%s ip=%s",
        body.role,
        body.email,
        client_ip,
    )
    return {
        "success": True,
        "message": (
            "Your deletion request has been received. We will delete your personal "
            "data within 30 days and email you when it is done."
        ),
    }
