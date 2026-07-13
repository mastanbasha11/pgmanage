"""Per-month actual profit override for the ROI payback tracker.

Lets an owner backfill "profit received this month" for months that
predate their PGManage onboarding (or override the computed
payments-minus-expenses net income when their bookkeeping differs).

Revision ID: 029
Revises: 028
Create Date: 2026-07-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "029"
down_revision = "028"
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
                f'CREATE TABLE IF NOT EXISTS "{schema}".payback_monthly_actual ('
                f'id UUID PRIMARY KEY DEFAULT gen_random_uuid(), '
                f'property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE, '
                f'period_year INTEGER NOT NULL, '
                f'period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12), '
                f'actual_profit_paise BIGINT NOT NULL, '
                f'notes TEXT, '
                f'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), '
                f'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), '
                f'CONSTRAINT uq_payback_actual_pmy UNIQUE (property_id, period_year, period_month)'
                f')'
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(sa.text(f'DROP TABLE IF EXISTS "{schema}".payback_monthly_actual'))
