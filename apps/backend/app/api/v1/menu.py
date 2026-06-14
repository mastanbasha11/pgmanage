"""Weekly menu uploads.

Owner uploads a PDF or image per (property, week_start_date). Resident
app fetches the current week's file. See migration 021 + project memory
[[project-admin-menu-upload]].

Endpoints (staff side, OWNER / PARTNER / SUPERVISOR):

  POST   /menu/upload-url           Get a presigned PUT URL.
  POST   /menu                      Record the uploaded file.
  GET    /menu?property_id=...      List menus for a property.
  GET    /menu/{id}/file-url        Get a presigned GET URL (for preview).
  DELETE /menu/{id}                 Soft-deactivate; S3 file kept for audit.

Endpoint (tenant side):

  GET    /tenant/menu/current       Resident app — current week's menu
                                    for the tenant's property + a
                                    presigned GET URL ready to render.

The active-menu uniqueness (one row per (property, week_start_date)
where is_active=true) is enforced by a partial unique index. The POST
/menu endpoint deactivates a prior active row before inserting the new
one — re-uploading the same week is a normal flow.
"""
from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    OrgContext,
    TenantContext,
    get_current_tenant,
    get_org_context,
    require_roles,
)
from app.core.exceptions import NotFoundError
from app.services.s3_service import (
    delete_object,
    generate_presigned_upload_url,
    generate_presigned_view_url,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}


def _monday_of(d: date) -> date:
    """Snap any date to the Monday of its ISO week. Owners may pick any
    day; we store the Monday so 'week_start' is unambiguous and the
    partial unique index actually prevents duplicates."""
    return d - timedelta(days=d.weekday())


# ── Request / response models ────────────────────────────────────────────────

class MenuUploadUrlRequest(BaseModel):
    property_id: UUID
    filename: str

    @field_validator("filename")
    @classmethod
    def _check_filename(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("filename is required")
        ext = v.rsplit(".", 1)[-1].lower() if "." in v else ""
        if ext not in {"pdf", "jpg", "jpeg", "png", "webp"}:
            raise ValueError("Only PDF, JPG, PNG, or WEBP files are accepted.")
        return v


class MenuCreate(BaseModel):
    property_id: UUID
    week_start_date: date
    s3_key: str
    content_type: str
    original_filename: str | None = None
    title: str | None = None

    @field_validator("content_type")
    @classmethod
    def _check_content_type(cls, v: str) -> str:
        if v not in ALLOWED_CONTENT_TYPES:
            raise ValueError(
                f"content_type must be one of {sorted(ALLOWED_CONTENT_TYPES)}"
            )
        return v


# ── Staff endpoints ─────────────────────────────────────────────────────────

@router.post(
    "/menu/upload-url",
    summary="Owner: get a presigned PUT URL for a new menu file",
)
async def menu_get_upload_url(
    body: MenuUploadUrlRequest,
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER", "SUPERVISOR"])),
):
    """
    Returns { upload_url, s3_key, content_type, expires_in }.
    Frontend PUTs the file directly to S3, then calls POST /menu with
    the returned s3_key to persist the menu row.
    """
    return await generate_presigned_upload_url(
        org_id=ctx.org_id,
        property_id=body.property_id,
        resource_type="menu",
        filename=body.filename,
    )


@router.post("/menu", status_code=201, summary="Owner: record an uploaded menu")
async def menu_create(
    body: MenuCreate,
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER", "SUPERVISOR"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Persist the row pointing at the just-uploaded S3 object. Deactivates
    any prior active menu for the same (property, week) — the partial
    unique index would reject otherwise.
    """
    week_start = _monday_of(body.week_start_date)

    # Deactivate prior active menu for the same week, if any. We do this
    # explicitly (vs ON CONFLICT) because the partial unique index has
    # the WHERE clause; ON CONFLICT requires matching the index name.
    await db.execute(
        text(
            """
            UPDATE menu_uploads
               SET is_active = false
             WHERE property_id = :pid AND week_start_date = :ws AND is_active = true
            """
        ),
        {"pid": str(body.property_id), "ws": week_start},
    )
    result = await db.execute(
        text(
            """
            INSERT INTO menu_uploads (
                org_id, property_id, week_start_date, s3_key,
                content_type, original_filename, title, uploaded_by
            ) VALUES (
                :org_id, :pid, :ws, :key, :ct, :fn, :title, :uploader
            )
            RETURNING id
            """
        ),
        {
            "org_id": str(ctx.org_id),
            "pid": str(body.property_id),
            "ws": week_start,
            "key": body.s3_key,
            "ct": body.content_type,
            "fn": body.original_filename,
            "title": body.title,
            "uploader": str(ctx.user_id),
        },
    )
    new_id = result.scalar_one()
    await db.commit()
    return {"id": str(new_id), "week_start_date": week_start.isoformat()}


@router.get("/menu", summary="Owner: list weekly menus for a property")
async def menu_list(
    property_id: UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    """Returns the most recent `limit` active menu rows, newest week first."""
    rows = (
        await db.execute(
            text(
                """
                SELECT id, property_id, week_start_date, s3_key, content_type,
                       original_filename, title, uploaded_by, uploaded_at
                FROM menu_uploads
                WHERE property_id = :pid AND is_active = true
                ORDER BY week_start_date DESC
                LIMIT :lim
                """
            ),
            {"pid": str(property_id), "lim": limit},
        )
    ).mappings().fetchall()
    return {"items": [dict(r) for r in rows]}


@router.get("/menu/{menu_id}/file-url", summary="Owner: get a presigned GET URL")
async def menu_file_url(
    menu_id: UUID,
    ctx: OrgContext = Depends(get_org_context),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            text("SELECT s3_key FROM menu_uploads WHERE id = :id AND is_active = true"),
            {"id": str(menu_id)},
        )
    ).mappings().fetchone()
    if not row:
        raise NotFoundError("Menu")
    url = await generate_presigned_view_url(row["s3_key"])
    return {"url": url}


@router.delete("/menu/{menu_id}", summary="Owner: delete a menu (soft + S3)")
async def menu_delete(
    menu_id: UUID,
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER"])),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            text("SELECT s3_key FROM menu_uploads WHERE id = :id"),
            {"id": str(menu_id)},
        )
    ).mappings().fetchone()
    if not row:
        raise NotFoundError("Menu")
    # Soft-deactivate in DB so the partial unique index opens up for a
    # re-upload. Best-effort hard-delete from S3 so we don't pay for
    # storage on dropped menus.
    await db.execute(
        text("UPDATE menu_uploads SET is_active = false WHERE id = :id"),
        {"id": str(menu_id)},
    )
    await db.commit()
    try:
        await delete_object(row["s3_key"])
    except Exception:
        pass
    return {"message": "Menu removed"}


# ── Tenant-side endpoint ────────────────────────────────────────────────────

@router.get("/tenant/menu/current", summary="Tenant: current week's menu file")
async def tenant_current_menu(
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the active menu for the current ISO week of the tenant's
    property, with a presigned GET URL ready for the app to render. If
    no menu has been uploaded for this week, falls back to the most
    recent prior week so the resident never sees a blank screen
    mid-week. Returns 404 if nothing has ever been uploaded.
    """
    today = date.today()
    monday = _monday_of(today)

    # Prefer current week. If absent, fall back to the most recent past
    # week we have on file.
    row = (
        await db.execute(
            text(
                """
                SELECT id, week_start_date, s3_key, content_type, title, uploaded_at
                FROM menu_uploads
                WHERE property_id = :pid AND is_active = true
                  AND week_start_date <= :monday
                ORDER BY week_start_date DESC
                LIMIT 1
                """
            ),
            {"pid": str(ctx.property_id), "monday": monday},
        )
    ).mappings().fetchone()
    if not row:
        raise NotFoundError("Menu")

    url = await generate_presigned_view_url(row["s3_key"])
    out = dict(row)
    out["url"] = url
    # `is_current_week` lets the resident UI say "Current menu" vs
    # "Last week's menu (this week not posted yet)".
    out["is_current_week"] = row["week_start_date"] == monday
    return out
