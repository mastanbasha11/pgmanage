"""
Activity-log (audit feed) read endpoints.

All queries are raw SQL via text() (consistent with the rent-ledger / dashboard
pattern) and run against the org schema via the session search_path set by
`get_org_context`. All endpoints are gated to OWNER / PARTNER.
"""
from __future__ import annotations

import json
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

# Columns returned for every feed/timeline row.
_COLUMNS = """
    id, created_at, actor_user_id, actor_role, actor_name, actor_ip,
    event_type, event_category, description,
    entity_type, entity_id, entity_name,
    property_id, property_name, tenant_id, metadata
"""


def _serialize(row: Any) -> dict:
    """Map a result row to a JSON-safe dict."""
    m = row.metadata
    if isinstance(m, str):
        try:
            m = json.loads(m)
        except (ValueError, TypeError):
            m = {}
    return {
        "id": str(row.id),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "actor_user_id": str(row.actor_user_id) if row.actor_user_id else None,
        "actor_role": row.actor_role,
        "actor_name": row.actor_name,
        "actor_ip": row.actor_ip,
        "event_type": row.event_type,
        "event_category": row.event_category,
        "description": row.description,
        "entity_type": row.entity_type,
        "entity_id": str(row.entity_id) if row.entity_id else None,
        "entity_name": row.entity_name,
        "property_id": str(row.property_id) if row.property_id else None,
        "property_name": row.property_name,
        "tenant_id": str(row.tenant_id) if row.tenant_id else None,
        "metadata": m or {},
    }


@router.get("/audit-logs", summary="Global activity feed (filtered, paginated)")
async def list_audit_logs(
    ctx: OrgContext = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
    actor_user_id: UUID | None = Query(None),
    event_category: str | None = Query(None),
    tenant_id: UUID | None = Query(None),
    property_id: UUID | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict:
    where: list[str] = []
    params: dict[str, Any] = {}

    if actor_user_id is not None:
        where.append("actor_user_id = :actor_user_id")
        params["actor_user_id"] = str(actor_user_id)
    if event_category:
        where.append("event_category = :event_category")
        params["event_category"] = event_category
    if tenant_id is not None:
        where.append("tenant_id = :tenant_id")
        params["tenant_id"] = str(tenant_id)
    if property_id is not None:
        where.append("property_id = :property_id")
        params["property_id"] = str(property_id)
    if date_from is not None:
        where.append("created_at >= :date_from")
        params["date_from"] = date_from
    if date_to is not None:
        # inclusive of the whole `date_to` day
        where.append("created_at < (:date_to::date + INTERVAL '1 day')")
        params["date_to"] = date_to
    if search:
        where.append("description ILIKE :search")
        params["search"] = f"%{search}%"

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total = (
        await db.execute(
            text(f"SELECT COUNT(*) FROM activity_log{where_sql}"), params
        )
    ).scalar_one()

    rows = (
        await db.execute(
            text(
                f"SELECT {_COLUMNS} FROM activity_log{where_sql} "
                "ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset"
            ),
            {**params, "limit": page_size, "offset": (page - 1) * page_size},
        )
    ).fetchall()

    return {
        "items": [_serialize(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": page * page_size < total,
    }


@router.get("/audit-logs/tenant/{tenant_id}", summary="Full activity timeline for one tenant")
async def tenant_timeline(
    tenant_id: UUID,
    ctx: OrgContext = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            text(
                f"SELECT {_COLUMNS} FROM activity_log "
                "WHERE tenant_id = :tid ORDER BY created_at DESC, id DESC LIMIT 500"
            ),
            {"tid": str(tenant_id)},
        )
    ).fetchall()
    return {"items": [_serialize(r) for r in rows]}


@router.get("/audit-logs/summary", summary="Per-staff activity counts (last 30 days)")
async def audit_summary(
    ctx: OrgContext = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    rows = (
        await db.execute(
            text(
                """
                SELECT
                    actor_user_id AS user_id,
                    MAX(actor_name) AS user_name,
                    MAX(actor_role) AS role,
                    COUNT(*) AS event_count,
                    MAX(created_at) AS last_active
                FROM activity_log
                WHERE created_at >= NOW() - INTERVAL '30 days'
                  AND actor_user_id IS NOT NULL
                GROUP BY actor_user_id
                ORDER BY event_count DESC
                """
            )
        )
    ).fetchall()
    return [
        {
            "user_id": str(r.user_id),
            "user_name": r.user_name,
            "role": r.role,
            "event_count": r.event_count,
            "last_active": r.last_active.isoformat() if r.last_active else None,
        }
        for r in rows
    ]
