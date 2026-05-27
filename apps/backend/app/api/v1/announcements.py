"""Announcements and complaints endpoints."""
from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Any

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import NotFoundError
from app.services.audit_constants import Event
from app.services.audit_service import diff_changes, log_event

router = APIRouter()


class AnnouncementCreate(BaseModel):
    property_id: UUID
    title: str
    body: str
    target_type: str = "ALL_TENANTS"
    target_ids: list[UUID] | None = None
    channels: list[str] = ["APP"]
    scheduled_at: datetime | None = None


class ComplaintCreate(BaseModel):
    property_id: UUID
    category: str
    description: str
    photo_s3_key: str | None = None


class ComplaintUpdate(BaseModel):
    status: str | None = None
    assigned_to: UUID | None = None
    response_note: str | None = None


@router.post("/announcements", status_code=201, summary="Create announcement")
async def create_announcement(
    body: AnnouncementCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    target_ids = [str(t) for t in body.target_ids] if body.target_ids else None
    ann_status = "SCHEDULED" if body.scheduled_at else "DRAFT"
    result = await db.execute(
        text("""
            INSERT INTO announcements (org_id, property_id, title, body, target_type, target_ids, channels, scheduled_at, status, created_by)
            VALUES (:org_id, :pid, :title, :body, CAST(:target_type AS announcement_target_enum), :target_ids, :channels, :scheduled_at,
                    CAST(:ann_status AS announcement_status_enum), :creator)
            RETURNING id, status
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(body.property_id),
            "title": body.title, "body": body.body, "target_type": body.target_type,
            "target_ids": target_ids, "channels": body.channels,
            "scheduled_at": body.scheduled_at, "ann_status": ann_status,
            "creator": str(ctx.user_id),
        },
    )
    row = result.mappings().fetchone()

    await log_event(
        db,
        Event.ANNOUNCEMENT_POSTED,
        description=f"{ctx.name} posted announcement “{body.title}”",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="announcement",
        entity_id=row["id"],
        entity_name=body.title,
        property_id=body.property_id,
        metadata={"status": ann_status},
    )
    await db.commit()
    return dict(row)


@router.get("/announcements", summary="List announcements")
async def list_announcements(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
):
    conditions = ["org_id = :org_id"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}
    if property_id:
        conditions.append("property_id = :pid")
        params["pid"] = str(property_id)

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"SELECT id, title, body, target_type, status, created_at, scheduled_at, sent_at FROM announcements WHERE {where} ORDER BY created_at DESC"),
        params,
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows]}


@router.post("/complaints", status_code=201, summary="Create complaint")
async def create_complaint(
    body: ComplaintCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            INSERT INTO complaints (tenant_id, property_id, org_id, category, description, photo_s3_key, status)
            VALUES (:tenant_id, :pid, :org_id, CAST(:category AS complaint_category_enum), :desc, :photo_key, 'OPEN'::complaint_status_enum)
            RETURNING id
        """),
        {
            "tenant_id": str(ctx.user_id),  # when called by staff on behalf of tenant
            "pid": str(body.property_id), "org_id": str(ctx.org_id),
            "category": body.category, "desc": body.description,
            "photo_key": body.photo_s3_key,
        },
    )
    complaint_id = result.scalar_one()
    await db.commit()
    return {"complaint_id": str(complaint_id), "status": "OPEN"}


@router.get("/complaints", summary="List complaints")
async def list_complaints(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    status: str | None = Query(None),
):
    conditions = ["org_id = :org_id"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}
    if property_id:
        conditions.append("property_id = :pid")
        params["pid"] = str(property_id)
    if status:
        conditions.append("status = CAST(:status AS complaint_status_enum)")
        params["status"] = status

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"SELECT id, category, description, status, assigned_to, created_at FROM complaints WHERE {where} ORDER BY created_at DESC"),
        params,
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows]}


@router.patch("/complaints/{complaint_id}", summary="Update complaint")
async def update_complaint(
    complaint_id: UUID,
    body: ComplaintUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        from fastapi import HTTPException
        raise HTTPException(400, "No fields to update")

    # Old values for the before/after diff (real columns only, before we inject
    # the synthetic resolved_at = NOW() marker).
    comp_cols = ", ".join(updates.keys())
    old_comp = (await db.execute(
        text(f"SELECT {comp_cols} FROM complaints WHERE id = :id AND org_id = :org_id"),
        {"id": str(complaint_id), "org_id": str(ctx.org_id)},
    )).mappings().fetchone()
    changes = diff_changes(dict(old_comp) if old_comp else {}, updates)

    if updates.get("status") == "RESOLVED":
        updates["resolved_at"] = "NOW()"

    enum_columns = {"status": "complaint_status_enum"}
    set_clauses = []
    for k, v in updates.items():
        if v == "NOW()":
            set_clauses.append("resolved_at = NOW()")
        elif k in enum_columns:
            set_clauses.append(f"{k} = CAST(:{k} AS {enum_columns[k]})")
        else:
            set_clauses.append(f"{k} = :{k}")

    params = {k: v for k, v in updates.items() if v != "NOW()"}
    params["complaint_id"] = str(complaint_id)

    await db.execute(
        text(f"UPDATE complaints SET {', '.join(set_clauses)}, updated_at = NOW() WHERE id = :complaint_id AND org_id = :org_id"),
        {**params, "org_id": str(ctx.org_id)},
    )

    await log_event(
        db,
        Event.COMPLAINT_UPDATED,
        description=f"{ctx.name} updated a complaint"
        + (f" → {updates['status']}" if "status" in updates else ""),
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="complaint",
        entity_id=complaint_id,
        metadata={"changes": changes},
    )
    await db.commit()
    return {"message": "Complaint updated"}
