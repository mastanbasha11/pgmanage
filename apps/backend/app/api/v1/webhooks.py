"""Webhooks: Meta Lead Ads, Stripe."""
from __future__ import annotations

import hashlib
import hmac
import json

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_schema

router = APIRouter(prefix="/webhooks")


@router.post("/meta-lead", summary="Meta Lead Ads webhook")
async def meta_lead_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
    org_slug: str | None = None,
):
    """
    Receives leads from Meta Lead Ads.
    Each org configures their own Meta webhook with their org_slug as a query param.
    """
    raw_body = await request.body()

    # Find org by slug (passed as query param by Meta webhook URL)
    if not org_slug:
        raise HTTPException(400, "org_slug is required")

    org_result = await db.execute(
        text("SELECT id, schema_name, meta_webhook_secret FROM public.organisations WHERE slug = :slug AND is_active = true"),
        {"slug": org_slug},
    )
    org = org_result.fetchone()
    if not org:
        raise HTTPException(404, "Organisation not found")

    org_id, schema_name, webhook_secret = org

    # Validate signature
    if webhook_secret and x_hub_signature_256:
        expected = "sha256=" + hmac.new(
            webhook_secret.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, x_hub_signature_256):
            raise HTTPException(401, "Invalid webhook signature")

    # Parse Meta Lead payload
    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    # Extract lead data from Meta webhook format
    leads_created = 0
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "leadgen":
                continue

            value = change.get("value", {})
            lead_name = value.get("field_data", [{}])[0].get("values", [""])[0] if value.get("field_data") else ""
            lead_phone = ""
            ad_name = value.get("ad_name", "")

            for field in value.get("field_data", []):
                if field.get("name") == "full_name":
                    lead_name = field.get("values", [""])[0]
                elif field.get("name") in ("phone_number", "phone"):
                    lead_phone = field.get("values", [""])[0]

            if not lead_name and not lead_phone:
                continue

            await set_schema(db, schema_name)

            # Get first property for this org (Meta doesn't know which property)
            prop_result = await db.execute(
                text("SELECT id FROM properties WHERE org_id = :org_id AND is_active = true ORDER BY created_at LIMIT 1"),
                {"org_id": org_id},
            )
            property_id = prop_result.scalar_one_or_none()
            if not property_id:
                continue

            await db.execute(
                text("""
                    INSERT INTO leads (org_id, property_id, name, phone, source, source_campaign_name, status)
                    VALUES (:org_id, :pid, :name, :phone, 'META_AD'::lead_source_enum, :campaign, 'NEW'::lead_status_enum)
                    ON CONFLICT DO NOTHING
                """),
                {
                    "org_id": org_id, "pid": str(property_id),
                    "name": lead_name or "Meta Lead",
                    "phone": lead_phone or "",
                    "campaign": ad_name,
                },
            )
            leads_created += 1

    await db.commit()
    return {"message": f"Processed {leads_created} leads"}


@router.post("/stripe", summary="Stripe webhook handler")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    stripe_signature: str | None = Header(None, alias="Stripe-Signature"),
):
    raw_body = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            raw_body, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid Stripe signature")
    except Exception:
        raise HTTPException(400, "Invalid webhook payload")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "invoice.paid":
        customer_id = data.get("customer")
        # Find org by stripe_customer_id and extend plan
        org_result = await db.execute(
            text("SELECT id FROM public.organisations WHERE stripe_customer_id = :customer_id"),
            {"customer_id": customer_id},
        )
        org_id = org_result.scalar_one_or_none()
        if org_id:
            from datetime import datetime, timedelta, timezone
            new_expiry = datetime.now(timezone.utc) + timedelta(days=32)
            await db.execute(
                text("UPDATE public.organisations SET plan_expires_at = :expiry WHERE id = :id"),
                {"expiry": new_expiry, "id": org_id},
            )
            await db.commit()

    elif event_type == "invoice.payment_failed":
        # TODO: Send warning email/WhatsApp to org owner
        pass

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        # Downgrade to Starter plan
        org_result = await db.execute(
            text("SELECT id FROM public.organisations WHERE stripe_customer_id = :cid"),
            {"customer_id": customer_id},
        )
        org_id = org_result.scalar_one_or_none()
        if org_id:
            starter_result = await db.execute(
                text("SELECT id FROM public.subscription_plans WHERE name = 'Starter' LIMIT 1")
            )
            starter_id = starter_result.scalar_one_or_none()
            if starter_id:
                await db.execute(
                    text("UPDATE public.organisations SET plan_id = :plan_id WHERE id = :id"),
                    {"plan_id": starter_id, "id": org_id},
                )
                await db.commit()

    return {"received": True}


# ── WhatsApp (Meta Cloud API) ──────────────────────────────────────────────────

# Intent keywords for routing inbound messages (lowercase substring match).
_COMPLAINT_KW = (
    "complaint", "issue", "problem", "broken", "not working", "leak", "water",
    "wifi", "internet", "dirty", "clean", "ac ", "fan", "repair", "maintenance",
)
_RENT_KW = ("rent", "pay", "payment", "due", "balance", "amount", "receipt")


def _classify_intent(text_body: str) -> str:
    """Crude keyword router: complaint / rent_query / general."""
    t = (text_body or "").lower()
    if any(k in t for k in _COMPLAINT_KW):
        return "complaint"
    if any(k in t for k in _RENT_KW):
        return "rent_query"
    return "general"


async def _handle_inbound_message(db, route, from_phone: str, text_body: str) -> None:
    """Match the sender to a tenant of this property, classify, and act."""
    digits = "".join(c for c in (from_phone or "") if c.isdigit())[-10:]
    tenant = None
    if digits:
        tenant = (
            await db.execute(
                text(
                    "SELECT id FROM tenants "
                    "WHERE right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = :d "
                    "AND property_id = :pid AND is_deleted = false LIMIT 1"
                ),
                {"d": digits, "pid": str(route["property_id"])},
            )
        ).mappings().fetchone()

    intent = _classify_intent(text_body)

    # A complaint from a known tenant opens a complaint ticket.
    if intent == "complaint" and tenant:
        await db.execute(
            text(
                """
                INSERT INTO complaints (tenant_id, property_id, org_id, category, description, status)
                VALUES (:tid, :pid, :org, 'OTHER'::complaint_category_enum, :desc,
                        'OPEN'::complaint_status_enum)
                """
            ),
            {
                "tid": str(tenant["id"]),
                "pid": str(route["property_id"]),
                "org": str(route["org_id"]),
                "desc": (f"[WhatsApp] {text_body}")[:1000],
            },
        )

    # Record the inbound message in notification_log (only when attributable to a tenant).
    if tenant:
        await db.execute(
            text(
                """
                INSERT INTO notification_log (
                    org_id, property_id, recipient_type, recipient_id,
                    channel, template_name, message_body, status, sent_at
                )
                VALUES (
                    :org, :pid, 'TENANT'::notif_recipient_type_enum, :tid,
                    'WHATSAPP'::notif_channel_enum, :tpl, :body,
                    'SENT'::notif_status_enum, NOW()
                )
                """
            ),
            {
                "org": str(route["org_id"]),
                "pid": str(route["property_id"]),
                "tid": str(tenant["id"]),
                "tpl": f"inbound:{intent}",
                "body": (text_body or "")[:2000],
            },
        )


@router.get("/whatsapp", summary="WhatsApp webhook verification (Meta subscribe)")
async def whatsapp_verify(request: Request):
    """Meta calls this once with hub.challenge to verify the webhook URL."""
    p = request.query_params
    if p.get("hub.mode") == "subscribe" and p.get("hub.verify_token") == settings.WHATSAPP_VERIFY_TOKEN:
        return PlainTextResponse(p.get("hub.challenge") or "")
    raise HTTPException(403, "Verification failed")


@router.post("/whatsapp", summary="WhatsApp inbound message webhook")
async def whatsapp_inbound(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
):
    """
    Inbound WhatsApp messages. Routes by phone_number_id (which property's number
    received it) via public.whatsapp_routing, then classifies intent and acts.
    """
    raw = await request.body()

    if settings.WHATSAPP_APP_SECRET:
        expected = "sha256=" + hmac.new(
            settings.WHATSAPP_APP_SECRET.encode(), raw, hashlib.sha256
        ).hexdigest()
        if not (x_hub_signature_256 and hmac.compare_digest(expected, x_hub_signature_256)):
            raise HTTPException(401, "Invalid webhook signature")

    try:
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload") from None

    processed = 0
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            messages = value.get("messages") or []
            if not messages:
                continue  # status callbacks etc. — ignore for now
            phone_number_id = (value.get("metadata") or {}).get("phone_number_id")
            if not phone_number_id:
                continue
            route = (
                await db.execute(
                    text(
                        "SELECT org_id, schema_name, property_id FROM public.whatsapp_routing "
                        "WHERE phone_number_id = :pid"
                    ),
                    {"pid": phone_number_id},
                )
            ).mappings().fetchone()
            if not route:
                continue  # unknown number — not one of ours
            await set_schema(db, route["schema_name"])
            for msg in messages:
                body = (msg.get("text") or {}).get("body", "")
                await _handle_inbound_message(db, route, msg.get("from", ""), body)
                processed += 1

    await db.commit()
    return {"received": True, "processed": processed}
