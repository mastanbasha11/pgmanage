"""Per-property WhatsApp template overrides.

Owners create templates in Meta with whatever names + languages they like
("rent_payment_harshi_upi" / "en", "rent_reminder_v2" / "en_US", etc.). Our
code's logical names are "rent_reminder" and "rent_overdue"; without
overrides those literal names would have to match what Meta has approved.

This migration adds four optional columns per property:
  - wa_rent_reminder_template_name
  - wa_rent_reminder_template_language
  - wa_rent_overdue_template_name
  - wa_rent_overdue_template_language

NULL on all four → service falls back to the hardcoded defaults in
notification_service.TEMPLATES. Owner sets them from
Settings → WhatsApp.

Revision ID: 016
Revises: 015
Create Date: 2026-06-05
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "016"
down_revision = "015"
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


def upgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".properties '
                "ADD COLUMN IF NOT EXISTS wa_rent_reminder_template_name VARCHAR(200), "
                "ADD COLUMN IF NOT EXISTS wa_rent_reminder_template_language VARCHAR(20), "
                "ADD COLUMN IF NOT EXISTS wa_rent_overdue_template_name VARCHAR(200), "
                "ADD COLUMN IF NOT EXISTS wa_rent_overdue_template_language VARCHAR(20)"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".properties '
                "DROP COLUMN IF EXISTS wa_rent_reminder_template_name, "
                "DROP COLUMN IF EXISTS wa_rent_reminder_template_language, "
                "DROP COLUMN IF EXISTS wa_rent_overdue_template_name, "
                "DROP COLUMN IF EXISTS wa_rent_overdue_template_language"
            )
        )
