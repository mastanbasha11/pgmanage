"""ROI payback plan: property_team.capital_paise + properties.roi_* columns.

Adds the storage the ROI page's Payback Plan section needs:
  - Optional owner capital contribution (informational; share_pct is the
    authoritative split).
  - Per-property total investment, target payback horizon (months), grace
    period (months when the lessor rent is waived), monthly lessor rent
    after grace, plan start date.

The math (P_grace = (I + (T−G)·rent) / T ; P_regular = P_grace − rent)
is computed at request time — nothing stored derived.

Revision ID: 028
Revises: 027
Create Date: 2026-07-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "028"
down_revision = "027"
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
                f'ALTER TABLE "{schema}".property_team '
                f"ADD COLUMN IF NOT EXISTS capital_paise BIGINT "
                f"CHECK (capital_paise >= 0)"
            )
        )
        for col_ddl in (
            "roi_investment_paise BIGINT",
            "roi_target_months INTEGER",
            "roi_grace_months INTEGER",
            "roi_lessor_rent_paise BIGINT",
            "roi_plan_start_date DATE",
        ):
            bind.execute(
                sa.text(
                    f'ALTER TABLE "{schema}".properties '
                    f"ADD COLUMN IF NOT EXISTS {col_ddl}"
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        for col in (
            "roi_investment_paise",
            "roi_target_months",
            "roi_grace_months",
            "roi_lessor_rent_paise",
            "roi_plan_start_date",
        ):
            bind.execute(sa.text(f'ALTER TABLE "{schema}".properties DROP COLUMN IF EXISTS {col}'))
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".property_team DROP COLUMN IF EXISTS capital_paise')
        )
