"""Opening balance per fiscal period.

After closing the monthly ledger, owners typically keep some cash on
hand to cover next month's expenses before profit-sharing. That
carried-forward amount is the next period's "opening balance" and
counts as income alongside rent / advance / daily-stays / power.

Stores it on the existing `billing_periods` row so it lives next to
the per-month settlement_day override.

Revision ID: 024
Revises: 023
Create Date: 2026-06-18
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "024"
down_revision = "023"
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
                f'ALTER TABLE "{schema}".billing_periods '
                f'ADD COLUMN IF NOT EXISTS opening_balance_paise BIGINT '
                f'NOT NULL DEFAULT 0'
            )
        )
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".billing_periods ALTER COLUMN close_date DROP NOT NULL')
        )


def downgrade() -> None:
    # Keep nullable + the column; restoring NOT NULL would fail on rows
    # the user filled in only for opening_balance. Intentional no-op.
    pass
