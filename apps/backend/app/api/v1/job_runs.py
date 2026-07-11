"""
Scheduler job-run monitoring (read-only).

Lists executions of the background jobs (rent_reminders_monthly,
rent_overdue_daily) from public.job_runs, and serves a downloadable log
file per run. Gated to OWNER / PARTNER.

Note: job_runs is a platform-wide table (the jobs iterate every org). The
summary counts here are global; in a larger multi-tenant deployment this
screen would move under /api/platform. Fine for the current operator.
"""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, require_roles
from app.core.exceptions import NotFoundError

router = APIRouter()

_ADMIN = require_roles(["OWNER", "PARTNER"])

_COLUMNS = (
    "id, job_name, started_at, finished_at, status, orgs_processed, "
    "messages_sent, messages_failed, ledger_entries_created, details, created_at"
)


def _duration_seconds(row: Any) -> float | None:
    if row.started_at and row.finished_at:
        return round((row.finished_at - row.started_at).total_seconds(), 1)
    return None


def _serialize(row: Any) -> dict:
    return {
        "id": str(row.id),
        "job_name": row.job_name,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        "duration_seconds": _duration_seconds(row),
        "status": row.status,
        "orgs_processed": row.orgs_processed,
        "messages_sent": row.messages_sent,
        "messages_failed": row.messages_failed,
        "ledger_entries_created": row.ledger_entries_created,
        "error_count": len((row.details or {}).get("errors", [])) if row.details else 0,
    }


@router.get("/job-runs", summary="Background-job execution history")
async def list_job_runs(
    ctx: OrgContext = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
    job_name: str | None = Query(None, description="rent_reminders_monthly / rent_overdue_daily"),
    status: str | None = Query(None, description="SUCCESS / PARTIAL / FAILED"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict:
    where: list[str] = []
    params: dict[str, Any] = {}
    if job_name:
        where.append("job_name = :job_name")
        params["job_name"] = job_name
    if status:
        where.append("status = :status")
        params["status"] = status
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    total = (
        await db.execute(
            text(f"SELECT COUNT(*) FROM public.job_runs {where_sql}"), params
        )
    ).scalar() or 0

    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    rows = (
        await db.execute(
            text(
                f"SELECT {_COLUMNS} FROM public.job_runs {where_sql} "
                "ORDER BY started_at DESC LIMIT :limit OFFSET :offset"
            ),
            params,
        )
    ).fetchall()

    return {
        "items": [_serialize(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": (page * page_size) < total,
    }


@router.get("/job-runs/{run_id}/logfile", summary="Download a run's execution log")
async def download_job_run_log(
    run_id: UUID,
    ctx: OrgContext = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
    fmt: str = Query("txt", pattern="^(txt|json)$"),
):
    row = (
        await db.execute(
            text(f"SELECT {_COLUMNS} FROM public.job_runs WHERE id = :id"),
            {"id": str(run_id)},
        )
    ).fetchone()
    if not row:
        raise NotFoundError("JobRun", str(run_id))

    details = row.details or {}
    stamp = row.started_at.strftime("%Y%m%d-%H%M%S") if row.started_at else "unknown"
    filename = f"{row.job_name}_{stamp}.{fmt}"

    # Per-message detail for THIS org, from notification_log within the run window
    # (search_path is the caller's org, so owners only see their own messages).
    messages: list[dict] = []
    if row.started_at:
        msg_rows = (
            await db.execute(
                text("""
                    SELECT nl.recipient_phone, nl.rendered_message, nl.message_body,
                           nl.sent_at, nl.delivered_at, nl.status, nl.delivery_status,
                           nl.error_message, r.room_number AS room_number,
                           t.name AS tenant_name
                    FROM notification_log nl
                    LEFT JOIN tenants t ON t.id = nl.recipient_id AND nl.recipient_type = 'TENANT'
                    LEFT JOIN beds b ON b.id = t.bed_id
                    LEFT JOIN rooms r ON r.id = b.room_id
                    WHERE nl.channel = 'WHATSAPP'
                      AND nl.created_at BETWEEN :start AND COALESCE(:finish, NOW())
                      AND nl.template_name IN ('rent_reminder', 'rent_overdue')
                    ORDER BY nl.created_at
                """),
                {"start": row.started_at, "finish": row.finished_at},
            )
        ).fetchall()
        messages = [
            {
                "to": m.recipient_phone,
                "room_number": m.room_number,
                "tenant_name": m.tenant_name,
                "message": m.rendered_message or m.message_body,
                "triggered_at": m.sent_at.isoformat() if m.sent_at else None,
                "delivered_at": m.delivered_at.isoformat() if m.delivered_at else None,
                "status": m.status,
                "delivery_status": m.delivery_status,
                "error": m.error_message,
            }
            for m in msg_rows
        ]

    if fmt == "json":
        body = json.dumps(
            {**_serialize(row), "details": details, "messages": messages},
            indent=2, default=str,
        )
        media = "application/json"
    else:
        lines = [
            "PGManage — background job run",
            "=" * 40,
            f"Job:              {row.job_name}",
            f"Run ID:           {row.id}",
            f"Started:          {row.started_at}",
            f"Finished:         {row.finished_at}",
            f"Duration (s):     {_duration_seconds(row)}",
            f"Status:           {row.status}",
            f"Orgs processed:   {row.orgs_processed}",
            f"Messages sent:    {row.messages_sent}",
            f"Messages failed:  {row.messages_failed}",
            f"Ledger created:   {row.ledger_entries_created}",
            "",
            "Per-org breakdown",
            "-" * 40,
        ]
        for o in details.get("orgs", []):
            line = (
                f"- org {o.get('org_id')}: sent={o.get('sent', 0)} "
                f"failed={o.get('failed', 0)}"
            )
            if "ledger_created" in o:
                line += f" ledger={o.get('ledger_created', 0)}"
            if o.get("error"):
                line += f"  ERROR: {o['error']}"
            lines.append(line)
        errors = details.get("errors", [])
        if errors:
            lines += ["", "Errors", "-" * 40]
            lines += [f"- {e.get('org_id')}: {e.get('error')}" for e in errors]
        if details.get("fatal_error"):
            lines += ["", f"FATAL: {details['fatal_error']}"]

        lines += ["", f"Messages sent this run ({len(messages)})", "=" * 40]
        for m in messages:
            state = m["delivery_status"] or m["status"]
            lines += [
                "",
                f"To:         {m['to'] or '—'}",
                f"Room:       {m['room_number'] or '—'}",
                f"Resident:   {m['tenant_name'] or '—'}",
                f"Status:     {state}" + (f"  ERROR: {m['error']}" if m["error"] else ""),
                f"Triggered:  {m['triggered_at'] or '—'}",
                f"Delivered:  {m['delivered_at'] or '—'}",
                "Message:",
                (m["message"] or "").rstrip(),
                "-" * 40,
            ]
        body = "\n".join(lines) + "\n"
        media = "text/plain"

    return PlainTextResponse(
        body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
