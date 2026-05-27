"""WhatsApp and notification service via Meta Cloud API."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

import httpx

from app.core.config import settings


# ── WhatsApp message templates ────────────────────────────────────────────────

TEMPLATES = {
    "welcome_checkin": {
        "name": "welcome_checkin",
        "language": "en",
    },
    "rent_reminder": {
        "name": "rent_reminder",
        "language": "en",
    },
    "rent_overdue": {
        "name": "rent_overdue",
        "language": "en",
    },
    "move_out_reminder": {
        "name": "move_out_reminder",
        "language": "en",
    },
    "complaint_update": {
        "name": "complaint_update",
        "language": "en",
    },
    "announcement": {
        "name": "announcement",
        "language": "en",
    },
}


async def _get_property_whatsapp_credentials(property_id: UUID, db) -> dict | None:
    """
    WhatsApp creds for a PROPERTY (each property has its own number). Reads the
    current org schema's `properties` row, so the caller must have set the org
    search_path. Token comes from Secrets Manager in prod, a dev placeholder
    otherwise. Returns {phone_number_id, access_token} or None if not connected.
    """
    from sqlalchemy import text
    row = (
        await db.execute(
            text(
                "SELECT whatsapp_phone_number_id, whatsapp_access_token_secret_arn "
                "FROM properties WHERE id = :id"
            ),
            {"id": str(property_id)},
        )
    ).mappings().fetchone()
    if not row or not row["whatsapp_phone_number_id"]:
        return None

    if settings.is_production and row["whatsapp_access_token_secret_arn"]:
        import boto3
        client = boto3.client("secretsmanager", region_name=settings.AWS_REGION)
        secret = client.get_secret_value(SecretId=row["whatsapp_access_token_secret_arn"])
        token = json.loads(secret["SecretString"])["access_token"]
    else:
        token = "DEV_WHATSAPP_TOKEN"

    return {
        "phone_number_id": row["whatsapp_phone_number_id"],
        "access_token": token,
    }


async def send_whatsapp_template(
    to_phone: str,
    template_name: str,
    template_params: list[str],
    property_id: UUID,
    db,
) -> dict:
    """Send a pre-approved WhatsApp template message from a property's number."""
    creds = await _get_property_whatsapp_credentials(property_id, db)
    if not creds:
        return {"success": False, "error": "WhatsApp not configured for this org"}

    # Normalise phone number
    phone = to_phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = "+91" + phone

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en"},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": p} for p in template_params],
                }
            ],
        },
    }

    url = f"https://graph.facebook.com/v18.0/{creds['phone_number_id']}/messages"

    if settings.is_local:
        # In local dev, just log and return success
        print(f"[WA] {template_name} → {phone}: {template_params}")
        return {"success": True, "message_id": "dev_mock_id"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {creds['access_token']}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            message_id = data.get("messages", [{}])[0].get("id", "")
            return {"success": True, "message_id": message_id}
    except httpx.HTTPError as e:
        return {"success": False, "error": str(e)}


async def log_notification(
    org_id: UUID,
    property_id: UUID | None,
    recipient_type: str,
    recipient_id: UUID,
    channel: str,
    template_name: str,
    message_body: str,
    status: str,
    external_message_id: str | None,
    error_message: str | None,
    db,
) -> None:
    from sqlalchemy import text
    await db.execute(
        text("""
            INSERT INTO notification_log (
                org_id, property_id, recipient_type, recipient_id,
                channel, template_name, message_body, status,
                external_message_id, error_message, sent_at
            )
            VALUES (
                :org_id, :pid, :recipient_type, :recipient_id,
                :channel, :template_name, :message_body, CAST(:status AS notif_status_enum),
                :ext_id, :error, CASE WHEN :status = 'SENT' THEN NOW() ELSE NULL END
            )
        """),
        {
            "org_id": str(org_id), "pid": str(property_id) if property_id else None,
            "recipient_type": recipient_type, "recipient_id": str(recipient_id),
            "channel": channel, "template_name": template_name,
            "message_body": message_body, "status": status,
            "ext_id": external_message_id, "error": error_message,
        },
    )


async def send_whatsapp_to_tenant(
    db,
    tenant_id: UUID,
    template_name: str,
    params: list,
) -> dict:
    """
    The notification abstraction any module calls: sendWhatsApp(tenantId, template, params).

    Resolves the tenant → phone + their property's WhatsApp number + org, sends the
    approved template, and records a notification_log row. Never raises — returns
    {"success": bool, ...}. Caller must have the org search_path set (every
    request/task already does).
    """
    from sqlalchemy import text
    row = (
        await db.execute(
            text("SELECT phone, property_id, org_id FROM tenants WHERE id = :id"),
            {"id": str(tenant_id)},
        )
    ).mappings().fetchone()
    if not row:
        return {"success": False, "error": "tenant not found"}

    str_params = [str(p) for p in params]
    result = await send_whatsapp_template(
        to_phone=row["phone"],
        template_name=template_name,
        template_params=str_params,
        property_id=row["property_id"],
        db=db,
    )
    await log_notification(
        org_id=row["org_id"],
        property_id=row["property_id"],
        recipient_type="TENANT",
        recipient_id=tenant_id,
        channel="WHATSAPP",
        template_name=template_name,
        message_body=" | ".join(str_params),
        status="SENT" if result.get("success") else "FAILED",
        external_message_id=result.get("message_id"),
        error_message=result.get("error"),
        db=db,
    )
    return result


async def send_welcome_checkin(
    tenant_id: UUID,
    tenant_name: str,
    tenant_phone: str,
    property_name: str,
    room_number: str,
    bed_label: str,
    move_in_date: str,
    org_id: UUID,
    property_id: UUID,
    db,
) -> None:
    result = await send_whatsapp_template(
        to_phone=tenant_phone,
        template_name="welcome_checkin",
        template_params=[tenant_name, property_name, room_number, bed_label, move_in_date],
        property_id=property_id,
        db=db,
    )
    status = "SENT" if result["success"] else "FAILED"
    await log_notification(
        org_id=org_id,
        property_id=property_id,
        recipient_type="TENANT",
        recipient_id=tenant_id,
        channel="WHATSAPP",
        template_name="welcome_checkin",
        message_body=f"Welcome {tenant_name} to {property_name}",
        status=status,
        external_message_id=result.get("message_id"),
        error_message=result.get("error"),
        db=db,
    )


async def send_rent_reminder(
    tenant_id: UUID,
    tenant_name: str,
    tenant_phone: str,
    amount_paise: int,
    month_name: str,
    due_date: str,
    upi_id: str,
    org_id: UUID,
    property_id: UUID,
    db,
) -> None:
    amount_rupees = f"₹{amount_paise // 100:,}"
    result = await send_whatsapp_template(
        to_phone=tenant_phone,
        template_name="rent_reminder",
        template_params=[tenant_name, amount_rupees, month_name, due_date, upi_id],
        property_id=property_id,
        db=db,
    )
    status = "SENT" if result["success"] else "FAILED"
    await log_notification(
        org_id=org_id, property_id=property_id,
        recipient_type="TENANT", recipient_id=tenant_id,
        channel="WHATSAPP", template_name="rent_reminder",
        message_body=f"Rent reminder {amount_rupees} for {month_name}",
        status=status, external_message_id=result.get("message_id"),
        error_message=result.get("error"), db=db,
    )


async def send_rent_overdue(
    tenant_id: UUID,
    tenant_name: str,
    tenant_phone: str,
    amount_paise: int,
    month_name: str,
    manager_phone: str,
    org_id: UUID,
    property_id: UUID,
    db,
) -> None:
    amount_rupees = f"₹{amount_paise // 100:,}"
    result = await send_whatsapp_template(
        to_phone=tenant_phone,
        template_name="rent_overdue",
        template_params=[tenant_name, amount_rupees, month_name, manager_phone],
        property_id=property_id,
        db=db,
    )
    status = "SENT" if result["success"] else "FAILED"
    await log_notification(
        org_id=org_id, property_id=property_id,
        recipient_type="TENANT", recipient_id=tenant_id,
        channel="WHATSAPP", template_name="rent_overdue",
        message_body=f"Overdue notice {amount_rupees} for {month_name}",
        status=status, external_message_id=result.get("message_id"),
        error_message=result.get("error"), db=db,
    )
