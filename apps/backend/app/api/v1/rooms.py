"""Room and bed endpoints (additional standalone routes)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import ConflictError, NotFoundError
from app.services.audit_constants import Event
from app.services.audit_service import log_event

router = APIRouter()


class BedStatusUpdate(BaseModel):
    """Block/unblock a bed.

    Valid transitions:
      VACANT      -> RESERVED | MAINTENANCE
      RESERVED    -> VACANT | MAINTENANCE
      MAINTENANCE -> VACANT | RESERVED
    OCCUPIED beds can't be changed here — check out the tenant first.
    """
    status: str
    notes: str | None = None


@router.patch("/beds/{bed_id}/status", summary="Block / unblock a bed (single-occupancy holds etc.)")
async def update_bed_status(
    bed_id: UUID,
    body: BedStatusUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER", "PROPERTY_MANAGER"):
        raise HTTPException(403, "Insufficient permission to change bed status")

    allowed = {"VACANT", "RESERVED", "MAINTENANCE"}
    if body.status not in allowed:
        raise HTTPException(400, f"status must be one of {sorted(allowed)}")

    cur = await db.execute(
        text("""
            SELECT b.id, b.status, b.property_id, p.org_id
            FROM beds b
            JOIN properties p ON p.id = b.property_id
            WHERE b.id = :id
        """),
        {"id": str(bed_id)},
    )
    bed = cur.mappings().fetchone()
    if not bed or str(bed["org_id"]) != str(ctx.org_id):
        raise NotFoundError("Bed", bed_id)
    if bed["status"] == "OCCUPIED":
        raise ConflictError(
            "Bed is currently OCCUPIED. Check the tenant out before changing its status."
        )

    await db.execute(
        text("""
            UPDATE beds
            SET status = CAST(:status AS bed_status_enum), updated_at = NOW()
            WHERE id = :id
        """),
        {"id": str(bed_id), "status": body.status},
    )

    await log_event(
        db,
        Event.ROOM_STATUS_CHANGED,
        description=f"{ctx.name} set a bed to {body.status}",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="bed",
        entity_id=bed_id,
        property_id=bed["property_id"],
        metadata={"from": bed["status"], "to": body.status},
    )
    await db.commit()
    return {"bed_id": str(bed_id), "status": body.status}


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
