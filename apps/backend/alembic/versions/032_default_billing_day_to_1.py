"""Reset rent_plans.billing_day to 1 for every active rent plan.

Owner policy is now "rent for month M is due by the 1st of M". The
overdue chaser reads billing_day per-tenant to compute each ledger
row's due_date, so any tenant left on billing_day=15 would still be
chased mid-month instead of from the 1st. This normalises the whole
portfolio.

Only touches ACTIVE plans (`is_active = true`) — historical inactive
rows are left alone so they still document what was billed in the
past.

Revision ID: 032
Revises: 031
Create Date: 2026-07-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "032"
down_revision = "031"
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
                f'UPDATE "{schema}".rent_plans '
                "SET billing_day = 1, updated_at = NOW() "
                "WHERE is_active = true AND billing_day <> 1"
            )
        )


def downgrade() -> None:
    # Not reversible — we don't know what the prior per-tenant billing
    # days were once this migration runs. Left as a no-op on purpose.
    pass
