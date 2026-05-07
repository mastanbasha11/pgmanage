"""Fiscal month support: properties.settlement_day + billing_periods overrides.

Revision ID: 005
Revises: 004
Create Date: 2026-05-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    schemas = bind.execute(
        sa.text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
        )
    ).scalars().all()

    for schema in schemas:
        bind.execute(
            sa.text(f"""
                ALTER TABLE "{schema}".properties
                  ADD COLUMN IF NOT EXISTS settlement_day INTEGER NOT NULL DEFAULT 10
            """)
        )
        bind.execute(
            sa.text(f"""
                CREATE TABLE IF NOT EXISTS "{schema}".billing_periods (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
                    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
                    period_year INTEGER NOT NULL,
                    close_date DATE NOT NULL,
                    closed_at TIMESTAMPTZ,
                    closed_by UUID,
                    notes TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_billing_period_pmy UNIQUE (property_id, period_month, period_year)
                )
            """)
        )


def downgrade() -> None:
    bind = op.get_bind()
    schemas = bind.execute(
        sa.text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
        )
    ).scalars().all()
    for schema in schemas:
        bind.execute(sa.text(f'DROP TABLE IF EXISTS "{schema}".billing_periods CASCADE'))
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".properties DROP COLUMN IF EXISTS settlement_day')
        )
