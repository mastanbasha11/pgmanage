"""
Public account-deletion request tests (POST /api/v1/account/deletion-request).

The endpoint is unauthenticated (a removed resident must still be able to ask),
records intent by emailing support, and validates its payload. SMTP is
unconfigured in tests so the background email is a no-op; we assert the contract.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

URL = "/api/v1/account/deletion-request"


def _payload(**over) -> dict:
    base = {
        "name": "Rahul Verma",
        "email": "rahul.verma.demo@example.com",
        "phone": "+919812345678",
        "role": "resident",
        "reason": "No longer staying at this PG.",
    }
    base.update(over)
    return base


@pytest.mark.asyncio
async def test_deletion_request_success(client: AsyncClient):
    resp = await client.post(URL, json=_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert "30 days" in body["message"]


@pytest.mark.asyncio
async def test_deletion_request_owner_role(client: AsyncClient):
    resp = await client.post(URL, json=_payload(role="owner", phone=None, reason=None))
    assert resp.status_code == 200, resp.text
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_deletion_request_rejects_bad_email(client: AsyncClient):
    resp = await client.post(URL, json=_payload(email="not-an-email"))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_deletion_request_rejects_short_name(client: AsyncClient):
    resp = await client.post(URL, json=_payload(name="X"))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_deletion_request_rejects_unknown_role(client: AsyncClient):
    resp = await client.post(URL, json=_payload(role="superadmin"))
    assert resp.status_code == 422
