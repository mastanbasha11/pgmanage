"""Room and bed endpoints (additional standalone routes)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import NotFoundError

router = APIRouter()


@router.get("/rooms/{room_id}", summary="Room detail with beds")
async def get_room(
    room_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT r.*, rt.name as room_type_name, f.display_name as floor_name
            FROM rooms r
            LEFT JOIN room_types rt ON rt.id = r.room_type_id
            LEFT JOIN floors f ON f.id = r.floor_id
            WHERE r.id = :id AND r.org_id = :org_id
        """),
        {"id": str(room_id), "org_id": str(ctx.org_id)},
    )
    room = result.mappings().fetchone()
    if not room:
        raise NotFoundError("Room", room_id)

    beds_result = await db.execute(
        text("""
            SELECT b.id, b.bed_label, b.status,
                   t.id as tenant_id, t.name as tenant_name, t.phone as tenant_phone
            FROM beds b
            LEFT JOIN tenants t ON t.bed_id = b.id AND t.status = 'ACTIVE'
            WHERE b.room_id = :room_id
            ORDER BY b.bed_label
        """),
        {"room_id": str(room_id)},
    )
    beds = [dict(b) for b in beds_result.mappings().fetchall()]
    return {**dict(room), "beds": beds}
