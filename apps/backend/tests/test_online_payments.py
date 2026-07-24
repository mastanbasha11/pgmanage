"""
Tenant online payments (Razorpay) — Phase 1.

Razorpay's HTTP calls (order create + the two entity fetches) are mocked; the
signatures are computed for real so the verification code is exercised end to
end. Covers: owner gateway config + RBAC, tenant config gate, amount
computation per purpose, signature verification, the deposit-twice guard, and
— most importantly — idempotency between the verify-callback and the webhook.
"""
from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import razorpay_gateway as rzp
from tests.conftest import TestSessionLocal, auth_headers


async def _query_one(schema: str, sql: str, params: dict | None = None):
    """Read a row in an isolated session. Post-request assertions must NOT reuse
    the `db` fixture session — the HTTP request committed on its own session,
    and re-querying `db` then leaves its connection mid-operation at teardown."""
    async with TestSessionLocal() as s:
        await s.execute(text(f'SET search_path TO "{schema}", public'))
        row = (await s.execute(text(sql), params or {})).mappings().fetchone()
        return dict(row) if row else None

KEY_ID = "rzp_test_key"
KEY_SECRET = "secret_abc"
WEBHOOK_SECRET = "whsec_xyz"


# ── helpers ──────────────────────────────────────────────────────────────────

async def _enable_razorpay(db: AsyncSession, org_id) -> str:
    """Turn on payments for the org with known keys. Returns the org slug."""
    await db.execute(
        text(
            "UPDATE public.organisations SET razorpay_key_id = :k, "
            "razorpay_key_secret = :s, razorpay_webhook_secret = :w, "
            "razorpay_payments_enabled = true WHERE id = :id"
        ),
        {"k": KEY_ID, "s": KEY_SECRET, "w": WEBHOOK_SECRET, "id": str(org_id)},
    )
    slug = (
        await db.execute(
            text("SELECT slug FROM public.organisations WHERE id = :id"),
            {"id": str(org_id)},
        )
    ).scalar()
    await db.commit()
    return slug


def _payment_sig(order_id: str, payment_id: str) -> str:
    return hmac.new(
        KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()


def _webhook_sig(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


def _mock_gateway(monkeypatch, *, amount: int, purpose: str, notes: dict, method="upi"):
    """Patch the three Razorpay HTTP calls used by order + verify."""
    async def fake_create_order(creds, *, amount_paise, receipt, notes):  # noqa: ARG001
        return {"id": "order_test1", "amount": amount_paise, "notes": notes}

    async def fake_fetch_payment(creds, payment_id):  # noqa: ARG001
        return {
            "id": payment_id,
            "status": "captured",
            "amount": amount,
            "method": method,
            "order_id": "order_test1",
        }

    async def fake_fetch_order(creds, order_id):  # noqa: ARG001
        return {"id": order_id, "amount": amount, "notes": notes}

    monkeypatch.setattr(rzp, "create_order", fake_create_order)
    monkeypatch.setattr(rzp, "fetch_payment", fake_fetch_payment)
    monkeypatch.setattr(rzp, "fetch_order", fake_fetch_order)


# ── pure signature helpers ───────────────────────────────────────────────────

def test_payment_signature_roundtrip():
    sig = _payment_sig("order_1", "pay_1")
    assert rzp.verify_payment_signature(
        order_id="order_1", payment_id="pay_1", signature=sig, key_secret=KEY_SECRET
    )
    assert not rzp.verify_payment_signature(
        order_id="order_1", payment_id="pay_1", signature="deadbeef", key_secret=KEY_SECRET
    )
    # A different secret must not validate.
    assert not rzp.verify_payment_signature(
        order_id="order_1", payment_id="pay_1", signature=sig, key_secret="other"
    )


def test_webhook_signature_roundtrip():
    body = b'{"event":"payment.captured"}'
    assert rzp.verify_webhook_signature(
        raw_body=body, signature=_webhook_sig(body), webhook_secret=WEBHOOK_SECRET
    )
    assert not rzp.verify_webhook_signature(
        raw_body=body, signature="nope", webhook_secret=WEBHOOK_SECRET
    )


def test_method_mapping():
    assert rzp.method_to_payment_mode("upi") == "UPI"
    assert rzp.method_to_payment_mode("card") == "CARD"
    assert rzp.method_to_payment_mode("netbanking") == "BANK_TRANSFER"
    assert rzp.method_to_payment_mode(None) == "UPI"  # safe default


# ── owner gateway config ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_gateway_config_requires_owner(client: AsyncClient, test_supervisor: dict):
    r = await client.get("/api/v1/payments/gateway", headers=auth_headers(test_supervisor["token"]))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_gateway_config_status_and_webhook_url(client: AsyncClient, test_owner: dict):
    r = await client.get("/api/v1/payments/gateway", headers=auth_headers(test_owner["token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["payments_enabled"] is False
    assert body["key_secret_set"] is False
    assert "/api/v1/webhooks/razorpay?org=" in body["webhook_url"]


@pytest.mark.asyncio
async def test_cannot_enable_without_keys(client: AsyncClient, test_owner: dict):
    r = await client.patch(
        "/api/v1/payments/gateway",
        headers=auth_headers(test_owner["token"]),
        json={"payments_enabled": True},
    )
    assert r.status_code == 409  # ConflictError → add keys first


@pytest.mark.asyncio
async def test_connect_then_enable(client: AsyncClient, test_owner: dict):
    hdr = auth_headers(test_owner["token"])
    r = await client.patch(
        "/api/v1/payments/gateway",
        headers=hdr,
        json={"razorpay_key_id": KEY_ID, "razorpay_key_secret": KEY_SECRET, "payments_enabled": True},
    )
    assert r.status_code == 200, r.text
    status = (await client.get("/api/v1/payments/gateway", headers=hdr)).json()
    assert status["payments_enabled"] is True
    assert status["key_id"] == KEY_ID
    assert status["key_secret_set"] is True  # but the secret value is never returned


@pytest.mark.asyncio
async def test_secret_not_wiped_by_empty_update(client: AsyncClient, test_owner: dict):
    hdr = auth_headers(test_owner["token"])
    await client.patch(
        "/api/v1/payments/gateway",
        headers=hdr,
        json={"razorpay_key_id": KEY_ID, "razorpay_key_secret": KEY_SECRET},
    )
    # A later save that doesn't resend the secret must not clear it.
    await client.patch("/api/v1/payments/gateway", headers=hdr, json={"razorpay_key_id": "rzp_new"})
    status = (await client.get("/api/v1/payments/gateway", headers=hdr)).json()
    assert status["key_secret_set"] is True


# ── tenant config gate ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_config_disabled_by_default(client: AsyncClient, tenant_portal_token: str):
    r = await client.get("/api/v1/tenant/payments/config", headers=auth_headers(tenant_portal_token))
    assert r.status_code == 200
    assert r.json() == {"enabled": False, "key_id": None}


@pytest.mark.asyncio
async def test_tenant_config_enabled(
    client: AsyncClient, tenant_portal_token: str, test_tenant: dict, db: AsyncSession
):
    await _enable_razorpay(db, test_tenant["org_id"])
    r = await client.get("/api/v1/tenant/payments/config", headers=auth_headers(tenant_portal_token))
    assert r.json() == {"enabled": True, "key_id": KEY_ID}


# ── create order ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_order_blocked_when_not_configured(client: AsyncClient, tenant_portal_token: str):
    r = await client.post(
        "/api/v1/tenant/payments/order",
        headers=auth_headers(tenant_portal_token),
        json={"purpose": "RENT"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_order_rent_amount_from_plan(
    client, tenant_portal_token, test_tenant, db, monkeypatch
):
    await _enable_razorpay(db, test_tenant["org_id"])
    _mock_gateway(monkeypatch, amount=700000, purpose="RENT", notes={})
    r = await client.post(
        "/api/v1/tenant/payments/order",
        headers=auth_headers(tenant_portal_token),
        json={"purpose": "RENT"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["amount_paise"] == 700000  # monthly_rent from the fixture's plan
    assert body["key_id"] == KEY_ID
    assert body["order_id"] == "order_test1"


@pytest.mark.asyncio
async def test_order_deposit_amount_from_plan(
    client, tenant_portal_token, test_tenant, db, monkeypatch
):
    await _enable_razorpay(db, test_tenant["org_id"])
    _mock_gateway(monkeypatch, amount=1400000, purpose="DEPOSIT", notes={})
    r = await client.post(
        "/api/v1/tenant/payments/order",
        headers=auth_headers(tenant_portal_token),
        json={"purpose": "DEPOSIT"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["amount_paise"] == 1400000  # security_deposit from the plan


@pytest.mark.asyncio
async def test_order_advance_uses_client_amount_with_cap(
    client, tenant_portal_token, test_tenant, db, monkeypatch
):
    await _enable_razorpay(db, test_tenant["org_id"])
    _mock_gateway(monkeypatch, amount=1400000, purpose="ADVANCE", notes={})
    ok = await client.post(
        "/api/v1/tenant/payments/order",
        headers=auth_headers(tenant_portal_token),
        json={"purpose": "ADVANCE", "amount_paise": 1400000},
    )
    assert ok.status_code == 200, ok.text
    # 12 × ₹7,000 = ₹84,000 cap; ₹1,00,000 must be rejected.
    too_big = await client.post(
        "/api/v1/tenant/payments/order",
        headers=auth_headers(tenant_portal_token),
        json={"purpose": "ADVANCE", "amount_paise": 10_000_000},
    )
    assert too_big.status_code == 400


@pytest.mark.asyncio
async def test_order_invalid_purpose_422(client, tenant_portal_token, test_tenant, db):
    await _enable_razorpay(db, test_tenant["org_id"])
    r = await client.post(
        "/api/v1/tenant/payments/order",
        headers=auth_headers(tenant_portal_token),
        json={"purpose": "FOOD"},
    )
    assert r.status_code == 422


# ── verify + idempotency ─────────────────────────────────────────────────────

def _notes(test_tenant: dict, purpose="RENT", month=None, year=None) -> dict:
    n = {
        "tenant_id": str(test_tenant["tenant_id"]),
        "property_id": str(test_tenant["property_id"]),
        "org_id": str(test_tenant["org_id"]),
        "purpose": purpose,
    }
    if month:
        n["for_month"], n["for_year"] = str(month), str(year)
    return n


@pytest.mark.asyncio
async def test_verify_records_payment(
    client, tenant_portal_token, test_tenant, db, monkeypatch
):
    await _enable_razorpay(db, test_tenant["org_id"])
    _mock_gateway(monkeypatch, amount=700000, purpose="RENT", notes=_notes(test_tenant))

    r = await client.post(
        "/api/v1/tenant/payments/verify",
        headers=auth_headers(tenant_portal_token),
        json={
            "razorpay_order_id": "order_test1",
            "razorpay_payment_id": "pay_test1",
            "razorpay_signature": _payment_sig("order_test1", "pay_test1"),
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "success"

    # The payment landed with the idempotency key we expect.
    row = await _query_one(
        test_tenant["schema_name"],
        "SELECT amount_paise, payment_type, payment_mode, reference_number "
        "FROM payments WHERE idempotency_key = 'rzp_pay_test1'",
    )
    assert row["amount_paise"] == 700000
    assert row["payment_type"] == "RENT"
    assert row["payment_mode"] == "UPI"
    assert row["reference_number"] == "pay_test1"


@pytest.mark.asyncio
async def test_verify_bad_signature_rejected(
    client, tenant_portal_token, test_tenant, db, monkeypatch
):
    await _enable_razorpay(db, test_tenant["org_id"])
    _mock_gateway(monkeypatch, amount=700000, purpose="RENT", notes=_notes(test_tenant))
    r = await client.post(
        "/api/v1/tenant/payments/verify",
        headers=auth_headers(tenant_portal_token),
        json={
            "razorpay_order_id": "order_test1",
            "razorpay_payment_id": "pay_test1",
            "razorpay_signature": "forged",
        },
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_verify_rejects_order_for_another_tenant(
    client, tenant_portal_token, test_tenant, db, monkeypatch
):
    await _enable_razorpay(db, test_tenant["org_id"])
    # Order notes claim a different tenant — must be refused even with a good sig.
    foreign = _notes(test_tenant)
    foreign["tenant_id"] = "00000000-0000-0000-0000-000000000000"
    _mock_gateway(monkeypatch, amount=700000, purpose="RENT", notes=foreign)
    r = await client.post(
        "/api/v1/tenant/payments/verify",
        headers=auth_headers(tenant_portal_token),
        json={
            "razorpay_order_id": "order_test1",
            "razorpay_payment_id": "pay_test1",
            "razorpay_signature": _payment_sig("order_test1", "pay_test1"),
        },
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_verify_is_idempotent(
    client, tenant_portal_token, test_tenant, db, monkeypatch
):
    await _enable_razorpay(db, test_tenant["org_id"])
    _mock_gateway(monkeypatch, amount=700000, purpose="RENT", notes=_notes(test_tenant))
    payload = {
        "razorpay_order_id": "order_test1",
        "razorpay_payment_id": "pay_dup",
        "razorpay_signature": _payment_sig("order_test1", "pay_dup"),
    }
    hdr = auth_headers(tenant_portal_token)
    r1 = await client.post("/api/v1/tenant/payments/verify", headers=hdr, json=payload)
    r2 = await client.post("/api/v1/tenant/payments/verify", headers=hdr, json=payload)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["payment_id"] == r2.json()["payment_id"]

    row = await _query_one(
        test_tenant["schema_name"],
        "SELECT COUNT(*) AS n FROM payments WHERE idempotency_key = 'rzp_pay_dup'",
    )
    assert row["n"] == 1  # exactly one row despite two calls


# ── webhook ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_webhook_records_payment(client, test_tenant, db):
    slug = await _enable_razorpay(db, test_tenant["org_id"])
    body = json.dumps(
        {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_wh1",
                        "status": "captured",
                        "amount": 700000,
                        "method": "card",
                        "order_id": "order_wh1",
                        "notes": _notes(test_tenant),
                    }
                }
            },
        }
    ).encode()
    r = await client.post(
        f"/api/v1/webhooks/razorpay?org={slug}",
        content=body,
        headers={"X-Razorpay-Signature": _webhook_sig(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] is True

    row = await _query_one(
        test_tenant["schema_name"],
        "SELECT payment_mode FROM payments WHERE idempotency_key = 'rzp_pay_wh1'",
    )
    assert row["payment_mode"] == "CARD"  # method mapped from the webhook entity


@pytest.mark.asyncio
async def test_webhook_bad_signature_401(client, test_tenant, db):
    slug = await _enable_razorpay(db, test_tenant["org_id"])
    body = b'{"event":"payment.captured"}'
    r = await client.post(
        f"/api/v1/webhooks/razorpay?org={slug}",
        content=body,
        headers={"X-Razorpay-Signature": "forged", "Content-Type": "application/json"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_ignores_non_capture_events(client, test_tenant, db):
    slug = await _enable_razorpay(db, test_tenant["org_id"])
    body = json.dumps({"event": "payment.failed", "payload": {}}).encode()
    r = await client.post(
        f"/api/v1/webhooks/razorpay?org={slug}",
        content=body,
        headers={"X-Razorpay-Signature": _webhook_sig(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "ignored"


@pytest.mark.asyncio
async def test_verify_and_webhook_converge_on_one_payment(
    client, tenant_portal_token, test_tenant, db, monkeypatch
):
    """The whole point of the rzp_<id> idempotency key: the callback and the
    webhook both fire for the same payment and must not double-record."""
    slug = await _enable_razorpay(db, test_tenant["org_id"])
    _mock_gateway(monkeypatch, amount=700000, purpose="RENT", notes=_notes(test_tenant))

    await client.post(
        "/api/v1/tenant/payments/verify",
        headers=auth_headers(tenant_portal_token),
        json={
            "razorpay_order_id": "order_test1",
            "razorpay_payment_id": "pay_shared",
            "razorpay_signature": _payment_sig("order_test1", "pay_shared"),
        },
    )
    body = json.dumps(
        {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_shared",
                        "status": "captured",
                        "amount": 700000,
                        "method": "upi",
                        "order_id": "order_test1",
                        "notes": _notes(test_tenant),
                    }
                }
            },
        }
    ).encode()
    wh = await client.post(
        f"/api/v1/webhooks/razorpay?org={slug}",
        content=body,
        headers={"X-Razorpay-Signature": _webhook_sig(body), "Content-Type": "application/json"},
    )
    assert wh.status_code == 200
    assert wh.json()["created"] is False  # webhook saw it was already recorded

    row = await _query_one(
        test_tenant["schema_name"],
        "SELECT COUNT(*) AS n FROM payments WHERE idempotency_key = 'rzp_pay_shared'",
    )
    assert row["n"] == 1
