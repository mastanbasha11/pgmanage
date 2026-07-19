"""Lead and prospect management."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context, require_roles
from app.core.exceptions import NotFoundError
from app.services.audit_constants import Event
from app.services.audit_service import diff_changes, log_event

router = APIRouter()


@router.get(
    "/website/integration",
    summary="Website-lead integration details (public token, webhook URL, embed snippet)",
)
async def website_integration(
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the org's website-lead integration config for the
    Settings → Website Integration page: the public site token, the webhook URL
    to POST to, the configured CORS allowlist, and a ready-to-paste JS snippet.
    """
    row = (
        await db.execute(
            text(
                "SELECT website_lead_token, website_allowed_origins, website_lead_notify_email "
                "FROM public.organisations WHERE id = :id"
            ),
            {"id": str(ctx.org_id)},
        )
    ).fetchone()
    token = row[0] if row else None
    allowed_origins = row[1] if row else None
    notify_email = row[2] if row else None

    base = settings.APP_BASE_URL.rstrip("/")
    webhook_url = f"{base}/api/v1/leads/website?token={token}" if token else None

    snippet = (
        "<script>\n"
        "async function submitBooking(form) {\n"
        f'  const res = await fetch("{webhook_url}", {{\n'
        '    method: "POST",\n'
        '    headers: { "Content-Type": "application/json" },\n'
        "    body: JSON.stringify({\n"
        "      name: form.name.value,\n"
        "      email: form.email.value,\n"
        "      phone: form.phone.value,\n"
        "      roomType: form.roomType.value,\n"
        "      moveInDate: form.moveInDate.value,\n"
        "      message: form.message.value,\n"
        "    }),\n"
        "  });\n"
        "  return res.json(); // { success: true, leadId: \"...\" }\n"
        "}\n"
        "</script>"
    )

    return {
        "token": token,
        "webhook_url": webhook_url,
        "allowed_origins": allowed_origins,
        "notify_email": notify_email,
        "snippet": snippet,
        "rate_limit_per_hour": 10,
    }


class WebsiteIntegrationUpdate(BaseModel):
    notify_email: EmailStr | None = None
    allowed_origins: str | None = None


@router.patch("/website/integration", summary="Update website-lead integration settings")
async def update_website_integration(
    body: WebsiteIntegrationUpdate,
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER"])),
    db: AsyncSession = Depends(get_db),
):
    """Set where new-website-lead emails go (notify_email) and/or the CORS allowlist."""
    sets: list[str] = []
    params: dict[str, Any] = {"id": str(ctx.org_id)}
    if body.notify_email is not None:
        sets.append("website_lead_notify_email = :email")
        params["email"] = str(body.notify_email)
    if body.allowed_origins is not None:
        sets.append("website_allowed_origins = :origins")
        params["origins"] = body.allowed_origins.strip() or None
    if not sets:
        raise HTTPException(400, "No fields to update")
    await db.execute(
        text(f"UPDATE public.organisations SET {', '.join(sets)} WHERE id = :id"), params
    )
    await db.commit()
    return {"message": "Website integration updated"}


class LeadCreate(BaseModel):
    property_id: UUID
    name: str
    phone: str
    whatsapp_number: str | None = None
    source: str = "OTHER"
    source_campaign_name: str | None = None
    # Meta ad attribution — set automatically by the WhatsApp webhook once
    # that flow lands; safe to pass manually for now.
    source_ad_id: str | None = None
    source_adset_name: str | None = None
    interested_room_type: str | None = None
    interested_bed_count: int | None = None
    budget_min_paise: int | None = None
    budget_max_paise: int | None = None
    expected_move_in_date: date | None = None
    notes: str | None = None
    assigned_to: UUID | None = None
    next_followup_at: datetime | None = None


class LeadUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
    assigned_to: UUID | None = None
    next_followup_at: datetime | None = None
    lost_reason: str | None = None
    # Editable on the detail drawer too so reps can correct/complete
    # info without re-entering the whole lead.
    name: str | None = None
    phone: str | None = None
    whatsapp_number: str | None = None
    email: str | None = None
    source: str | None = None
    source_campaign_name: str | None = None
    source_ad_id: str | None = None
    source_adset_name: str | None = None
    interested_room_type: str | None = None
    interested_bed_count: int | None = None
    budget_min_paise: int | None = None
    budget_max_paise: int | None = None
    expected_move_in_date: date | None = None
    # BOOKED status carries an advance payment — set both together via the
    # /leads/{id}/book endpoint, or manually here if a rep is correcting
    # history.
    advance_paise: int | None = None
    advance_paid_at: datetime | None = None


class LeadActivityCreate(BaseModel):
    activity_type: str
    notes: str | None = None
    scheduled_at: datetime | None = None


@router.post("/leads", status_code=status.HTTP_201_CREATED, summary="Create lead")
async def create_lead(
    body: LeadCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            INSERT INTO leads (org_id, property_id, name, phone, whatsapp_number, source,
                source_campaign_name, source_ad_id, source_adset_name,
                interested_room_type, interested_bed_count,
                budget_min_paise, budget_max_paise, expected_move_in_date,
                status, notes, assigned_to, next_followup_at, created_by)
            VALUES (:org_id, :pid, :name, :phone, :wa_num, CAST(:source AS lead_source_enum),
                :campaign, :ad_id, :adset,
                :room_type, :bed_count,
                :budget_min, :budget_max, :move_in,
                'NEW'::lead_status_enum, :notes, :assigned_to, :followup, :created_by)
            RETURNING id
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(body.property_id),
            "name": body.name, "phone": body.phone, "wa_num": body.whatsapp_number,
            "source": body.source, "campaign": body.source_campaign_name,
            "ad_id": body.source_ad_id, "adset": body.source_adset_name,
            "room_type": body.interested_room_type, "bed_count": body.interested_bed_count,
            "budget_min": body.budget_min_paise, "budget_max": body.budget_max_paise,
            "move_in": body.expected_move_in_date, "notes": body.notes,
            "assigned_to": str(body.assigned_to) if body.assigned_to else None,
            "followup": body.next_followup_at,
            "created_by": str(ctx.user_id),
        },
    )
    lead_id = result.scalar_one()

    await log_event(
        db,
        Event.LEAD_CREATED,
        description=f"{ctx.name} added lead {body.name}",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="lead",
        entity_id=lead_id,
        entity_name=body.name,
        property_id=body.property_id,
        metadata={"source": body.source},
    )
    await db.commit()
    return {"lead_id": str(lead_id), "status": "NEW"}


@router.get("/leads", summary="List leads")
async def list_leads(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    status: str | None = Query(None),
    source: str | None = Query(None),
    assigned_to: UUID | None = Query(None),
    # Kanban board loads every status in one call — a 50-row default page
    # starved the non-NEW columns the moment 50 due-today leads existed.
    limit: int = Query(500, le=1000),
):
    conditions = ["l.org_id = :org_id", "l.is_deleted = false"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}

    if property_id:
        conditions.append("l.property_id = :pid")
        params["pid"] = str(property_id)
    if status:
        conditions.append("l.status = CAST(:status AS lead_status_enum)")
        params["status"] = status
    if source:
        conditions.append("l.source = CAST(:source AS lead_source_enum)")
        params["source"] = source
    if assigned_to:
        conditions.append("l.assigned_to = :assigned_to")
        params["assigned_to"] = str(assigned_to)

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"""
            SELECT l.id, l.name, l.phone, l.email, l.source, l.status, l.notes,
                   l.budget_min_paise, l.budget_max_paise, l.interested_room_type,
                   l.expected_move_in_date, l.next_followup_at, l.last_contacted_at,
                   l.created_at, l.assigned_to,
                   u.name as assigned_to_name,
                   EXTRACT(DAY FROM NOW() - l.last_contacted_at)::int as days_since_contact
            FROM leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE {where}
            ORDER BY l.next_followup_at ASC NULLS LAST, l.created_at DESC
            LIMIT :limit
        """),
        {**params, "limit": limit},
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.get("/leads/pipeline-stats", summary="Lead counts by status")
async def pipeline_stats(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
):
    conditions = ["org_id = :org_id", "is_deleted = false"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}
    if property_id:
        conditions.append("property_id = :pid")
        params["pid"] = str(property_id)

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"SELECT status, COUNT(*) as count FROM leads WHERE {where} GROUP BY status"),
        params,
    )
    rows = result.mappings().fetchall()
    stats = {r["status"]: r["count"] for r in rows}
    for s in ("NEW", "CONTACTED", "SITE_VISITED", "NEGOTIATING", "CONVERTED", "LOST"):
        stats.setdefault(s, 0)
    return stats


@router.get("/leads/due-today", summary="Leads with follow-up due today")
async def due_today(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
):
    conditions = ["org_id = :org_id", "is_deleted = false", "DATE(next_followup_at) = CURRENT_DATE"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}
    if property_id:
        conditions.append("property_id = :pid")
        params["pid"] = str(property_id)

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"SELECT id, name, phone, status, interested_room_type, budget_min_paise, budget_max_paise FROM leads WHERE {where}"),
        params,
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.get("/leads/{lead_id}", summary="Lead detail with activity timeline")
async def get_lead(
    lead_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT l.*, u.name as assigned_to_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to WHERE l.id = :id AND l.org_id = :org_id"),
        {"id": str(lead_id), "org_id": str(ctx.org_id)},
    )
    lead = result.mappings().fetchone()
    if not lead:
        raise NotFoundError("Lead", lead_id)

    activities_result = await db.execute(
        text("""
            SELECT la.id, la.activity_type, la.notes, la.scheduled_at, la.created_at,
                   u.name as done_by_name
            FROM lead_activities la
            LEFT JOIN users u ON u.id = la.done_by
            WHERE la.lead_id = :id
            ORDER BY la.created_at DESC
        """),
        {"id": str(lead_id)},
    )
    activities = [dict(a) for a in activities_result.mappings().fetchall()]
    return {**dict(lead), "activities": activities}


@router.patch("/leads/{lead_id}", summary="Update lead")
async def update_lead(
    lead_id: UUID,
    body: LeadUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        from fastapi import HTTPException
        raise HTTPException(400, "No fields to update")

    # Old values BEFORE the update, for the before/after diff.
    lead_cols = ", ".join(updates.keys())
    old_lead = (await db.execute(
        text(f"SELECT {lead_cols} FROM leads WHERE id = :id AND org_id = :org_id"),
        {"id": str(lead_id), "org_id": str(ctx.org_id)},
    )).mappings().fetchone()
    changes = diff_changes(dict(old_lead) if old_lead else {}, updates)

    # Any lead column typed as a Postgres enum needs an explicit CAST so a
    # bare string param doesn't blow up as "text = lead_status_enum".
    lead_enum_columns = {
        "status": "lead_status_enum",
        "source": "lead_source_enum",
    }
    set_clauses = ", ".join(
        f"{k} = CAST(:{k} AS {lead_enum_columns[k]})" if k in lead_enum_columns else f"{k} = :{k}"
        for k in updates
    )
    updates["lead_id"] = str(lead_id)
    updates["org_id"] = str(ctx.org_id)

    await db.execute(
        text(f"UPDATE leads SET {set_clauses}, updated_at = NOW() WHERE id = :lead_id AND org_id = :org_id"),
        updates,
    )

    if changes:
        status_changed = "status" in changes
        await log_event(
            db,
            Event.LEAD_STATUS_CHANGED if status_changed else Event.LEAD_UPDATED,
            description=(
                f"{ctx.name} moved a lead to {changes['status']['new']}"
                if status_changed
                else f"{ctx.name} updated a lead"
            ),
            actor_user_id=ctx.user_id,
            actor_role=ctx.role,
            actor_name=ctx.name,
            entity_type="lead",
            entity_id=lead_id,
            metadata={"changes": changes},
        )
    await db.commit()
    return {"message": "Lead updated"}


@router.post("/leads/{lead_id}/activities", status_code=201, summary="Log lead activity")
async def log_activity(
    lead_id: UUID,
    body: LeadActivityCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            INSERT INTO lead_activities (lead_id, activity_type, notes, scheduled_at, done_by)
            VALUES (:lead_id, CAST(:activity_type AS lead_activity_type_enum), :notes, :scheduled_at, :done_by)
            RETURNING id
        """),
        {
            "lead_id": str(lead_id), "activity_type": body.activity_type,
            "notes": body.notes, "scheduled_at": body.scheduled_at,
            "done_by": str(ctx.user_id),
        },
    )
    activity_id = result.scalar_one()

    # Update last_contacted_at on lead
    await db.execute(
        text("UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = :id"),
        {"id": str(lead_id)},
    )
    await db.commit()
    return {"activity_id": str(activity_id)}


@router.post("/leads/{lead_id}/convert", summary="Convert lead to tenant")
async def convert_lead(
    lead_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Mark lead as converted. The actual check-in happens via POST /tenants."""
    lead_result = await db.execute(
        text("SELECT * FROM leads WHERE id = :id AND org_id = :org_id"),
        {"id": str(lead_id), "org_id": str(ctx.org_id)},
    )
    lead = lead_result.mappings().fetchone()
    if not lead:
        raise NotFoundError("Lead", lead_id)

    await db.execute(
        text("UPDATE leads SET status = 'CONVERTED'::lead_status_enum, updated_at = NOW() WHERE id = :id"),
        {"id": str(lead_id)},
    )

    await log_event(
        db,
        Event.LEAD_CONVERTED,
        description=f"{ctx.name} converted lead {lead['name']}",
        actor_user_id=ctx.user_id,
        actor_role=ctx.role,
        actor_name=ctx.name,
        entity_type="lead",
        entity_id=lead_id,
        entity_name=lead["name"],
        property_id=lead["property_id"],
    )
    await db.commit()

    # Return lead data to prefill check-in form
    return {
        "message": "Lead marked as converted. Use POST /tenants to complete check-in.",
        "prefill": {
            "name": lead["name"],
            "phone": lead["phone"],
            "property_id": str(lead["property_id"]),
        },
    }
