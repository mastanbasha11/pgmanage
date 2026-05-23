"""Split rent_plans.advance into refundable + non-refundable.

The existing column `advance_paid_paise` becomes the refundable advance.
A new column `non_refundable_advance_paise` captures one-time joining /
non-refundable charges that the partner won't pay back at checkout.

Revision ID: 006
Revises: 005
Create Date: 2026-05-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "006"
down_revision = "005"
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
                ALTER TABLE "{schema}".rent_plans
                  ADD COLUMN IF NOT EXISTS non_refundable_advance_paise
                    INTEGER NOT NULL DEFAULT 0
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
        bind.execute(
            sa.text(f"""
                ALTER TABLE "{schema}".rent_plans
                  DROP COLUMN IF EXISTS non_refundable_advance_paise
            """)
        )
