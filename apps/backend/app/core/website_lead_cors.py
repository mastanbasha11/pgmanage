"""Per-org CORS helpers for the public website-lead intake endpoint."""
from __future__ import annotations

from sqlalchemy import text

from app.core.database import AsyncSessionLocal

WEBSITE_LEAD_PATH = "/api/v1/leads/website"


def resolve_allowed_origin(origin: str | None, allowlist: str | None) -> str | None:
    """
    Return the origin to echo in Access-Control-Allow-Origin if it's allowed.

    allowlist is a comma-separated list of origins the owner configured. An empty
    allowlist means "not configured yet" — reflect the request origin (token still
    required on POST).
    """
    if not origin:
        return None
    allowed = [o.strip().rstrip("/") for o in (allowlist or "").split(",") if o.strip()]
    normalized = origin.rstrip("/")
    if not allowed:
        return normalized
    return normalized if normalized in allowed else None


def build_cors_headers(allowed_origin: str | None) -> dict[str, str]:
    if not allowed_origin:
        return {}
    return {
        "Access-Control-Allow-Origin": allowed_origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
    }


async def fetch_allowlist_for_token(token: str | None) -> str | None:
    if not token:
        return None
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                text(
                    "SELECT website_allowed_origins FROM public.organisations "
                    "WHERE website_lead_token = :t AND is_active = true"
                ),
                {"t": token},
            )
        ).fetchone()
        return row[0] if row else None
