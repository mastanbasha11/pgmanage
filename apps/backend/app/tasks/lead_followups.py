"""
Lambda handler: Daily lead follow-up reminders.
Runs at 9 AM IST. Notifies assigned staff about leads due today.
"""
from __future__ import annotations

import asyncio
from datetime import datetime

import pytz

IST = pytz.timezone("Asia/Kolkata")


async def _run(event: dict, context) -> dict:
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal, set_schema
    from app.services.notification_service import send_whatsapp_template

    results = {"notifications_sent": 0, "errors": []}

    async with AsyncSessionLocal() as db:
        orgs_result = await db.execute(
            text("SELECT id, schema_name FROM public.organisations WHERE is_active = true")
        )
        orgs = orgs_result.fetchall()

        for org in orgs:
            org_id, schema_name = org
            try:
                await set_schema(db, schema_name)

                # Find leads with followup due today, that have an assigned user
                leads_result = await db.execute(
                    text("""
                        SELECT l.name as lead_name, l.phone as lead_phone,
                               l.interested_room_type, l.budget_min_paise, l.budget_max_paise,
                               u.name as staff_name, u.phone as staff_phone
                        FROM leads l
                        JOIN users u ON u.id = l.assigned_to
                        WHERE DATE(l.next_followup_at) = CURRENT_DATE
                            AND l.status NOT IN ('CONVERTED', 'LOST')
                            AND l.is_deleted = false
                            AND u.is_active = true
                    """)
                )
                leads = leads_result.mappings().fetchall()

                for lead in leads:
                    budget = ""
                    if lead["budget_min_paise"] and lead["budget_max_paise"]:
                        budget = f"₹{lead['budget_min_paise']//100:,}-₹{lead['budget_max_paise']//100:,}"

                    result = await send_whatsapp_template(
                        to_phone=lead["staff_phone"],
                        template_name="lead_followup_reminder",
                        template_params=[
                            lead["staff_name"],
                            lead["lead_name"],
                            lead["lead_phone"],
                            lead["interested_room_type"] or "any",
                            budget,
                        ],
                        org_id=org_id,
                        db=db,
                    )
                    if result["success"]:
                        results["notifications_sent"] += 1

                await db.commit()

            except Exception as exc:
                results["errors"].append({"org_id": str(org_id), "error": str(exc)})

    return results


def handler(event: dict, context) -> dict:
    return asyncio.run(_run(event, context))
