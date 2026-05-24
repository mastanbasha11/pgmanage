"""
WhatsApp foundation tests:
- send_whatsapp_to_tenant abstraction logs a notification_log row (local mock send),
- inbound webhook GET verification (challenge echo / wrong token),
- inbound POST routes by phone_number_id and opens a complaint on a complaint intent.

Sends are mocked in local env (notification_service short-circuits when is_local),
so no real Meta call is made. WHATSAPP_APP_SECRET is unset in tests, so the inbound
signature check is skipped.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from tests.conftest import TestSessionLocal


# ── Outbound abstraction ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_whatsapp_to_tenant_logs(test_tenant):
    from app.services.notification_service import send_whatsapp_to_tenant

    schema = test_tenant["schema_name"]
    async with TestSessionLocal() as s:
        await s.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        # Connect the property's WhatsApp number so credentials resolve.
        await s.execute(
            text("UPDATE properties SET whatsapp_phone_number_id = 'PN_TEST' WHERE id = :p"),
            {"p": str(test_tenant["property_id"])},
        )
        res = await send_whatsapp_to_tenant(
            s, test_tenant["tenant_id"], "welcome_tenant", ["Test Tenant", "Test PG House"]
        )
        assert res["success"] is True  # local mock

        cnt = (
            await s.execute(
                text(
                    "SELECT COUNT(*) FROM notification_log "
                    "WHERE recipient_id = :t AND channel = 'WHATSAPP' AND template_name = 'welcome_tenant'"
                ),
                {"t": str(test_tenant["tenant_id"])},
            )
        ).scalar_one()
        assert cnt == 1
        await s.commit()


@pytest.mark.asyncio
async def test_send_whatsapp_unconfigured_property_no_send(test_tenant):
    from app.services.notification_service import send_whatsapp_to_tenant

    schema = test_tenant["schema_name"]
    async with TestSessionLocal() as s:
        await s.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        # Property has no whatsapp_phone_number_id -> not configured.
        res = await send_whatsapp_to_tenant(s, test_tenant["tenant_id"], "welcome_tenant", ["x"])
        assert res["success"] is False
        await s.commit()


# ── Inbound: webhook verification ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_whatsapp_verify_challenge(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_VERIFY_TOKEN", "verify-123")
    resp = await client.get(
        "/api/v1/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": "verify-123", "hub.challenge": "echo42"},
    )
    assert resp.status_code == 200
    assert resp.text == "echo42"


@pytest.mark.asyncio
async def test_whatsapp_verify_wrong_token(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_VERIFY_TOKEN", "verify-123")
    resp = await client.get(
        "/api/v1/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "x"},
    )
    assert resp.status_code == 403


# ── Inbound: routing + intent ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_inbound_complaint_opens_ticket(client: AsyncClient, test_tenant):
    phone_number_id = f"PN_{uuid.uuid4().hex[:12]}"
    async with TestSessionLocal() as s:
        await s.execute(
            text(
                "INSERT INTO public.whatsapp_routing (phone_number_id, org_id, schema_name, property_id) "
                "VALUES (:pid, :org, :schema, :prop)"
            ),
            {
                "pid": phone_number_id,
                "org": str(test_tenant["org_id"]),
                "schema": test_tenant["schema_name"],
                "prop": str(test_tenant["property_id"]),
            },
        )
        await s.commit()

    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "metadata": {"phone_number_id": phone_number_id},
                            "messages": [
                                {"from": "919876543299", "text": {"body": "the wifi is broken, please fix"}}
                            ],
                        }
                    }
                ]
            }
        ]
    }
    resp = await client.post("/api/v1/webhooks/whatsapp", json=payload)
    assert resp.status_code == 200, resp.text
    assert resp.json()["processed"] == 1

    async with TestSessionLocal() as s:
        await s.execute(text(f'SET LOCAL search_path TO "{test_tenant["schema_name"]}", public'))
        complaints = (
            await s.execute(
                text("SELECT COUNT(*) FROM complaints WHERE tenant_id = :t"),
                {"t": str(test_tenant["tenant_id"])},
            )
        ).scalar_one()
        inbound = (
            await s.execute(
                text(
                    "SELECT COUNT(*) FROM notification_log "
                    "WHERE recipient_id = :t AND template_name = 'inbound:complaint'"
                ),
                {"t": str(test_tenant["tenant_id"])},
            )
        ).scalar_one()
    assert complaints >= 1
    assert inbound >= 1


@pytest.mark.asyncio
async def test_inbound_unknown_number_ignored(client: AsyncClient):
    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "metadata": {"phone_number_id": "PN_does_not_exist"},
                            "messages": [{"from": "910000000000", "text": {"body": "hi"}}],
                        }
                    }
                ]
            }
        ]
    }
    resp = await client.post("/api/v1/webhooks/whatsapp", json=payload)
    assert resp.status_code == 200
    assert resp.json()["processed"] == 0
