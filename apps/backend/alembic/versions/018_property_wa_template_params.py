"""Per-property, per-template parameter mapping for WhatsApp messages.

Each Meta template has `{{1}}, {{2}}, …` placeholders; owners decide what value
goes where. The map is stored as a JSONB array on the property — one element
per placeholder, in placeholder order. Each element is either:

  {"kind": "variable", "key": "tenant_name"}
  {"kind": "static",   "value": "Loop Coliving"}

`kind="variable"` keys are resolved at send time from a fixed catalogue
(see notification_service.BUILT_IN_VARIABLES). NULL/empty array → fall back
to the historical hardcoded 5-param rent_reminder / 4-param rent_overdue
behaviour.

Revision ID: 018
Revises: 017
Create Date: 2026-06-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "018"
down_revision = "017"
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
                "ADD COLUMN IF NOT EXISTS wa_rent_reminder_template_params JSONB, "
                "ADD COLUMN IF NOT EXISTS wa_rent_overdue_template_params JSONB"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".properties '
                "DROP COLUMN IF EXISTS wa_rent_reminder_template_params, "
                "DROP COLUMN IF EXISTS wa_rent_overdue_template_params"
            )
        )
