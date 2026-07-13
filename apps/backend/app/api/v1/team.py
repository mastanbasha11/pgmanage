"""Per-property team roster.

Owners have `share_pct` (used for profit split on the dashboard); managers
and collectors don't, but their names populate the Paid To / Paid By
dropdowns for payments + expenses. Roster is kept separate from `users`
(login staff) because most collectors don't need a login.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import NotFoundError

router = APIRouter()

_ROLES = ("OWNER", "MANAGER", "COLLECTOR")


class TeamMemberCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: str | None = None
    role: str
    share_pct: float | None = None
    capital_paise: int | None = None
    sort_order: int | None = None
    notes: str | None = None


class TeamMemberUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    role: str | None = None
    share_pct: float | None = None
    capital_paise: int | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    notes: str | None = None


def _check_role(role: str) -> None:
    if role not in _ROLES:
        raise HTTPException(400, f"role must be one of {list(_ROLES)}")


async def _validate_owner_shares(
    db: AsyncSession, property_id: UUID, exclude_id: UUID | None = None,
) -> None:
    """Owners' active shares must sum to 100 (or all zero / all null if the
    owner hasn't filled them in yet — allow < 100 so the UI can be built up
    incrementally, but block > 100)."""
    conditions = [
        "property_id = :pid", "is_active = true",
        "role = 'OWNER'::team_role_enum", "share_pct IS NOT NULL",
    ]
    params: dict[str, Any] = {"pid": str(property_id)}
    if exclude_id:
        conditions.append("id <> :eid")
        params["eid"] = str(exclude_id)
    total_row = await db.execute(
        text(f"SELECT COALESCE(SUM(share_pct), 0) AS total FROM property_team WHERE {' AND '.join(conditions)}"),
        params,
    )
    total = Decimal(total_row.scalar() or 0)
    if total > 100:
        raise HTTPException(
            400,
            f"Owner shares would total {total}% — must not exceed 100%.",
        )


@router.get("/properties/{property_id}/team", summary="Property team roster")
async def list_team(
    property_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = False,
):
    conditions = ["property_id = :pid"]
    if not include_inactive:
        conditions.append("is_active = true")
    where = " AND ".join(conditions)
    res = await db.execute(
        text(f"""
            SELECT id, name, phone, role::text AS role, share_pct, capital_paise,
                   sort_order, is_active, notes, created_at, updated_at
            FROM property_team
            WHERE {where}
            ORDER BY
                CASE role::text WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END,
                sort_order, name
        """),
        {"pid": str(property_id)},
    )
    items = [dict(r) for r in res.mappings().fetchall()]
    return {"items": items, "total": len(items)}


@router.post("/properties/{property_id}/team", status_code=201, summary="Add a team member")
async def create_team_member(
    property_id: UUID,
    body: TeamMemberCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can edit the team roster")
    _check_role(body.role)
    share = body.share_pct if body.role == "OWNER" else None
    if share is not None and (share < 0 or share > 100):
        raise HTTPException(400, "share_pct must be between 0 and 100")

    res = await db.execute(
        text("""
            INSERT INTO property_team (property_id, name, phone, role, share_pct, capital_paise, sort_order, notes)
            VALUES (:pid, :name, :phone, CAST(:role AS team_role_enum), :share, :cap, COALESCE(:so, 0), :notes)
            RETURNING id
        """),
        {
            "pid": str(property_id), "name": body.name.strip(),
            "phone": (body.phone or "").strip() or None,
            "role": body.role, "share": share,
            "cap": body.capital_paise if body.capital_paise and body.capital_paise > 0 else None,
            "so": body.sort_order,
            "notes": (body.notes or "").strip() or None,
        },
    )
    new_id = res.scalar_one()
    if body.role == "OWNER" and share is not None:
        await _validate_owner_shares(db, property_id)
    await db.commit()
    return {"id": str(new_id), "message": "Team member added"}


@router.patch("/team/{member_id}", summary="Edit a team member")
async def update_team_member(
    member_id: UUID,
    body: TeamMemberUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can edit the team roster")

    existing = (await db.execute(
        text("SELECT id, property_id, role::text AS role FROM property_team WHERE id = :id"),
        {"id": str(member_id)},
    )).mappings().fetchone()
    if not existing:
        raise NotFoundError("Team member", member_id)

    updates = body.model_dump(exclude_unset=True)
    if "role" in updates:
        _check_role(updates["role"])
    if not updates:
        raise HTTPException(400, "No fields to update")

    set_parts = []
    params: dict[str, Any] = {"id": str(member_id)}
    for k, v in updates.items():
        if k == "role":
            set_parts.append("role = CAST(:role AS team_role_enum)")
            params["role"] = v
        elif k in ("name", "phone", "notes"):
            params[k] = (str(v).strip() or None) if v is not None else None
            set_parts.append(f"{k} = :{k}")
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v

    await db.execute(
        text(f"UPDATE property_team SET {', '.join(set_parts)}, updated_at = NOW() WHERE id = :id"),
        params,
    )

    # If the effective role is OWNER, re-check share totals for the property.
    new_role = updates.get("role", existing["role"])
    if new_role == "OWNER":
        await _validate_owner_shares(db, UUID(str(existing["property_id"])), exclude_id=None)
    await db.commit()
    return {"message": "Team member updated"}


@router.delete("/team/{member_id}", summary="Remove a team member (soft delete)")
async def delete_team_member(
    member_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can edit the team roster")
    res = await db.execute(
        text("UPDATE property_team SET is_active = false, updated_at = NOW() WHERE id = :id AND is_active = true"),
        {"id": str(member_id)},
    )
    if res.rowcount == 0:
        raise NotFoundError("Team member", member_id)
    await db.commit()
    return {"message": "Team member removed"}
