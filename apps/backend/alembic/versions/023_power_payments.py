"""Power-meter payments: nullable tenant_id + POWER enum value.

PG owners get money from tenants to recharge prepaid power meters.
That cash counts toward income but it's not tied to a specific tenant
billing cycle, so:
  - payments.tenant_id becomes nullable (was NOT NULL)
  - payment_type_enum gets a POWER value

Revision ID: 023
Revises: 022
Create Date: 2026-06-18
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "023"
down_revision = "022"
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
        bind.execute(sa.text(f'SET LOCAL search_path TO "{schema}", public'))
        # ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent.
        bind.execute(sa.text("ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'POWER'"))
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".payments ALTER COLUMN tenant_id DROP NOT NULL')
        )


def downgrade() -> None:
    # Postgres can't drop an enum value once added; restoring NOT NULL would
    # fail if any POWER rows have null tenant_id. Intentional no-op.
    pass
