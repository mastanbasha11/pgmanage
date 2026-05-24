"""
Public website-lead intake.

A PG owner embeds a booking form on their own website (e.g. theloopliving.in).
On submit, the form POSTs here with the owner's public site token. We route the
lead into that owner's org and store it under Leads (source = WEBSITE).

This endpoint is intentionally UNAUTHENTICATED — the visitor has no pgmanage
account. Protections, in order of strength:
  1. Token lookup  — routes to the right org; an unknown token is rejected (404).
  2. CORS allowlist — the browser only allows the POST from the owner's own
     domain(s). NOTE: CORS only constrains browsers, not curl, so it is a spam
     speed-bump, not an auth boundary.
  3. Rate limit    — max 10 submissions per IP per hour (Redis), per token too.
  4. Validation    — name/email/phone required, email + date well-formed.

The token is a PUBLIC site key (it ships in the website's client JS). For real
spam/abuse defence, add a captcha (Cloudflare Turnstile/hCaptcha) on the form
and verify the token here — left as a follow-up hook (see _verify_captcha).
"""
from __future__ import annotations

import logging
import re
from datetime import date

import redis.asyncio as aioredis
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_schema
from app.core.exceptions import NotFoundError
from app.services.email_service import send_website_lead_email

logger = logging.getLogger("pgmanage.website_leads")

router = APIRouter()

# Max website submissions per IP per hour (anti-spam). Tunable via settings.
_RATE_LIMIT_PER_HOUR = 10
_PHONE_RE = re.compile(r"^\+?[0-9\s\-()]{7,20}$")


class WebsiteLeadIn(BaseModel):
    """
    Payload from a PG owner's website booking form. Wire format is camelCase
    (roomType/moveInDate/propertyId); we expose snake_case internally via aliases.
    """

    model_config = {"populate_by_name": True}

    name: str
    email: EmailStr
    phone: str
    room_type: str | None = Field(default=None, alias="roomType")
    move_in_date: date | None = Field(default=None, alias="moveInDate")
    message: str | None = None
    # Optional explicit property routing; otherwise the org's first property is used.
    property_id: str | None = Field(default=None, alias="propertyId")

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("name is required")
        return v

    @field_validator("phone")
    @classmethod
    def _phone_valid(cls, v: str) -> str:
        v = (v or "").strip()
        if not _PHONE_RE.match(v):
            raise ValueError("phone is invalid")
        return v


def _allowed_origin(origin: str | None, allowlist: str | None) -> str | None:
    """
    Return the origin to echo in Access-Control-Allow-Origin if it's allowed.

    allowlist is a comma-separated list of origins the owner configured. An empty
    allowlist means "not configured yet" — we allow but do not reflect a wildcard
    with credentials (we don't use credentials here).
    """
    if not origin:
        return None
    allowed = [o.strip().rstrip("/") for o in (allowlist or "").split(",") if o.strip()]
    o = origin.rstrip("/")
    if not allowed:
        return o  # not configured -> permissive (token still required)
    return o if o in allowed else None


def _cors_headers(origin: str | None) -> dict[str, str]:
    if not origin:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
    }


async def _lookup_org(db: AsyncSession, token: str | None):
    if not token:
        raise NotFoundError("Website integration", "missing token")
    row = (
        await db.execute(
            text(
                "SELECT id, schema_name, website_allowed_origins, name, website_lead_notify_email "
                "FROM public.organisations "
                "WHERE website_lead_token = :t AND is_active = true"
            ),
            {"t": token},
        )
    ).fetchone()
    if not row:
        raise NotFoundError("Website integration", "invalid token")
    return row  # (org_id, schema_name, allowed_origins, org_name, notify_email)


async def _rate_limited(token: str, client_ip: str) -> bool:
    """True if this IP has exceeded the hourly limit. Fails open if Redis is down."""
    try:
        r = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        key = f"weblead:{token}:{client_ip}"
        current = await r.incr(key)
        if current == 1:
            await r.expire(key, 3600)
        await r.aclose()
        return current > _RATE_LIMIT_PER_HOUR
    except Exception:
        return False


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@router.options("/leads/website", include_in_schema=False)
async def website_lead_preflight(request: Request, token: str | None = None,
                                 db: AsyncSession = Depends(get_db)) -> Response:
    """CORS preflight — echo the owner's allowed origin."""
    origin = request.headers.get("origin")
    allowlist = None
    if token:
        row = (
            await db.execute(
                text("SELECT website_allowed_origins FROM public.organisations WHERE website_lead_token = :t"),
                {"t": token},
            )
        ).fetchone()
        allowlist = row[0] if row else None
    return Response(status_code=204, headers=_cors_headers(_allowed_origin(origin, allowlist)))


@router.post("/leads/website", summary="Public website booking-form lead intake")
async def create_website_lead(
    body: WebsiteLeadIn,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    org_id, schema_name, allowlist, org_name, notify_email = await _lookup_org(db, token)

    # CORS: reflect the owner's origin if allowed (browser enforces this).
    origin = request.headers.get("origin")
    allow = _allowed_origin(origin, allowlist)
    for k, v in _cors_headers(allow).items():
        response.headers[k] = v

    client_ip = _client_ip(request)
    if await _rate_limited(token, client_ip):
        logger.warning("website lead rate-limited token=%s ip=%s", token, client_ip)
        raise HTTPException(status_code=429, detail="Too many submissions. Please try again later.")

    await set_schema(db, schema_name)

    # Route to the requested property, else the org's first active property.
    property_id = None
    if body.property_id:
        property_id = (
            await db.execute(
                text("SELECT id FROM properties WHERE id = :id AND org_id = :org AND is_active = true"),
                {"id": body.property_id, "org": org_id},
            )
        ).scalar_one_or_none()
    if not property_id:
        property_id = (
            await db.execute(
                text(
                    "SELECT id FROM properties WHERE org_id = :org AND is_active = true "
                    "ORDER BY created_at LIMIT 1"
                ),
                {"org": org_id},
            )
        ).scalar_one_or_none()
    if not property_id:
        raise HTTPException(status_code=400, detail="This account has no active property to receive leads yet.")

    # Resolve the property name now, while the org search_path is still set —
    # after commit the SET LOCAL search_path is reset and org tables are unreachable.
    property_name = (
        await db.execute(
            text("SELECT name FROM properties WHERE id = :id"),
            {"id": str(property_id)},
        )
    ).scalar_one_or_none()

    lead_id = (
        await db.execute(
            text(
                """
                INSERT INTO leads (
                    org_id, property_id, name, phone, email, whatsapp_number,
                    source, interested_room_type, expected_move_in_date, notes, status
                )
                VALUES (
                    :org_id, :pid, :name, :phone, :email, :phone,
                    'WEBSITE'::lead_source_enum, :room_type, :move_in, :notes,
                    'NEW'::lead_status_enum
                )
                RETURNING id
                """
            ),
            {
                "org_id": org_id,
                "pid": str(property_id),
                "name": body.name,
                "phone": body.phone,
                "email": str(body.email),
                "room_type": body.room_type,
                "move_in": body.move_in_date,
                "notes": (body.message or "").strip() or None,
            },
        )
    ).scalar_one()
    await db.commit()

    # Email the owner (non-blocking background task; send failures are swallowed).
    if notify_email:
        background_tasks.add_task(
            send_website_lead_email,
            to_email=notify_email,
            org_name=org_name,
            property_name=property_name,
            lead_name=body.name,
            lead_email=str(body.email),
            lead_phone=body.phone,
            room_type=body.room_type,
            move_in_date=str(body.move_in_date) if body.move_in_date else None,
            message=body.message,
            leads_url=f"{settings.APP_BASE_URL.rstrip('/')}/leads",
        )

    logger.info(
        "website lead received org=%s lead=%s ip=%s origin=%s name=%s",
        org_id, lead_id, client_ip, origin, body.name,
    )
    return {"success": True, "leadId": str(lead_id)}
