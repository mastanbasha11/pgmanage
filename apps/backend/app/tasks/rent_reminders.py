"""
Lambda/SQS handler: Monthly rent ledger generation + rent reminders.
Runs on the 1st of every month at 10 AM IST.
"""
from __future__ import annotations

import asyncio
import calendar
from datetime import date, datetime

import pytz

IST = pytz.timezone("Asia/Kolkata")


async def _generate_and_remind(event: dict, context) -> dict:
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal, set_schema

    now_ist = datetime.now(IST)
    month = now_ist.month
    year = now_ist.year

    results = {"orgs_processed": 0, "ledger_entries_created": 0, "reminders_sent": 0, "errors": []}

    async with AsyncSessionLocal() as db:
        # Get all active orgs
        orgs_result = await db.execute(
            text("SELECT id, schema_name, whatsapp_number FROM public.organisations WHERE is_active = true")
        )
        orgs = orgs_result.fetchall()

        for org in orgs:
            org_id, schema_name, _ = org
            try:
                await set_schema(db, schema_name)

                # Get all active tenants with rent plans (incl. their property's UPI).
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

                    # Create ledger entry (ON CONFLICT DO NOTHING prevents duplicates)
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

                    # Send rent reminder WhatsApp (skip silently if tenant has no phone).
                    if tenant["phone"]:
                        from app.services.notification_service import send_rent_reminder
                        month_name = calendar.month_name[month]
                        await send_rent_reminder(
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
                        results["reminders_sent"] += 1

                await db.commit()
                results["orgs_processed"] += 1

            except Exception as exc:
                results["errors"].append({"org_id": str(org_id), "error": str(exc)})

    return results


async def _send_overdue_reminders(event: dict, context) -> dict:
    """Called on billing_day + 5. Sends overdue notices to UNPAID/PARTIAL tenants."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal, set_schema

    now_ist = datetime.now(IST)
    month = now_ist.month
    year = now_ist.year

    results = {"reminders_sent": 0, "errors": []}

    async with AsyncSessionLocal() as db:
        orgs_result = await db.execute(
            text("SELECT id, schema_name FROM public.organisations WHERE is_active = true")
        )
        orgs = orgs_result.fetchall()

        for org in orgs:
            org_id, schema_name = org
            try:
                await set_schema(db, schema_name)

                overdue_result = await db.execute(
                    text("""
                        SELECT t.id, t.name, t.phone, t.property_id,
                               rle.amount_due_paise - rle.amount_paid_paise as outstanding_paise
                        FROM rent_ledger_entries rle
                        JOIN tenants t ON t.id = rle.tenant_id
                        WHERE rle.month = :month AND rle.year = :year
                            AND rle.status IN ('UNPAID', 'PARTIAL')
                            AND t.status = 'ACTIVE'
                    """),
                    {"month": month, "year": year},
                )
                overdue = overdue_result.mappings().fetchall()

                import calendar
                month_name = calendar.month_name[month]

                for tenant in overdue:
                    from app.services.notification_service import send_rent_overdue
                    await send_rent_overdue(
                        tenant_id=tenant["id"],
                        tenant_name=tenant["name"],
                        tenant_phone=tenant["phone"],
                        amount_paise=tenant["outstanding_paise"],
                        month_name=f"{month_name} {year}",
                        manager_phone="",
                        org_id=org_id,
                        property_id=tenant["property_id"],
                        db=db,
                    )
                    results["reminders_sent"] += 1

                await db.commit()

            except Exception as exc:
                results["errors"].append({"org_id": str(org_id), "error": str(exc)})

    return results


def handler(event: dict, context) -> dict:
    """AWS Lambda entry point."""
    action = event.get("action", "generate_ledger")
    if action == "overdue_reminders":
        return asyncio.run(_send_overdue_reminders(event, context))
    return asyncio.run(_generate_and_remind(event, context))
