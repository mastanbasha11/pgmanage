"""
Daily job: auto-close stale leads.

Any still-open lead that hasn't been touched in `IDLE_DAYS` days and has no
upcoming follow-up is moved to `LOST` and stamped with a distinctive
`lost_reason` so it's clearly an automatic close, not a rep's manual decision.
That stamp is the "flag" — the frontend shows an `auto` tag on these rows, and
the reason string is greppable in `lost_reason` for reporting.

Runs daily at 07:30 IST (registered in app/main.py). The SELECT/UPDATE lives in
`AUTO_LOST_UPDATE_SQL` and is imported by the test so any drift in the WHERE
clause breaks the test immediately (mirrors rent_reminders.OVERDUE_SELECT_SQL).
"""
from __future__ import annotations

import asyncio

# Leads untouched for this many days (and with no upcoming follow-up) get
# auto-closed. Matches the "Idle > 30d" saved view in the web worklist.
IDLE_DAYS = 30

# The flag. Any lead whose lost_reason starts with "Auto-closed" was moved by
# this job, not by a human — the UI keys the `auto` badge off this prefix.
AUTO_LOST_REASON = "Auto-closed: no activity for 30+ days"

# A lead is stale when its last touch (contact, else creation) is older than
# IDLE_DAYS AND it has no follow-up still pending in the future. A future
# follow-up means a rep deliberately kept it alive, so we leave it be.
AUTO_LOST_UPDATE_SQL = """
    UPDATE leads
    SET status = 'LOST',
        lost_reason = :reason,
        updated_at = NOW()
    WHERE is_deleted = false
      AND status NOT IN ('CONVERTED', 'LOST')
      AND COALESCE(last_contacted_at, created_at)
          < NOW() - make_interval(days => :idle_days)
      AND (next_followup_at IS NULL OR next_followup_at < NOW())
    RETURNING id
"""


async def _run(event: dict, context) -> dict:
    from sqlalchemy import text

    from app.core.database import AsyncSessionLocal, set_schema

    results: dict = {"leads_closed": 0, "orgs_processed": 0, "errors": []}

    async with AsyncSessionLocal() as db:
        orgs = (
            await db.execute(
                text(
                    "SELECT id, schema_name FROM public.organisations "
                    "WHERE is_active = true"
                )
            )
        ).fetchall()

        for org_id, schema_name in orgs:
            try:
                await set_schema(db, schema_name)
                res = await db.execute(
                    text(AUTO_LOST_UPDATE_SQL),
                    {"reason": AUTO_LOST_REASON, "idle_days": IDLE_DAYS},
                )
                closed = len(res.fetchall())
                await db.commit()
                results["leads_closed"] += closed
                results["orgs_processed"] += 1
            except Exception as exc:  # noqa: BLE001 — one bad org must not stop the rest
                await db.rollback()
                results["errors"].append({"org_id": str(org_id), "error": str(exc)})

    return results


def handler(event: dict, context) -> dict:
    return asyncio.run(_run(event, context))
