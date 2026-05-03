"""
Lambda handler: Move-out reminders.
Runs daily at 9 AM IST. Sends reminder to tenants whose move-out is in 7 days.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

import pytz

IST = pytz.timezone("Asia/Kolkata")


async def _run(event: dict, context) -> dict:
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal, set_schema
    from app.services.notification_service import send_whatsapp_template, log_notification

    results = {"alerts_sent": 0, "errors": []}
    target_date = (datetime.now(IST) + timedelta(days=7)).date()

    async with AsyncSessionLocal() as db:
        orgs_result = await db.execute(
            text("SELECT id, schema_name FROM public.organisations WHERE is_active = true")
        )
        orgs = orgs_result.fetchall()

        for org in orgs:
            org_id, schema_name = org
            try:
                await set_schema(db, schema_name)

                tenants_result = await db.execute(
                    text("""
                        SELECT t.id, t.name, t.phone, t.property_id,
                               t.expected_move_out_date, p.name as property_name
                        FROM tenants t
                        JOIN properties p ON p.id = t.property_id
                        WHERE t.expected_move_out_date = :target_date
                            AND t.status = 'ACTIVE'
                            AND t.is_deleted = false
                    """),
                    {"target_date": target_date},
                )
                tenants = tenants_result.mappings().fetchall()

                for tenant in tenants:
                    move_out_str = target_date.strftime("%d %b %Y")
                    result = await send_whatsapp_template(
                        to_phone=tenant["phone"],
                        template_name="move_out_reminder",
                        template_params=[
                            tenant["name"],
                            tenant["property_name"],
                            move_out_str,
                        ],
                        org_id=org_id,
                        db=db,
                    )

                    await log_notification(
                        org_id=org_id,
                        property_id=tenant["property_id"],
                        recipient_type="TENANT",
                        recipient_id=tenant["id"],
                        channel="WHATSAPP",
                        template_name="move_out_reminder",
                        message_body=f"Move-out reminder for {tenant['name']} on {move_out_str}",
                        status="SENT" if result["success"] else "FAILED",
                        external_message_id=result.get("message_id"),
                        error_message=result.get("error"),
                        db=db,
                    )

                    if result["success"]:
                        results["alerts_sent"] += 1

                await db.commit()

            except Exception as exc:
                results["errors"].append({"org_id": str(org_id), "error": str(exc)})

    return results


def handler(event: dict, context) -> dict:
    return asyncio.run(_run(event, context))
