"""
Outbound notification log (read-only).

Surfaces the per-org `notification_log` rows — every WhatsApp/email/etc. the app
or scheduler sent — so owners can see what went out, to whom, and whether it
failed. Raw SQL via text() against the org schema (search_path set by
`get_org_context`). Gated to OWNER / PARTNER.
"""
from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, require_roles

router = APIRouter()

_ADMIN = require_roles(["OWNER", "PARTNER"])

_COLUMNS = """
    nl.id, nl.created_at, nl.sent_at, nl.channel, nl.template_name,
    nl.message_body, nl.rendered_message, nl.status, nl.external_message_id,
    nl.error_message, nl.recipient_type, nl.recipient_id, nl.recipient_phone,
    nl.delivery_status, nl.delivered_at, nl.property_id,
    t.name AS tenant_name, t.phone AS tenant_phone,
    p.name AS property_name, r.room_number AS room_number
"""
_FROM = (
    "FROM notification_log nl "
    "LEFT JOIN tenants t ON t.id = nl.recipient_id AND nl.recipient_type = 'TENANT' "
    "LEFT JOIN beds b ON b.id = t.bed_id "
    "LEFT JOIN rooms r ON r.id = b.room_id "
    "LEFT JOIN properties p ON p.id = nl.property_id"
)


def _serialize(row: Any) -> dict:
    return {
        "id": str(row.id),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "sent_at": row.sent_at.isoformat() if row.sent_at else None,
        "channel": row.channel,
        "template_name": row.template_name,
        "message_body": row.message_body,
        "rendered_message": row.rendered_message,
        "status": row.status,
        "delivery_status": row.delivery_status,
        "delivered_at": row.delivered_at.isoformat() if row.delivered_at else None,
        "external_message_id": row.external_message_id,
        "error_message": row.error_message,
        "recipient_type": row.recipient_type,
        "recipient_id": str(row.recipient_id) if row.recipient_id else None,
        "recipient_phone": row.recipient_phone,
        "property_id": str(row.property_id) if row.property_id else None,
        "property_name": getattr(row, "property_name", None),
        "tenant_name": getattr(row, "tenant_name", None),
        "tenant_phone": getattr(row, "tenant_phone", None),
        "room_number": getattr(row, "room_number", None),
    }


@router.get("/notifications", summary="Outbound notification log (filtered, paginated)")
async def list_notifications(
    ctx: OrgContext = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
    channel: str | None = Query(None, description="WHATSAPP / EMAIL / PUSH / SMS"),
    status: str | None = Query(None, description="SENT / FAILED / PENDING"),
    property_id: UUID | None = Query(None),
    recipient_id: UUID | None = Query(None, description="Filter to a single tenant thread"),
    direction: str | None = Query(
        None,
        description="outbound (default excludes inbound:*) or inbound (only inbound:*)",
    ),
    template_name: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    search: str | None = Query(None, description="matches recipient name/phone"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict:
    where: list[str] = []
    params: dict[str, Any] = {}

    if channel:
        where.append("nl.channel = :channel")
        params["channel"] = channel
    if status:
        where.append("nl.status = :status")
        params["status"] = status
    if property_id is not None:
        where.append("nl.property_id = :property_id")
        params["property_id"] = str(property_id)
    if recipient_id is not None:
        where.append("nl.recipient_id = :recipient_id")
        params["recipient_id"] = str(recipient_id)
    if direction == "outbound":
        where.append("(nl.template_name IS NULL OR nl.template_name NOT LIKE 'inbound:%')")
    elif direction == "inbound":
        where.append("nl.template_name LIKE 'inbound:%'")
    if template_name:
        where.append("nl.template_name = :template_name")
        params["template_name"] = template_name
    if date_from is not None:
        where.append("COALESCE(nl.sent_at, nl.created_at) >= :date_from")
        params["date_from"] = date_from
    if date_to is not None:
        where.append("COALESCE(nl.sent_at, nl.created_at) < (:date_to::date + 1)")
        params["date_to"] = date_to
    if search:
        where.append(
            "(t.name ILIKE :search OR t.phone ILIKE :search "
            "OR nl.recipient_phone ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    total = (
        await db.execute(
            text(f"SELECT COUNT(*) {_FROM} {where_sql}"), params
        )
    ).scalar() or 0

    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    rows = (
        await db.execute(
            text(
                f"SELECT {_COLUMNS} {_FROM} {where_sql} "
                "ORDER BY COALESCE(nl.sent_at, nl.created_at) DESC "
                "LIMIT :limit OFFSET :offset"
            ),
            params,
        )
    ).fetchall()

    return {
        "items": [_serialize(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": (page * page_size) < total,
    }
