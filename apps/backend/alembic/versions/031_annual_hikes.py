"""Per-year rent hikes on the ROI plan.

Some leases negotiate different hike percentages per year (e.g. 5% for
years 1-2, 6% for year 3). `roi_annual_hikes` stores that ladder as a
JSON array of per-year hike percentages applied at each anniversary:
index 0 = hike from year 1 → year 2, index 1 = year 2 → year 3, and
so on. Length is typically (lease_years - 1). When NULL, we fall back
to the flat `roi_annual_rent_hike_pct` for backwards compatibility.

Revision ID: 031
Revises: 030
Create Date: 2026-07-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "031"
down_revision = "030"
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
                f"ADD COLUMN IF NOT EXISTS roi_annual_hikes JSONB"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".properties DROP COLUMN IF EXISTS roi_annual_hikes')
        )
