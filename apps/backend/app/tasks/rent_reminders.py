"""
Monthly rent ledger generation + rent reminders, and daily overdue chasing.

Runs in-process via APScheduler (see app/main.py) or as a Lambda via handler().
Every run records a row in public.job_runs so the Job Monitor screen and the
downloadable log file can show exactly what happened.
"""
from __future__ import annotations

import asyncio
import calendar
import json
from datetime import date, datetime

import pytz

from app.core.config import settings

IST = pytz.timezone("Asia/Kolkata")


def _print_summary(r: dict) -> None:
    print(
        f"[{r['job_name']}] orgs={r['orgs_processed']} "
        f"sent={r['messages_sent']} failed={r['messages_failed']} "
        f"ledger={r.get('ledger_entries_created', 0)} "
        f"errors={len(r['errors'])}"
        + (f" FATAL={r['fatal_error']}" if r.get("fatal_error") else "")
    )


async def _record_job_run(started_at: datetime, results: dict) -> None:
    """Persist one job execution to public.job_runs (best-effort — never raises)."""
    from sqlalchemy import text

    from app.core.database import AsyncSessionLocal

    if results.get("fatal_error"):
        status = "FAILED"
    elif results["errors"] or results["messages_failed"]:
        status = "PARTIAL"
    else:
        status = "SUCCESS"

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("""
                    INSERT INTO public.job_runs
                        (job_name, started_at, finished_at, status, orgs_processed,
                         messages_sent, messages_failed, ledger_entries_created, details)
                    VALUES
                        (:job, :started, :finished, :status, :orgs,
                         :sent, :failed, :ledger, CAST(:details AS jsonb))
                """),
                {
                    "job": results["job_name"],
                    "started": started_at,
                    "finished": datetime.now(IST),
                    "status": status,
                    "orgs": results["orgs_processed"],
                    "sent": results["messages_sent"],
                    "failed": results["messages_failed"],
                    "ledger": results.get("ledger_entries_created", 0),
                    "details": json.dumps(results),
                },
            )
            await db.commit()
    except Exception as exc:  # noqa: BLE001 — logging must never break the job
        print(f"[job_runs] failed to record {results['job_name']}: {exc}")


async def _generate_and_remind(event: dict, context) -> dict:
    from sqlalchemy import text

    from app.core.database import AsyncSessionLocal, set_schema

    started_at = datetime.now(IST)
    now_ist = datetime.now(IST)
    month = now_ist.month
    year = now_ist.year

    results = {
        "job_name": "rent_reminders_monthly",
        "orgs_processed": 0,
        "ledger_entries_created": 0,
        "messages_sent": 0,
        "messages_failed": 0,
        "errors": [],
        "orgs": [],
    }

    try:
        async with AsyncSessionLocal() as db:
            orgs_result = await db.execute(
                text("SELECT id, schema_name FROM public.organisations WHERE is_active = true")
            )
            orgs = orgs_result.fetchall()

            for org in orgs:
                org_id, schema_name = org
                o = {"org_id": str(org_id), "sent": 0, "failed": 0, "ledger_created": 0}
                try:
                    await set_schema(db, schema_name)

                    tenants_result = await db.execute(
                        text("""
                            SELECT t.id AS tenant_id, t.name, t.phone, t.property_id,
                                   rp.monthly_rent_paise, rp.food_charges_paise,
                                   rp.other_charges_json, rp.billing_day,
                                   rp.discount_amount_paise,
                                   p.upi_vpa
                            FROM tenants t
                            JOIN rent_plans rp ON rp.tenant_id = t.id AND rp.is_active = true
                            JOIN properties p ON p.id = t.property_id
                            WHERE t.status = 'ACTIVE' AND t.is_deleted = false
                        """)
                    )
                    tenants = tenants_result.mappings().fetchall()

                    for tenant in tenants:
                        other = sum(
                            c.get("amount_paise", 0)
                            for c in (tenant["other_charges_json"] or [])
                        )
                        total_due = (
                            tenant["monthly_rent_paise"]
                            + tenant["food_charges_paise"]
                            + other
                            - tenant["discount_amount_paise"]
                        )
                        billing_day = min(tenant["billing_day"], 28)
                        due_date = date(year, month, billing_day)

                        await db.execute(
                            text("""
                                INSERT INTO rent_ledger_entries
                                    (tenant_id, property_id, month, year, amount_due_paise, due_date, status)
                                VALUES (:tid, :pid, :month, :year, :due, :due_date, 'UNPAID')
                                ON CONFLICT (tenant_id, month, year) DO NOTHING
                            """),
                            {
                                "tid": str(tenant["tenant_id"]),
                                "pid": str(tenant["property_id"]),
                                "month": month, "year": year,
                                "due": total_due, "due_date": due_date,
                            },
                        )
                        results["ledger_entries_created"] += 1
                        o["ledger_created"] += 1

                        if tenant["phone"]:
                            from app.services.notification_service import (
                                send_rent_reminder,
                            )
                            month_name = calendar.month_name[month]
                            res = await send_rent_reminder(
                                tenant_id=tenant["tenant_id"],
                                tenant_name=tenant["name"],
                                tenant_phone=tenant["phone"],
                                amount_paise=total_due,
                                month_name=f"{month_name} {year}",
                                due_date=due_date.strftime("%d %b %Y"),
                                upi_id=tenant["upi_vpa"] or "—",
                                org_id=org_id,
                                property_id=tenant["property_id"],
                                db=db,
                            )
                            if res.get("success"):
                                results["messages_sent"] += 1
                                o["sent"] += 1
                            else:
                                results["messages_failed"] += 1
                                o["failed"] += 1

                    await db.commit()
                    results["orgs_processed"] += 1

                except Exception as exc:
                    o["error"] = str(exc)
                    results["errors"].append({"org_id": str(org_id), "error": str(exc)})
                results["orgs"].append(o)
    except Exception as exc:  # noqa: BLE001
        results["fatal_error"] = str(exc)

    await _record_job_run(started_at, results)
    _print_summary(results)
    return results


async def _send_overdue_reminders(event: dict, context) -> dict:
    """Daily: chase UNPAID/PARTIAL tenants past the grace period (repeat-throttled)."""
    from sqlalchemy import text

    from app.core.database import AsyncSessionLocal, set_schema

    started_at = datetime.now(IST)
    now_ist = datetime.now(IST)
    month = now_ist.month
    year = now_ist.year

    results = {
        "job_name": "rent_overdue_daily",
        "orgs_processed": 0,
        "messages_sent": 0,
        "messages_failed": 0,
        "errors": [],
        "orgs": [],
    }

    try:
        async with AsyncSessionLocal() as db:
            orgs_result = await db.execute(
                text(
                    "SELECT id, schema_name, whatsapp_number "
                    "FROM public.organisations WHERE is_active = true"
                )
            )
            orgs = orgs_result.fetchall()

            for org in orgs:
                org_id, schema_name, org_wa_number = org
                o = {"org_id": str(org_id), "sent": 0, "failed": 0}
                # Meta rejects empty template params — always resolve a non-empty
                # manager contact for the overdue template's {{manager_phone}}.
                manager_phone = (
                    settings.OVERDUE_MANAGER_PHONE or org_wa_number or "the PG office"
                )
                try:
                    await set_schema(db, schema_name)

                    # Only chase entries (a) past due_date by >= OVERDUE_GRACE_DAYS and
                    # (b) not already notified within the last OVERDUE_REPEAT_DAYS — so a
                    # tenant gets one notice every few days, not one every morning.
                    overdue_result = await db.execute(
                        text("""
                            SELECT t.id, t.name, t.phone, t.property_id,
                                   rle.amount_due_paise - rle.amount_paid_paise AS outstanding_paise,
                                   (CURRENT_DATE - rle.due_date) AS days_overdue,
                                   p.upi_vpa, p.name AS property_name
                            FROM rent_ledger_entries rle
                            JOIN tenants t ON t.id = rle.tenant_id
                            JOIN properties p ON p.id = t.property_id
                            WHERE rle.month = :month AND rle.year = :year
                                AND rle.status IN ('UNPAID', 'PARTIAL')
                                AND t.status = 'ACTIVE'
                                AND t.is_deleted = false
                                AND t.phone IS NOT NULL
                                AND rle.due_date + :grace_days <= CURRENT_DATE
                                AND NOT EXISTS (
                                    SELECT 1 FROM notification_log nl
                                    WHERE nl.recipient_id = t.id
                                        AND nl.channel = 'WHATSAPP'
                                        AND nl.template_name = 'rent_overdue'
                                        AND nl.status = 'SENT'
                                        AND nl.sent_at >= NOW() - (:repeat_days * INTERVAL '1 day')
                                )
                        """),
                        {
                            "month": month, "year": year,
                            "grace_days": settings.OVERDUE_GRACE_DAYS,
                            "repeat_days": settings.OVERDUE_REPEAT_DAYS,
                        },
                    )
                    overdue = overdue_result.mappings().fetchall()
                    month_name = calendar.month_name[month]

                    for tenant in overdue:
                        from app.services.notification_service import send_rent_overdue
                        res = await send_rent_overdue(
                            tenant_id=tenant["id"],
                            tenant_name=tenant["name"],
                            tenant_phone=tenant["phone"],
                            amount_paise=tenant["outstanding_paise"],
                            month_name=f"{month_name} {year}",
                            manager_phone=manager_phone,
                            org_id=org_id,
                            property_id=tenant["property_id"],
                            db=db,
                            days_overdue=tenant["days_overdue"] or 0,
                            upi_vpa=tenant["upi_vpa"] or "—",
                            property_name=tenant["property_name"] or "",
                        )
                        if res.get("success"):
                            results["messages_sent"] += 1
                            o["sent"] += 1
                        else:
                            results["messages_failed"] += 1
                            o["failed"] += 1

                    await db.commit()
                    results["orgs_processed"] += 1

                except Exception as exc:
                    o["error"] = str(exc)
                    results["errors"].append({"org_id": str(org_id), "error": str(exc)})
                results["orgs"].append(o)
    except Exception as exc:  # noqa: BLE001
        results["fatal_error"] = str(exc)

    await _record_job_run(started_at, results)
    _print_summary(results)
    return results


def handler(event: dict, context) -> dict:
    """AWS Lambda entry point."""
    action = event.get("action", "generate_ledger")
    if action == "overdue_reminders":
        return asyncio.run(_send_overdue_reminders(event, context))
    return asyncio.run(_generate_and_remind(event, context))
