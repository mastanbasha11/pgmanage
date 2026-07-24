"""
Records a successful online (Razorpay) payment into the org-scoped `payments`
table, updates the rent ledger for RENT, and writes the audit row.

Called from TWO places that can race each other:
  * the tenant's verify-callback (POST /tenant/payments/verify), and
  * the Razorpay webhook (POST /webhooks/razorpay) — the source of truth.

Exactly-once is guaranteed by the UNIQUE `idempotency_key`: both paths use
`rzp_<razorpay_payment_id>`, so whichever lands second no-ops. The caller MUST
have set the org-schema search_path before calling (get_current_tenant does
this for the tenant path; the webhook sets it after resolving the org).

No schema change to the org tables: the Razorpay payment id is stored in
`reference_number`, and "online" is conveyed via `paid_to` / `notes`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Only these purposes are payable online in v1.
ONLINE_PURPOSES = ("RENT", "ADVANCE", "DEPOSIT")


@dataclass
class OnlinePaymentInput:
    # The verify path passes UUIDs (from TenantContext); the webhook passes the
    # string ids out of the order notes. Both are str()-coerced on insert.
    org_id: UUID | str
    property_id: UUID | str
    tenant_id: UUID | str
    amount_paise: int
    purpose: str  # RENT | ADVANCE | DEPOSIT
    payment_mode: str  # UPI | CARD | BANK_TRANSFER
    razorpay_payment_id: str
    razorpay_order_id: str
    for_month: int | None = None
    for_year: int | None = None


@dataclass
class OnlinePaymentResult:
    payment_id: str
    created: bool  # False when this was a duplicate (idempotent no-op)


async def record_online_payment(
    db: AsyncSession, data: OnlinePaymentInput
) -> OnlinePaymentResult:
    if data.purpose not in ONLINE_PURPOSES:
        raise ValueError(f"purpose must be one of {ONLINE_PURPOSES}")
    if data.amount_paise <= 0:
        raise ValueError("amount_paise must be positive")

    idem = f"rzp_{data.razorpay_payment_id}"

    # Fast path: already recorded (webhook + callback race, or Razorpay retry).
    existing = (
        await db.execute(
            text("SELECT id FROM payments WHERE idempotency_key = :k"),
            {"k": idem},
        )
    ).scalar()
    if existing:
        return OnlinePaymentResult(payment_id=str(existing), created=False)

    notes = f"Online payment via Razorpay · order {data.razorpay_order_id}"
    inserted = (
        await db.execute(
            text("""
                INSERT INTO payments (
                    org_id, property_id, tenant_id, amount_paise,
                    payment_type, payment_mode, reference_number, paid_to,
                    for_month, for_year, collected_at, notes, idempotency_key
                ) VALUES (
                    :org_id, :pid, :tid, :amount,
                    CAST(:ptype AS payment_type_enum),
                    CAST(:pmode AS payment_mode_enum),
                    :ref, 'Online (Razorpay)',
                    :month, :year, NOW(), :notes, :idem
                )
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING id
            """),
            {
                "org_id": str(data.org_id),
                "pid": str(data.property_id),
                "tid": str(data.tenant_id),
                "amount": data.amount_paise,
                "ptype": data.purpose,
                "pmode": data.payment_mode,
                "ref": data.razorpay_payment_id,
                "month": data.for_month,
                "year": data.for_year,
                "notes": notes,
                "idem": idem,
            },
        )
    ).scalar()

    if inserted is None:
        # Lost the race between the SELECT above and the INSERT — the other
        # path (webhook/callback) inserted first. Read its id back.
        existing = (
            await db.execute(
                text("SELECT id FROM payments WHERE idempotency_key = :k"),
                {"k": idem},
            )
        ).scalar()
        return OnlinePaymentResult(payment_id=str(existing), created=False)

    payment_id = str(inserted)

    # Reflect a RENT payment in the ledger, same rule as the staff path.
    if data.purpose == "RENT" and data.for_month and data.for_year:
        ledger = (
            await db.execute(
                text("""
                    SELECT id, amount_due_paise, amount_paid_paise, discount_paise
                    FROM rent_ledger_entries
                    WHERE tenant_id = :tid AND month = :month AND year = :year
                """),
                {"tid": str(data.tenant_id), "month": data.for_month, "year": data.for_year},
            )
        ).mappings().fetchone()
        if ledger:
            new_paid = (ledger["amount_paid_paise"] or 0) + data.amount_paise
            covered = new_paid + (ledger["discount_paise"] or 0)
            due = ledger["amount_due_paise"] or 0
            status = "PAID" if covered >= due and due > 0 else "PARTIAL" if covered > 0 else "UNPAID"
            await db.execute(
                text("""
                    UPDATE rent_ledger_entries
                    SET amount_paid_paise = :paid,
                        status = CAST(:status AS rent_status_enum),
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {"paid": new_paid, "status": status, "id": str(ledger["id"])},
            )

    # Audit — actor is the tenant themselves.
    await db.execute(
        text("""
            INSERT INTO audit_log (
                org_id, property_id, actor_id, actor_role, action,
                table_name, record_id, new_values
            ) VALUES (
                :org_id, :pid, :actor, 'TENANT', 'INSERT'::audit_action_enum,
                'payments', :record_id, CAST(:vals AS jsonb)
            )
        """),
        {
            "org_id": str(data.org_id),
            "pid": str(data.property_id),
            "actor": str(data.tenant_id),
            "record_id": payment_id,
            "vals": json.dumps(
                {
                    "amount_paise": data.amount_paise,
                    "payment_type": data.purpose,
                    "payment_mode": data.payment_mode,
                    "source": "ONLINE",
                    "razorpay_payment_id": data.razorpay_payment_id,
                }
            ),
        },
    )

    return OnlinePaymentResult(payment_id=payment_id, created=True)
