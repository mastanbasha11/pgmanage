"""
Razorpay gateway — per-organisation credentials, order creation, and the two
signature checks (payment callback + webhook).

Design notes:
  * PER-ORG credentials. Each PG owner connects their own Razorpay account
    (money flows tenant→owner, platform never holds funds). Creds live on
    public.organisations.
  * Secret resolution mirrors the WhatsApp token pattern in
    notification_service: Secrets-Manager ARN preferred, plaintext column
    fallback ("DB encrypted at rest"), dev placeholder last. Never log secrets.
  * We DON'T use the official `razorpay` SDK — it's synchronous (requests) and
    would block the event loop. Orders are created with httpx.AsyncClient; both
    signature checks are pure stdlib hmac. Zero new dependencies, trivially
    mockable in tests.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"
_HTTP_TIMEOUT = 15.0


@dataclass
class OrgRazorpayCreds:
    key_id: str
    key_secret: str
    webhook_secret: str | None
    enabled: bool


class PaymentsNotConfiguredError(Exception):
    """Raised when an org hasn't finished connecting Razorpay."""


def _resolve_secret(arn: str | None, plaintext: str | None, json_key: str) -> str | None:
    """SM ARN (preferred) → plaintext column (fallback). Never raises upward —
    a broken ARN falls through to plaintext rather than killing the request."""
    if arn:
        import contextlib

        with contextlib.suppress(Exception):
            import boto3

            client = boto3.client("secretsmanager", region_name=settings.AWS_REGION)
            secret = client.get_secret_value(SecretId=arn)
            return json.loads(secret["SecretString"])[json_key]
    return plaintext or None


async def get_org_creds(db: AsyncSession, org_id: UUID) -> OrgRazorpayCreds:
    """Load + resolve an org's Razorpay credentials. Raises PaymentsNotConfigured
    when the owner hasn't connected an account (or hasn't enabled payments)."""
    row = (
        await db.execute(
            text(
                "SELECT razorpay_key_id, razorpay_key_secret, razorpay_key_secret_arn, "
                "       razorpay_webhook_secret, razorpay_webhook_secret_arn, "
                "       razorpay_payments_enabled "
                "FROM public.organisations WHERE id = :id"
            ),
            {"id": str(org_id)},
        )
    ).mappings().fetchone()

    if not row or not row["razorpay_payments_enabled"]:
        raise PaymentsNotConfiguredError("Online payments are not enabled for this property")

    key_id = row["razorpay_key_id"]
    key_secret = _resolve_secret(
        row["razorpay_key_secret_arn"], row["razorpay_key_secret"], "key_secret"
    )
    if not key_id or not key_secret:
        raise PaymentsNotConfiguredError("Razorpay keys are missing for this property")

    webhook_secret = _resolve_secret(
        row["razorpay_webhook_secret_arn"], row["razorpay_webhook_secret"], "webhook_secret"
    )
    return OrgRazorpayCreds(
        key_id=key_id,
        key_secret=key_secret,
        webhook_secret=webhook_secret,
        enabled=True,
    )


async def create_order(
    creds: OrgRazorpayCreds,
    *,
    amount_paise: int,
    receipt: str,
    notes: dict[str, str],
) -> dict:
    """Create a Razorpay order. `amount_paise` is passed straight through —
    Razorpay's unit is already paise, which matches our money model exactly."""
    if amount_paise <= 0:
        raise ValueError("amount_paise must be positive")
    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt[:40],  # Razorpay caps receipt at 40 chars
        "notes": notes,
        "payment_capture": 1,  # auto-capture on success
    }
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.post(
            RAZORPAY_ORDERS_URL,
            json=payload,
            auth=(creds.key_id, creds.key_secret),
        )
    if resp.status_code >= 400:
        # Surface Razorpay's error description but never the credentials.
        import contextlib

        detail = "Razorpay order creation failed"
        with contextlib.suppress(Exception):
            detail = resp.json().get("error", {}).get("description", detail)
        raise RuntimeError(detail)
    return resp.json()


async def fetch_payment(creds: OrgRazorpayCreds, payment_id: str) -> dict:
    """GET the payment entity — authoritative amount / method / status /
    order_id. Never trust these from the client."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.get(
            f"https://api.razorpay.com/v1/payments/{payment_id}",
            auth=(creds.key_id, creds.key_secret),
        )
    if resp.status_code >= 400:
        raise RuntimeError("Could not fetch payment from Razorpay")
    return resp.json()


async def fetch_order(creds: OrgRazorpayCreds, order_id: str) -> dict:
    """GET the order entity — carries the `notes` we set at creation
    (purpose, for_month/for_year, tenant/property/org ids)."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.get(
            f"https://api.razorpay.com/v1/orders/{order_id}",
            auth=(creds.key_id, creds.key_secret),
        )
    if resp.status_code >= 400:
        raise RuntimeError("Could not fetch order from Razorpay")
    return resp.json()


def verify_payment_signature(
    *, order_id: str, payment_id: str, signature: str, key_secret: str
) -> bool:
    """Checkout callback signature: HMAC_SHA256(order_id|payment_id, key_secret)."""
    if not (order_id and payment_id and signature):
        return False
    expected = hmac.new(
        key_secret.encode(),
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(*, raw_body: bytes, signature: str, webhook_secret: str) -> bool:
    """Webhook signature: HMAC_SHA256(raw_request_body, webhook_secret).
    MUST be computed over the exact bytes received, not a re-serialised dict."""
    if not (signature and webhook_secret):
        return False
    expected = hmac.new(webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def method_to_payment_mode(razorpay_method: str | None) -> str:
    """Map Razorpay's `method` to our payment_mode_enum."""
    return {
        "upi": "UPI",
        "card": "CARD",
        "netbanking": "BANK_TRANSFER",
        "wallet": "BANK_TRANSFER",
        "emi": "CARD",
    }.get((razorpay_method or "").lower(), "UPI")
