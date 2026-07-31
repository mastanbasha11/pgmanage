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
async def test_template_variables_endpoint(client: AsyncClient, test_owner: dict):
    """The wizard's dropdown source: variable catalogue per template."""
    r = await client.get(
        "/api/v1/whatsapp/template-variables",
        headers=auth_headers(test_owner["token"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "rent_reminder" in body and "rent_overdue" in body
    keys = {v["key"] for v in body["rent_reminder"]["variables"]}
    # Spot-check a few well-known variables that the wizard relies on.
    assert {"tenant_name", "amount_rupees", "month_name", "upi_vpa"} <= keys


@pytest.mark.asyncio
async def test_patch_template_params_round_trip(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Wizard output: an ordered list of {kind, key|value} dicts per template."""
    pid = test_property["property_id"]
    payload = {
        "wa_rent_reminder_template_params": [
            {"kind": "variable", "key": "tenant_name"},
            {"kind": "static", "value": "your rent of"},
            {"kind": "variable", "key": "amount_rupees"},
            {"kind": "variable", "key": "due_date"},
        ],
        "wa_rent_overdue_template_params": [],
    }
    r = await client.patch(
        f"/api/v1/properties/{pid}/whatsapp",
        headers=auth_headers(test_owner["token"]),
        json=payload,
    )
    assert r.status_code == 200, r.text

    got = (await client.get(
        f"/api/v1/properties/{pid}/whatsapp",
        headers=auth_headers(test_owner["token"]),
    )).json()
    saved = got["wa_rent_reminder_template_params"]
    assert isinstance(saved, list) and len(saved) == 4
    assert saved[0] == {"kind": "variable", "key": "tenant_name"}
    assert saved[1] == {"kind": "static", "value": "your rent of"}
    # Empty list also persists (vs NULL → fall back to legacy).
    assert got["wa_rent_overdue_template_params"] == []


def test_build_params_substitution_helper():
    """Unit-test the resolver — no DB / API involved."""
    from app.services.notification_service import _build_params

    cfg = [
        {"kind": "variable", "key": "tenant_name"},
        {"kind": "static", "value": "owes"},
        {"kind": "variable", "key": "amount_rupees"},
        {"kind": "variable", "key": "missing_key"},
    ]
    out = _build_params(cfg, {"tenant_name": "Asha", "amount_rupees": "₹9,000"}, legacy=[])
    assert out == ["Asha", "owes", "₹9,000", ""]

    # NULL config → legacy fallback.
    assert _build_params(None, {}, legacy=["a", "b"]) == ["a", "b"]

    # Empty list → 0-param template (e.g. hello_world). Not a fallback.
    assert _build_params([], {}, legacy=["a", "b"]) == []


@pytest.mark.asyncio
async def test_patch_whatsapp_settings_persists_and_routes(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    # A Meta phone_number_id belongs to exactly one org (public.whatsapp_routing
    # is a shared table). Derive a per-org id so repeat test runs don't collide
    # with a prior run's leftover routing row — which the cross-org hijack guard
    # in the endpoint now (correctly) rejects with 409.
    pnid = str(test_owner["org_id"].int)[:15]
    payload = {
        "whatsapp_phone_number_id": pnid,
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
    assert got["whatsapp_phone_number_id"] == pnid
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
    # Connect first so credentials resolve. Per-org phone_number_id so repeat
    # runs don't trip the cross-org routing guard on a leftover row.
    await client.patch(
        f"/api/v1/properties/{test_property['property_id']}/whatsapp",
        headers=auth_headers(test_owner["token"]),
        json={
            "whatsapp_phone_number_id": str(test_owner["org_id"].int)[:15],
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


@pytest.mark.asyncio
async def test_patch_whatsapp_cannot_hijack_another_orgs_number(
    client: AsyncClient, test_owner: dict, test_property: dict, db
):
    """A phone_number_id already routed to another org must NOT be claimable.

    public.whatsapp_routing is shared across orgs; without the guard, an owner
    could point another org's Meta number at their own schema and receive that
    org's inbound WhatsApp webhooks. Expect a 409, and the routing row must be
    left untouched (still pointing at the other org)."""
    import uuid

    from sqlalchemy import text

    other_org = uuid.uuid4()
    other_schema = f"org_{str(other_org).replace('-', '_')}"
    pnid = str(uuid.uuid4().int)[:15]  # unique per run
    await db.execute(
        text("""
            INSERT INTO public.whatsapp_routing
                (phone_number_id, org_id, schema_name, property_id, whatsapp_number)
            VALUES (:pnid, :org, :schema, :pid, '+910000000000')
        """),
        {"pnid": pnid, "org": str(other_org), "schema": other_schema,
         "pid": str(uuid.uuid4())},
    )
    await db.commit()
    try:
        r = await client.patch(
            f"/api/v1/properties/{test_property['property_id']}/whatsapp",
            headers=auth_headers(test_owner["token"]),
            json={"whatsapp_phone_number_id": pnid,
                  "whatsapp_access_token": "EAAFakeTokenForTests"},
        )
        assert r.status_code == 409, r.text

        # The other org's routing must be intact — not repointed to us.
        still = (
            await db.execute(
                text("SELECT org_id FROM public.whatsapp_routing "
                     "WHERE phone_number_id = :p"),
                {"p": pnid},
            )
        ).scalar()
        assert str(still) == str(other_org)
    finally:
        await db.execute(
            text("DELETE FROM public.whatsapp_routing WHERE phone_number_id = :p"),
            {"p": pnid},
        )
        await db.commit()
