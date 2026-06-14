"""Weekly menu uploads — filesystem-backed.

Owner uploads a single file per (property, week_start_date). Files live
on the EC2 disk under {UPLOAD_ROOT}/{org_id}/menu/{menu_id}.{ext} —
same pattern as tenant ID-proofs (apps/backend/app/api/v1/tenants.py).
Project memory: [[project-admin-menu-upload]].

Endpoints (staff side, OWNER / PARTNER / SUPERVISOR):

  POST   /menu/upload          multipart/form-data; persist + write file.
  GET    /menu?property_id=    list active menus newest-first.
  GET    /menu/{id}/file-url   mint a 5-min token; returns a URL the
                               browser/app can open without an auth header.
  DELETE /menu/{id}            soft-deactivate row + best-effort unlink.

Public endpoint (token-authenticated):

  GET    /menu/file/{token}    stream the file. Token is the auth — it
                               proves the requester already had a staff
                               or tenant JWT when minting the URL.

Tenant endpoint:

  GET    /tenant/menu/current  resident-app: current week's file with a
                               ready-to-render `url` field; falls back
                               to the most recent prior week.

The active-row-per-(property, week) invariant is enforced by the partial
unique index. Re-uploading the same week deactivates the prior row in
the upload handler before insert.
"""
from __future__ import annotations

import os
import secrets
from datetime import date, timedelta
from pathlib import Path
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_schema, get_org_schema_name
from app.core.dependencies import (
    OrgContext,
    TenantContext,
    get_current_tenant,
    get_org_context,
    require_roles,
)
from app.core.exceptions import NotFoundError

router = APIRouter()


UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "/app/uploads"))
MENU_DIR = "menu"
ALLOWED_EXTS = {"pdf", "jpg", "jpeg", "png", "webp"}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}
EXT_TO_CONTENT_TYPE = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}
TOKEN_TTL_SECONDS = 300  # 5 minutes — enough time to open + scroll the file
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB cap


def _monday_of(d: date) -> date:
    """Snap any date to the Monday of its ISO week."""
    return d - timedelta(days=d.weekday())


def _menu_target(org_id: UUID | str, menu_id: UUID | str, ext: str) -> Path:
    return UPLOAD_ROOT / str(org_id) / MENU_DIR / f"{menu_id}.{ext}"


def _redis():
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


# ── Staff endpoints ─────────────────────────────────────────────────────────

@router.post(
    "/menu/upload",
    status_code=201,
    summary="Owner: upload a weekly menu file (multipart)",
)
async def menu_upload(
    property_id: UUID = Form(...),
    week_start_date: date = Form(...),
    title: str | None = Form(None),
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER", "SUPERVISOR"])),
    db: AsyncSession = Depends(get_db),
):
    """Single-step upload: file body lands on the EC2 disk; row is
    persisted referencing the relative path."""
    filename = file.filename or "menu.pdf"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=422,
            detail={
                "error": {
                    "code": "UNSUPPORTED_FILE_TYPE",
                    "message": "Only PDF, JPG, PNG, or WEBP files are accepted.",
                }
            },
        )

    # We trust the extension over the client-sent content_type for storage
    # (mobile UAs often send application/octet-stream); but reject obvious
    # mismatches for sanity.
    content_type = EXT_TO_CONTENT_TYPE[ext]

    # Read the file body. UploadFile streams from a SpooledTemporaryFile;
    # .read() pulls it all into memory. Capped at 10 MB.
    body = await file.read()
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "error": {
                    "code": "FILE_TOO_LARGE",
                    "message": f"Max upload size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
                }
            },
        )

    week_start = _monday_of(week_start_date)

    # Deactivate prior active row for the same week. The partial unique
    # index would otherwise reject the insert below.
    await db.execute(
        text(
            """
            UPDATE menu_uploads
               SET is_active = false
             WHERE property_id = :pid AND week_start_date = :ws AND is_active = true
            """
        ),
        {"pid": str(property_id), "ws": week_start},
    )

    # Insert with a placeholder s3_key — we don't know the menu_id yet,
    # which is what we name the file. Update after the row is in.
    new_id = (
        await db.execute(
            text(
                """
                INSERT INTO menu_uploads (
                    org_id, property_id, week_start_date, s3_key,
                    content_type, original_filename, title, uploaded_by
                ) VALUES (
                    :org_id, :pid, :ws, '', :ct, :fn, :title, :uploader
                )
                RETURNING id
                """
            ),
            {
                "org_id": str(ctx.org_id),
                "pid": str(property_id),
                "ws": week_start,
                "ct": content_type,
                "fn": filename,
                "title": title,
                "uploader": str(ctx.user_id),
            },
        )
    ).scalar_one()

    target = _menu_target(ctx.org_id, new_id, ext)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body)

    rel_path = str(target.relative_to(UPLOAD_ROOT))
    await db.execute(
        text("UPDATE menu_uploads SET s3_key = :key WHERE id = :id"),
        {"key": rel_path, "id": str(new_id)},
    )
    await db.commit()
    return {"id": str(new_id), "week_start_date": week_start.isoformat()}


@router.get("/menu", summary="Owner: list weekly menus for a property")
async def menu_list(
    property_id: UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
):
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


async def _mint_file_token(menu_id: UUID, org_id: UUID) -> str:
    """One token = right to read one menu_id for TOKEN_TTL_SECONDS. We
    store both menu_id and the org schema in Redis so the public serve
    endpoint can find the row without an auth dependency.
    """
    token = secrets.token_urlsafe(24)
    schema = get_org_schema_name(org_id)
    r = _redis()
    await r.setex(f"menu_file_token:{token}", TOKEN_TTL_SECONDS, f"{schema}:{menu_id}")
    await r.aclose()
    return token


@router.get("/menu/{menu_id}/file-url", summary="Owner: short-lived file URL")
async def menu_file_url(
    menu_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Mints a 5-minute token-signed URL. The returned URL opens cleanly in
    a browser tab (or `Linking.openURL` on mobile) without needing the
    JWT — the token IS the auth.
    """
    row = (
        await db.execute(
            text("SELECT id FROM menu_uploads WHERE id = :id AND is_active = true"),
            {"id": str(menu_id)},
        )
    ).mappings().fetchone()
    if not row:
        raise NotFoundError("Menu")
    token = await _mint_file_token(menu_id, ctx.org_id)
    return {"url": f"/api/v1/menu/file/{token}"}


@router.delete("/menu/{menu_id}", summary="Owner: soft-delete + unlink the file")
async def menu_delete(
    menu_id: UUID,
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER"])),
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
    await db.execute(
        text("UPDATE menu_uploads SET is_active = false WHERE id = :id"),
        {"id": str(menu_id)},
    )
    await db.commit()
    # Best-effort unlink (storage GC).
    try:
        if row["s3_key"]:
            full = UPLOAD_ROOT / row["s3_key"]
            full.unlink(missing_ok=True)
    except Exception:
        pass
    return {"message": "Menu removed"}


# ── Public token-signed serve ───────────────────────────────────────────────

@router.get("/menu/file/{token}", summary="Public: stream menu file via token")
async def menu_file_serve(token: str, db: AsyncSession = Depends(get_db)):
    """
    No auth dependency — the token itself is the auth. Minting happens
    through the staff/tenant endpoints which DO authenticate.
    """
    r = _redis()
    raw = await r.get(f"menu_file_token:{token}")
    await r.aclose()
    if not raw or ":" not in raw:
        raise HTTPException(status_code=404, detail="Link expired or invalid")
    schema, menu_id = raw.split(":", 1)

    # Manually scope this session to the right org — no auth dep ran.
    await set_schema(db, schema)
    row = (
        await db.execute(
            text(
                "SELECT s3_key, content_type, original_filename "
                "FROM menu_uploads WHERE id = :id"
            ),
            {"id": menu_id},
        )
    ).mappings().fetchone()
    if not row or not row["s3_key"]:
        raise HTTPException(status_code=404, detail="Menu file missing")

    full = UPLOAD_ROOT / row["s3_key"]
    if not full.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(
        str(full),
        media_type=row["content_type"],
        filename=row["original_filename"] or full.name,
    )


# ── Tenant-side endpoint ────────────────────────────────────────────────────

@router.get("/tenant/menu/current", summary="Tenant: current week's menu file")
async def tenant_current_menu(
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    monday = _monday_of(today)
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

    token = await _mint_file_token(row["id"], ctx.org_id)
    out = dict(row)
    out["url"] = f"/api/v1/menu/file/{token}"
    out["is_current_week"] = row["week_start_date"] == monday
    return out
