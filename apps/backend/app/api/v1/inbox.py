"""Admin Inbox endpoints.

GET    /inbox?status=unread|all&limit=&cursor=
POST   /inbox/{id}/read
POST   /inbox/mark-all-read
GET    /inbox/unread-count       — drives the sidebar badge

Org-scoped (read state is shared across staff for v1). Per-staff read
state can layer on later via a join table.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import NotFoundError

router = APIRouter()


@router.get("/inbox", summary="Admin Inbox: unified tenant-action feed")
async def inbox_list(
    status: str = Query("unread", regex="^(unread|all)$"),
    limit: int = Query(50, ge=1, le=200),
    ctx: OrgContext = Depends(get_org_context),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    where = "WHERE 1=1"
    if status == "unread":
        where += " AND read_at IS NULL"
    rows = (
        await db.execute(
            text(
                f"""
                SELECT
                  e.id, e.tenant_id, e.property_id, e.kind, e.summary,
                  e.payload, e.deep_link, e.read_at, e.created_at,
                  t.name AS tenant_name
                FROM tenant_inbox_events e
                LEFT JOIN tenants t ON t.id = e.tenant_id
                {where}
                ORDER BY e.created_at DESC
                LIMIT :lim
                """
            ),
            {"lim": limit},
        )
    ).mappings().fetchall()
    return {"items": [dict(r) for r in rows]}


@router.get("/inbox/unread-count", summary="Admin Inbox: unread count")
async def inbox_unread_count(
    ctx: OrgContext = Depends(get_org_context),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    n = (
        await db.execute(
            text(
                "SELECT COUNT(*) FROM tenant_inbox_events WHERE read_at IS NULL"
            )
        )
    ).scalar_one()
    return {"count": int(n)}


@router.post("/inbox/{event_id}/read", summary="Admin Inbox: mark single event read")
async def inbox_mark_read(
    event_id: UUID,
    ctx: OrgContext = Depends(get_org_context),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        text(
            "UPDATE tenant_inbox_events SET read_at = NOW() "
            "WHERE id = :id AND read_at IS NULL"
        ),
        {"id": str(event_id)},
    )
    if r.rowcount == 0:
        # Either doesn't exist or already read — return 200 either way.
        # Idempotent mark-read avoids racing clients double-clicking.
        pass
    await db.commit()
    return {"ok": True}


@router.post("/inbox/mark-all-read", summary="Admin Inbox: mark every unread event read")
async def inbox_mark_all_read(
    ctx: OrgContext = Depends(get_org_context),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        text("UPDATE tenant_inbox_events SET read_at = NOW() WHERE read_at IS NULL")
    )
    await db.commit()
    return {"marked": int(r.rowcount or 0)}
