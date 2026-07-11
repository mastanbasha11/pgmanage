"""Richer WhatsApp/notification log: recipient phone, rendered message, delivery.

Adds, per org schema:
  notification_log.recipient_phone   — the number we actually sent to
  notification_log.rendered_message  — the final message text (params filled in)
  notification_log.delivery_status   — Meta status callback (sent/delivered/read/failed)
  notification_log.delivered_at      — when Meta reported delivery
  properties.wa_rent_reminder_template_body / wa_rent_overdue_template_body
      — the approved template body, so the app can render the final message.

Org-scoped tables, so this also has a matching update in provision_org_schema
for newly-created orgs.

Revision ID: 026
Revises: 025
Create Date: 2026-07-11
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def _org_schemas(bind) -> list[str]:
    return (
        bind.execute(
            sa.text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
            )
        )
        .scalars()
        .all()
    )


_NLOG_COLS = [
    "recipient_phone VARCHAR(20)",
    "rendered_message TEXT",
    "delivery_status VARCHAR(20)",
    "delivered_at TIMESTAMPTZ",
]
_PROP_COLS = [
    "wa_rent_reminder_template_body TEXT",
    "wa_rent_overdue_template_body TEXT",
]


def upgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        for col in _NLOG_COLS:
            bind.execute(
                sa.text(f'ALTER TABLE "{schema}".notification_log ADD COLUMN IF NOT EXISTS {col}')
            )
        for col in _PROP_COLS:
            bind.execute(
                sa.text(f'ALTER TABLE "{schema}".properties ADD COLUMN IF NOT EXISTS {col}')
            )


def downgrade() -> None:
    # Additive columns; dropping them would lose delivery history. No-op.
    pass
