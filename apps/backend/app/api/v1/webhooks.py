"""Webhooks: Meta Lead Ads, Stripe."""
from __future__ import annotations

import hashlib
import hmac
import json

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
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
