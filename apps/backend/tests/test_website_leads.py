"""
Public website-lead intake tests (POST /api/v1/leads/website) + the authed
integration endpoint.

The org's website_lead_token is set per-test (unique) so each test's hourly
rate-limit bucket (keyed by token+IP) is isolated. Token setup uses a
short-lived session (not the `db` fixture) to avoid cross-event-loop teardown
issues when interleaving DB writes with HTTP client calls.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import TestSessionLocal, auth_headers


async def _set_token(org_id, token: str) -> None:
    async with TestSessionLocal() as s:
        await s.execute(
            text("UPDATE public.organisations SET website_lead_token = :t WHERE id = :id"),
            {"t": token, "id": str(org_id)},
        )
        await s.commit()


def _payload(**over) -> dict:
    base = {
        "name": "Tamman Patnaik",
        "email": "tammanpatnaik890@gmail.com",
        "phone": "+919937303032",
        "roomType": "gold",
        "moveInDate": "2026-05-23",
        "message": "I want a good PG with good food and facilities",
    }
    base.update(over)
    return base


# ── Positive ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_website_lead_success(client: AsyncClient, test_property, test_owner):
    token = f"tok_{uuid.uuid4().hex}"
    await _set_token(test_property["org_id"], token)

    resp = await client.post(f"/api/v1/leads/website?token={token}", json=_payload())
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert data["leadId"]

    # The lead shows up in the org's Leads list as a WEBSITE lead, with email.
    listing = await client.get("/api/v1/leads", headers=auth_headers(test_owner["token"]))
    assert listing.status_code == 200
    web = [lead for lead in listing.json()["items"] if lead["source"] == "WEBSITE"]
    assert any(lead["name"] == "Tamman Patnaik" and lead["status"] == "NEW" for lead in web)


# ── Validation ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_website_lead_missing_required_fields(client: AsyncClient, test_property):
    token = f"tok_{uuid.uuid4().hex}"
    await _set_token(test_property["org_id"], token)
    resp = await client.post(f"/api/v1/leads/website?token={token}", json={"name": "X"})
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_website_lead_invalid_email(client: AsyncClient, test_property):
    token = f"tok_{uuid.uuid4().hex}"
    await _set_token(test_property["org_id"], token)
    resp = await client.post(
        f"/api/v1/leads/website?token={token}", json=_payload(email="not-an-email")
    )
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_website_lead_invalid_move_in_date(client: AsyncClient, test_property):
    token = f"tok_{uuid.uuid4().hex}"
    await _set_token(test_property["org_id"], token)
    resp = await client.post(
        f"/api/v1/leads/website?token={token}", json=_payload(moveInDate="not-a-date")
    )
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_website_lead_invalid_phone(client: AsyncClient, test_property):
    token = f"tok_{uuid.uuid4().hex}"
    await _set_token(test_property["org_id"], token)
    resp = await client.post(
        f"/api/v1/leads/website?token={token}", json=_payload(phone="abc")
    )
    assert resp.status_code in (400, 422)


# ── Token routing ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_website_lead_unknown_token(client: AsyncClient):
    resp = await client.post("/api/v1/leads/website?token=does-not-exist", json=_payload())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_website_lead_missing_token(client: AsyncClient):
    resp = await client.post("/api/v1/leads/website", json=_payload())
    assert resp.status_code == 404


# ── Rate limiting (10 / IP / hour, keyed by token) ──────────────────────────

@pytest.mark.asyncio
async def test_website_lead_rate_limited(client: AsyncClient, test_property):
    token = f"tok_{uuid.uuid4().hex}"
    await _set_token(test_property["org_id"], token)

    statuses = []
    for _ in range(11):
        r = await client.post(f"/api/v1/leads/website?token={token}", json=_payload())
        statuses.append(r.status_code)

    assert statuses[:10] == [200] * 10, statuses
    assert statuses[10] == 429


# ── Authed integration endpoint ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_integration_endpoint_returns_token_and_snippet(client: AsyncClient, test_owner):
    token = f"tok_{uuid.uuid4().hex}"
    await _set_token(test_owner["org_id"], token)

    resp = await client.get(
        "/api/v1/website/integration", headers=auth_headers(test_owner["token"])
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["token"] == token
    assert token in data["webhook_url"]
    assert "fetch(" in data["snippet"]
    assert data["rate_limit_per_hour"] == 10


@pytest.mark.asyncio
async def test_integration_endpoint_forbidden_for_supervisor(client: AsyncClient, test_supervisor):
    resp = await client.get(
        "/api/v1/website/integration", headers=auth_headers(test_supervisor["token"])
    )
    assert resp.status_code == 403
