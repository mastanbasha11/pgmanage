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

    if fmt == "json":
        body = json.dumps(
            {**_serialize(row), "details": details}, indent=2, default=str
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
        body = "\n".join(lines) + "\n"
        media = "text/plain"

    return PlainTextResponse(
        body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
