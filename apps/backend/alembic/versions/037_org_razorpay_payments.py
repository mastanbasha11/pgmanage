"""Per-org Razorpay credentials for tenant online rent payments.

Tenants can pay rent / advance / deposit online. In the per-owner model each
PG owner connects THEIR OWN Razorpay account, so the money flows tenant→owner
directly and the platform never holds funds (no RBI aggregator licence needed).
That means the credentials live per-organisation.

`razorpay_key_id` already existed on public.organisations (unused). This adds
the secret + webhook-secret (both with a Secrets-Manager-ARN column preferred
over a plaintext fallback, mirroring the WhatsApp token pattern) and an enable
flag the owner flips once their account is live.

This touches ONLY public.organisations — no org-schema loop, no
provision_org_schema change. The org-scoped `payments` table is reused as-is:
online payments are stored with idempotency_key = 'rzp_<razorpay_payment_id>'
(that column is already UNIQUE), which makes the verify-callback and the
webhook idempotent against each other by construction.

Revision ID: 037
Revises: 036
Create Date: 2026-07-22
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


# (name, type) — all nullable / defaulted so the migration is safe on a live table.
_COLUMNS: list[tuple[str, str]] = [
    ("razorpay_key_secret", "VARCHAR(200)"),
    ("razorpay_key_secret_arn", "VARCHAR(500)"),
    ("razorpay_webhook_secret", "VARCHAR(200)"),
    ("razorpay_webhook_secret_arn", "VARCHAR(500)"),
    ("razorpay_payments_enabled", "BOOLEAN NOT NULL DEFAULT false"),
]


def upgrade() -> None:
    bind = op.get_bind()
    for name, coltype in _COLUMNS:
        bind.execute(
            sa.text(
                f"ALTER TABLE public.organisations "
                f"ADD COLUMN IF NOT EXISTS {name} {coltype}"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for name, _ in _COLUMNS:
        bind.execute(
            sa.text(f"ALTER TABLE public.organisations DROP COLUMN IF EXISTS {name}")
        )
