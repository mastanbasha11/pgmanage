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


def _org_slice(details: dict | None, org_id: Any) -> dict | None:
    """This org's entry from a run's per-org breakdown (None if not processed).

    `public.job_runs` is a platform-wide table — the background jobs sweep every
    org and store a per-org breakdown in `details.orgs`. An owner must only ever
    see their own org's slice, never the aggregate or another org's row."""
    for o in (details or {}).get("orgs", []):
        if o.get("org_id") == str(org_id):
            return o
    return None


def _org_status(details: dict | None, o: dict | None) -> str:
    """Run status from THIS org's point of view.

    Never surfaces that some *other* org failed: a run where the caller's org
    was fine reads SUCCESS even if the platform-wide status was PARTIAL."""
    if (details or {}).get("fatal_error") and o is None:
        return "FAILED"
    if o and (o.get("error") or o.get("failed")):
        return "PARTIAL"
    return "SUCCESS"


def _serialize(row: Any, org_id: Any) -> dict:
    """Owner-facing view of a run, scoped to the caller's org ONLY.

    All counts/status/errors are derived from this org's slice; the cross-org
    aggregate columns (orgs_processed, global messages_*) are deliberately
    dropped so no other org's activity is exposed."""
    details = row.details or {}
    o = _org_slice(details, org_id)
    return {
        "id": str(row.id),
        "job_name": row.job_name,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        "duration_seconds": _duration_seconds(row),
        "status": _org_status(details, o),
        "messages_sent": (o or {}).get("sent", 0),
        "messages_failed": (o or {}).get("failed", 0),
        # sends skipped because THIS org hasn't connected WhatsApp.
        "messages_skipped": (o or {}).get("skipped", 0),
        "ledger_entries_created": (o or {}).get("ledger_created", 0),
        "error_count": 1 if (o and o.get("error")) else 0,
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
    params: dict[str, Any] = {}
    where_sql = ""
    if job_name:
        where_sql = "WHERE job_name = :job_name"
        params["job_name"] = job_name

    # `status` can only be derived from each run's details JSON (it's the
    # ORG-SCOPED status, not the platform-wide column), so we scope + filter +
    # paginate in memory. job_runs is tiny (~2 rows/day); bound the scan to the
    # most recent 1000 runs so this stays cheap.
    rows = (
        await db.execute(
            text(
                f"SELECT {_COLUMNS} FROM public.job_runs {where_sql} "
                "ORDER BY started_at DESC LIMIT 1000"
            ),
            params,
        )
    ).fetchall()

    items = [_serialize(r, ctx.org_id) for r in rows]
    if status:
        items = [i for i in items if i["status"] == status]

    total = len(items)
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": start + page_size < total,
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

    # Scope EVERYTHING below to the caller's org. Never emit the full
    # details.orgs array or details.errors (those carry other orgs' ids, counts
    # and failure reasons). `messages` is already org-scoped via search_path.
    my_org = _org_slice(details, ctx.org_id) or {}
    my_reasons = my_org.get("reasons") or {}

    if fmt == "json":
        scoped_details = {
            "messages_sent": my_org.get("sent", 0),
            "messages_failed": my_org.get("failed", 0),
            "messages_skipped": my_org.get("skipped", 0),
            "ledger_entries_created": my_org.get("ledger_created", 0),
            "error": my_org.get("error"),
            "reasons": my_reasons,
        }
        body = json.dumps(
            {**_serialize(row, ctx.org_id), "details": scoped_details, "messages": messages},
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
            f"Status:           {_org_status(details, my_org or None)}",
            f"Messages sent:    {my_org.get('sent', 0)}",
            f"Messages failed:  {my_org.get('failed', 0)}",
            f"Messages skipped: {my_org.get('skipped', 0)}"
            "  (WhatsApp not connected)",
            f"Ledger created:   {my_org.get('ledger_created', 0)}",
        ]
        if my_org.get("error"):
            lines += ["", f"Run error: {my_org['error']}"]
        if my_reasons:
            # Why sends didn't go out (aggregated, no tenant PII), e.g.
            #   · WhatsApp not configured for this org ×5
            lines += ["", "Why messages didn't send", "-" * 40]
            lines += [f"- {reason} ×{count}" for reason, count in my_reasons.items()]

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
