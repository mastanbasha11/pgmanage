"""WhatsApp and notification service via Meta Cloud API."""
from __future__ import annotations

import json
from uuid import UUID

import httpx

from app.core.config import settings

# ── WhatsApp message templates ────────────────────────────────────────────────

# Meta language codes per template. en_US is the default Meta picks in its
# UI, so it's the most common approval; override here if any one template
# was approved under a different code (e.g. "en" plain English, "hi" Hindi).
TEMPLATES: dict[str, dict[str, str]] = {
    "welcome_checkin":    {"name": "welcome_checkin",    "language": "en_US"},
    "rent_reminder":      {"name": "rent_reminder",      "language": "en_US"},
    "rent_overdue":       {"name": "rent_overdue",       "language": "en_US"},
    "move_out_reminder":  {"name": "move_out_reminder",  "language": "en_US"},
    "complaint_update":   {"name": "complaint_update",   "language": "en_US"},
    "announcement":       {"name": "announcement",       "language": "en_US"},
}


# Maps logical key → DB columns holding the per-property override for that template.
_OVERRIDE_COLUMNS: dict[str, tuple[str, str, str]] = {
    # (name_col, language_col, params_col)
    "rent_reminder": (
        "wa_rent_reminder_template_name",
        "wa_rent_reminder_template_language",
        "wa_rent_reminder_template_params",
    ),
    "rent_overdue": (
        "wa_rent_overdue_template_name",
        "wa_rent_overdue_template_language",
        "wa_rent_overdue_template_params",
    ),
}


# ── Built-in variable catalogue ──────────────────────────────────────────────
#
# Every variable that can appear in a {{N}} slot. The Templates wizard reads
# the per-template list to populate the dropdown next to each placeholder.
# When `send_whatsapp_template` is called it receives a `context` dict with
# the live values for these keys (filled in by the caller — rent_reminders
# task, the test-send endpoint, etc.).

BUILT_IN_VARIABLES: dict[str, dict[str, list[dict[str, str]]]] = {
    "rent_reminder": {
        "variables": [
            {"key": "tenant_name",       "label": "Resident's full name",            "example": "Asha Rao"},
            {"key": "tenant_first_name", "label": "Resident's first name",           "example": "Asha"},
            {"key": "amount_rupees",     "label": "Amount due (number; ₹ from template)", "example": "9,000"},
            {"key": "month_name",        "label": "Billing month (e.g. June 2026)",  "example": "June 2026"},
            {"key": "due_date",          "label": "Due date (e.g. 10 Jun 2026)",     "example": "10 Jun 2026"},
            {"key": "upi_vpa",           "label": "Property UPI handle",             "example": "loop@okhdfc"},
            {"key": "property_name",     "label": "Property display name",           "example": "Loop Coliving PG"},
            {"key": "room_label",        "label": "Room · Bed (e.g. 101·A)",         "example": "101·A"},
        ],
    },
    "rent_overdue": {
        "variables": [
            {"key": "tenant_name",       "label": "Resident's full name",            "example": "Asha Rao"},
            {"key": "tenant_first_name", "label": "Resident's first name",           "example": "Asha"},
            {"key": "amount_rupees",     "label": "Outstanding (number; ₹ from template)","example": "9,000"},
            {"key": "month_name",        "label": "Billing month",                   "example": "June 2026"},
            {"key": "days_overdue",      "label": "Days overdue",                    "example": "7"},
            {"key": "upi_vpa",           "label": "Property UPI handle",             "example": "loop@okhdfc"},
            {"key": "property_name",     "label": "Property display name",           "example": "Loop Coliving PG"},
            {"key": "manager_phone",     "label": "Manager's phone (with +91)",      "example": "+919999999999"},
        ],
    },
}


def _build_params(
    params_config: list[dict] | None,
    context: dict[str, str],
    legacy: list[str],
) -> list[str]:
    """
    Translate the per-property params config into the ordered string list
    that goes into Meta's `components[0].parameters` body.

    `params_config` shape: list of {kind, key|value} dicts (see migration 018).
    `context` shape: { variable_key -> already-formatted-string }.
    `legacy` is the historical hardcoded ordered list (5 strings for
    rent_reminder, 4 for rent_overdue) — used as a fallback when the
    property hasn't configured params yet, so existing setups keep working.

    Unknown variable keys resolve to empty string rather than raising — Meta
    rejects messages with empty params, but a config-time validation error
    elsewhere is the right way to catch that; we don't want a runtime KeyError
    silently swallowed.
    """
    if params_config is None:
        return legacy
    if not isinstance(params_config, list):
        return legacy
    out: list[str] = []
    for entry in params_config:
        if not isinstance(entry, dict):
            continue
        kind = entry.get("kind")
        if kind == "variable":
            key = entry.get("key") or ""
            out.append(str(context.get(key, "")))
        elif kind == "static":
            out.append(str(entry.get("value", "")))
    return out


def _params_config_for(template_name: str, overrides: dict) -> list[dict] | None:
    cols = _OVERRIDE_COLUMNS.get(template_name)
    if not cols:
        return None
    return overrides.get(cols[2])


def _resolve_template(template_name: str, overrides: dict) -> tuple[str, str]:
    """
    Pick the (meta_name, language) actually sent to Meta.

    Priority: the property's saved override → the global TEMPLATES default →
    the literal name the caller passed (language defaults to en_US).
    """
    cols = _OVERRIDE_COLUMNS.get(template_name)
    if cols:
        name_col, lang_col, _ = cols
        name = overrides.get(name_col)
        lang = overrides.get(lang_col)
        if name:
            return name, lang or "en_US"
    cfg = TEMPLATES.get(template_name, {})
    return cfg.get("name", template_name), cfg.get("language", "en_US")


async def _get_property_whatsapp_credentials(property_id: UUID, db) -> dict | None:
    """
    WhatsApp creds + per-template overrides for a PROPERTY. Reads the current
    org schema's `properties` row, so the caller must have set the org
    search_path. Token resolution order:
      1. Secrets Manager (via `whatsapp_access_token_secret_arn`) — preferred
         in prod.
      2. Plaintext `whatsapp_access_token` column — fallback when SM isn't set
         up (dev, staging, small deploys). DB is encrypted at rest.
      3. Dev placeholder so local boxes can dry-run without a real token.
    Returns {phone_number_id, access_token, overrides: {…}} or None if the
    property isn't connected.
    """
    from sqlalchemy import text
    row = (
        await db.execute(
            text(
                "SELECT whatsapp_phone_number_id, whatsapp_access_token_secret_arn, "
                "       whatsapp_access_token, "
                "       wa_rent_reminder_template_name, wa_rent_reminder_template_language, "
                "       wa_rent_reminder_template_params, "
                "       wa_rent_overdue_template_name,  wa_rent_overdue_template_language, "
                "       wa_rent_overdue_template_params "
                "FROM properties WHERE id = :id"
            ),
            {"id": str(property_id)},
        )
    ).mappings().fetchone()
    if not row or not row["whatsapp_phone_number_id"]:
        return None

    token: str | None = None
    if row["whatsapp_access_token_secret_arn"]:
        try:
            import boto3
            client = boto3.client("secretsmanager", region_name=settings.AWS_REGION)
            secret = client.get_secret_value(
                SecretId=row["whatsapp_access_token_secret_arn"]
            )
            token = json.loads(secret["SecretString"])["access_token"]
        except Exception:
            # Fall through to plaintext / dev rather than failing the whole send.
            token = None
    if not token and row["whatsapp_access_token"]:
        token = row["whatsapp_access_token"]
    if not token:
        if settings.is_production:
            return None
        token = "DEV_WHATSAPP_TOKEN"

    return {
        "phone_number_id": row["whatsapp_phone_number_id"],
        "access_token": token,
        "overrides": {
            "wa_rent_reminder_template_name":     row["wa_rent_reminder_template_name"],
            "wa_rent_reminder_template_language": row["wa_rent_reminder_template_language"],
            "wa_rent_reminder_template_params":   row["wa_rent_reminder_template_params"],
            "wa_rent_overdue_template_name":      row["wa_rent_overdue_template_name"],
            "wa_rent_overdue_template_language":  row["wa_rent_overdue_template_language"],
            "wa_rent_overdue_template_params":    row["wa_rent_overdue_template_params"],
        },
    }


async def send_whatsapp_template(
    to_phone: str,
    template_name: str,
    template_params: list[str],
    property_id: UUID,
    db,
    context: dict[str, str] | None = None,
) -> dict:
    """
    Send a pre-approved WhatsApp template message from a property's number.

    Param resolution:
      1. If the property has saved a params config for this template
         (`wa_<name>_template_params`), substitute each `{kind, key|value}`
         entry from the `context` dict and ignore `template_params`.
      2. Otherwise fall back to `template_params` (the legacy hardcoded
         ordered list, kept for callers that haven't been updated yet).

    A zero-param payload omits the `components` array entirely — Meta
    rejects a `{"type":"body","parameters":[]}` body for templates that
    don't declare any placeholder (this is what trips `hello_world`).
    """
    creds = await _get_property_whatsapp_credentials(property_id, db)
    if not creds:
        return {"success": False, "error": "WhatsApp not configured for this org"}

    # Normalise phone number
    phone = to_phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = "+91" + phone

    overrides = creds.get("overrides", {})
    meta_name, lang_code = _resolve_template(template_name, overrides)

    # Resolve params: per-property config first, then the legacy ordered list.
    params_config = _params_config_for(template_name, overrides)
    final_params = _build_params(params_config, context or {}, template_params)

    template_block: dict = {
        "name": meta_name,
        "language": {"code": lang_code},
    }
    if final_params:
        template_block["components"] = [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": p} for p in final_params],
            }
        ]

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": template_block,
    }

    url = f"https://graph.facebook.com/v18.0/{creds['phone_number_id']}/messages"

    if settings.is_local:
        # In local dev, just log and return success
        print(f"[WA] {template_name} → {phone}: {final_params}")
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
        if response.status_code >= 400:
            # Surface Meta's actual error so callers (esp. the "Send test"
            # button) see why it failed — code 132 = template not approved,
            # 132001 = template/lang missing (often a WABA mismatch — Meta
            # puts the smoking-gun detail in error_data.details),
            # 131030 = recipient not in test list, etc.
            try:
                err = response.json().get("error", {})
                detail = (err.get("error_data") or {}).get("details")
                tail = (
                    detail
                    or err.get("error_user_msg")
                    or err.get("error_user_title")
                    or ""
                )
                reason = (
                    f"Meta {response.status_code} "
                    f"(code={err.get('code')}, subcode={err.get('error_subcode')}): "
                    f"{err.get('message')} — {tail}"
                ).strip(" —")
            except Exception:
                reason = f"Meta {response.status_code}: {response.text[:300]}"
            return {"success": False, "error": reason}
        data = response.json()
        message_id = data.get("messages", [{}])[0].get("id", "")
        return {"success": True, "message_id": message_id}
    except httpx.HTTPError as e:
        return {"success": False, "error": f"network error: {e}"}


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
    property_name: str = "",
    room_label: str = "",
) -> dict:
    # Templates print the ₹ literally (e.g. "…of ₹{{2}}"), so the param carries
    # the number only — otherwise residents see a double "₹₹9,000".
    amount_value = f"{amount_paise // 100:,}"
    amount_rupees = f"₹{amount_value}"  # ₹-prefixed form, for the internal log body
    context = {
        "tenant_name": tenant_name,
        "tenant_first_name": tenant_name.split(" ")[0] if tenant_name else "",
        "amount_rupees": amount_value,
        "month_name": month_name,
        "due_date": due_date,
        "upi_vpa": upi_id,
        "property_name": property_name,
        "room_label": room_label,
    }
    result = await send_whatsapp_template(
        to_phone=tenant_phone,
        template_name="rent_reminder",
        # Legacy ordered fallback for properties that haven't run the wizard yet.
        template_params=[tenant_name, amount_value, month_name, due_date, upi_id],
        property_id=property_id,
        db=db,
        context=context,
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
    return result


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
    days_overdue: int = 0,
    upi_vpa: str = "",
    property_name: str = "",
) -> dict:
    # Templates print the ₹ literally (e.g. "…of ₹{{2}}"), so the param carries
    # the number only — otherwise residents see a double "₹₹9,000".
    amount_value = f"{amount_paise // 100:,}"
    amount_rupees = f"₹{amount_value}"  # ₹-prefixed form, for the internal log body
    context = {
        "tenant_name": tenant_name,
        "tenant_first_name": tenant_name.split(" ")[0] if tenant_name else "",
        "amount_rupees": amount_value,
        "month_name": month_name,
        "days_overdue": str(days_overdue),
        "upi_vpa": upi_vpa,
        "property_name": property_name,
        "manager_phone": manager_phone,
    }
    result = await send_whatsapp_template(
        to_phone=tenant_phone,
        template_name="rent_overdue",
        template_params=[tenant_name, amount_value, month_name, manager_phone],
        property_id=property_id,
        db=db,
        context=context,
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
    return result
