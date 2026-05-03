"""Super admin panel — platform-level operations."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_platform_admin
from app.core.exceptions import NotFoundError
from app.core.security import get_password_hash, verify_password, create_access_token, create_platform_admin_token

router = APIRouter(prefix="/admin")


class PlatformLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/login", summary="Platform admin login")
async def platform_login(body: PlatformLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, name, password_hash, is_superadmin, is_active FROM public.platform_users WHERE email = :email"),
        {"email": body.email},
    )
    user = result.mappings().fetchone()
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if not user["is_active"]:
        raise HTTPException(403, "Account is inactive")

    token = create_platform_admin_token(user["id"])
    return {"access_token": token, "token_type": "bearer", "name": user["name"]}


@router.get("/orgs", summary="List all organisations")
async def list_orgs(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_platform_admin),
    limit: int = Query(50, le=200),
    search: str | None = Query(None),
):
    conditions = ["1=1"]
    params = {"limit": limit}
    if search:
        conditions.append("(o.name ILIKE :search OR o.owner_email ILIKE :search)")
        params["search"] = f"%{search}%"

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"""
            SELECT o.id, o.name, o.slug, o.owner_email, o.owner_phone,
                   o.is_active, o.created_at, o.trial_ends_at, o.plan_expires_at,
                   sp.name as plan_name
            FROM public.organisations o
            LEFT JOIN public.subscription_plans sp ON sp.id = o.plan_id
            WHERE {where}
            ORDER BY o.created_at DESC
            LIMIT :limit
        """),
        params,
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.get("/orgs/{org_id}", summary="Organisation detail")
async def get_org(
    org_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_platform_admin),
):
    result = await db.execute(
        text("SELECT o.*, sp.name as plan_name FROM public.organisations o LEFT JOIN public.subscription_plans sp ON sp.id = o.plan_id WHERE o.id = :id"),
        {"id": str(org_id)},
    )
    org = result.mappings().fetchone()
    if not org:
        raise NotFoundError("Organisation", org_id)
    return dict(org)


@router.patch("/orgs/{org_id}/suspend", summary="Suspend organisation")
async def suspend_org(
    org_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_platform_admin),
):
    await db.execute(
        text("UPDATE public.organisations SET is_active = false WHERE id = :id"),
        {"id": str(org_id)},
    )
    await db.commit()
    return {"message": "Organisation suspended"}


@router.patch("/orgs/{org_id}/reactivate", summary="Reactivate organisation")
async def reactivate_org(
    org_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_platform_admin),
):
    await db.execute(
        text("UPDATE public.organisations SET is_active = true WHERE id = :id"),
        {"id": str(org_id)},
    )
    await db.commit()
    return {"message": "Organisation reactivated"}


@router.get("/metrics", summary="Platform global metrics")
async def platform_metrics(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_platform_admin),
):
    result = await db.execute(
        text("""
            SELECT
                COUNT(*) as total_orgs,
                COUNT(*) FILTER (WHERE is_active = true) as active_orgs,
                COUNT(*) FILTER (WHERE trial_ends_at > NOW()) as on_trial
            FROM public.organisations
        """)
    )
    org_stats = result.mappings().fetchone()
    return {
        "total_orgs": org_stats["total_orgs"],
        "active_orgs": org_stats["active_orgs"],
        "on_trial": org_stats["on_trial"],
        "total_properties": 0,  # Would query across all org schemas
        "mrr_paise": 0,  # Calculate from active paid subscriptions
    }
