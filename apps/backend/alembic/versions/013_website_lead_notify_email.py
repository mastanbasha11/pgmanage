"""Per-org notification email for website leads.

`organisations.website_lead_notify_email` — where new-website-lead emails are
sent. Backfilled to the org's owner_email so existing orgs get notifications
without any setup; editable from Settings → Website Integration.

Revision ID: 013
Revises: 012
Create Date: 2026-05-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "ALTER TABLE public.organisations "
            "ADD COLUMN IF NOT EXISTS website_lead_notify_email VARCHAR(255)"
        )
    )
    # Default notifications to the owner's email so it works out of the box.
    bind.execute(
        sa.text(
            "UPDATE public.organisations "
            "SET website_lead_notify_email = owner_email "
            "WHERE website_lead_notify_email IS NULL"
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("ALTER TABLE public.organisations DROP COLUMN IF EXISTS website_lead_notify_email")
    )
