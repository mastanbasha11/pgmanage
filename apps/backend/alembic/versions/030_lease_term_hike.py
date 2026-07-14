"""Lease term (months) + annual rent hike % on the ROI plan.

Indian PG leases typically run 3–5 years with a 5%/year rent hike
clause. To project profit over the full lease term we need both.

Revision ID: 030
Revises: 029
Create Date: 2026-07-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "030"
down_revision = "029"
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
        for col_ddl in (
            "roi_lease_term_months INTEGER",
            "roi_annual_rent_hike_pct NUMERIC(5,2)",
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
        for col in ("roi_lease_term_months", "roi_annual_rent_hike_pct"):
            bind.execute(sa.text(f'ALTER TABLE "{schema}".properties DROP COLUMN IF EXISTS {col}'))
