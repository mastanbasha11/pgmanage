"""
GET / PATCH / test-send for the per-property WhatsApp + UPI settings.

These endpoints are how an owner connects their property to Meta Cloud API
(`whatsapp_phone_number_id` + access token) and sets the UPI handle that ends
up in the rent_reminder template's {{5}} placeholder.

Token-resolution and Meta calls go through `send_whatsapp_template`; in local
tests `settings.is_local` short-circuits the HTTP call and returns a mock id,
so a "successful" test-send just proves wiring + RBAC, not template approval.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_whatsapp_settings_returns_empty_for_new_property(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    r = await client.get(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_owner["token"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["whatsapp_phone_number_id"] is None
    assert body["whatsapp_number"] is None
    assert body["upi_vpa"] is None
    assert body["has_access_token"] is False
    # Template overrides default to NULL (service falls back to TEMPLATES defaults).
    assert body["wa_rent_reminder_template_name"] is None
    assert body["wa_rent_reminder_template_language"] is None
    assert body["wa_rent_overdue_template_name"] is None
    assert body["wa_rent_overdue_template_language"] is None


@pytest.mark.asyncio
async def test_patch_template_overrides_round_trip(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    r = await client.patch(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_owner["token"]),
        json={
            "wa_rent_reminder_template_name": "rent_payment_harshi_upi",
            "wa_rent_reminder_template_language": "en",
            "wa_rent_overdue_template_name": "rent_overdue_harshi_upi",
            "wa_rent_overdue_template_language": "en",
        },
    )
    assert r.status_code == 200, r.text

    got = (await client.get(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_owner["token"]),
    )).json()
    assert got["wa_rent_reminder_template_name"] == "rent_payment_harshi_upi"
    assert got["wa_rent_reminder_template_language"] == "en"
    assert got["wa_rent_overdue_template_name"] == "rent_overdue_harshi_upi"
    assert got["wa_rent_overdue_template_language"] == "en"


@pytest.mark.asyncio
async def test_patch_whatsapp_settings_persists_and_routes(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    payload = {
        "whatsapp_phone_number_id": "111222333444555",
        "whatsapp_number": "+919999900001",
        "whatsapp_access_token": "EAAFakeTokenForTests",
        "upi_vpa": "loopliving@okhdfc",
    }
    r = await client.patch(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_owner["token"]),
        json=payload,
    )
    assert r.status_code == 200, r.text

    # GET should reflect the save (token presence only, not the value).
    r2 = await client.get(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_owner["token"]),
    )
    assert r2.status_code == 200
    got = r2.json()
    assert got["whatsapp_phone_number_id"] == "111222333444555"
    assert got["whatsapp_number"] == "+919999900001"
    assert got["upi_vpa"] == "loopliving@okhdfc"
    assert got["has_access_token"] is True


@pytest.mark.asyncio
async def test_patch_whatsapp_settings_rejects_supervisor(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    r = await client.patch(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_supervisor["token"]),
        json={"upi_vpa": "x@y"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_whatsapp_test_send_owner_ok_in_local(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    # Connect first so credentials resolve.
    await client.patch(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_owner["token"]),
        json={
            "whatsapp_phone_number_id": "111222333444555",
            "whatsapp_access_token": "EAAFakeTokenForTests",
        },
    )
    r = await client.post(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp/test-send",
        headers=auth_headers(test_owner["token"]),
        json={"to_phone": "+919999988888", "template_name": "rent_reminder"},
    )
    # `is_local` short-circuits the real Meta call and returns a mock id.
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body.get("message_id")


@pytest.mark.asyncio
async def test_whatsapp_test_send_fails_when_not_connected(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    # Property has no phone_number_id yet → service returns success=False.
    r = await client.post(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp/test-send",
        headers=auth_headers(test_owner["token"]),
        json={"to_phone": "+919999988888", "template_name": "rent_reminder"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False
    assert "not configured" in body.get("error", "").lower()


@pytest.mark.asyncio
async def test_whatsapp_test_send_rejects_supervisor(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    r = await client.post(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp/test-send",
        headers=auth_headers(test_supervisor["token"]),
        json={"to_phone": "+919999988888"},
    )
    assert r.status_code == 403
