"""Expense paid_by + receipt_path.

Revision ID: 004
Revises: 003
Create Date: 2026-05-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "004"
down_revision = "003"
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
                ALTER TABLE "{schema}".expenses
                  ADD COLUMN IF NOT EXISTS paid_by VARCHAR(255) NULL,
                  ADD COLUMN IF NOT EXISTS receipt_path VARCHAR(500) NULL
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
                ALTER TABLE "{schema}".expenses
                  DROP COLUMN IF EXISTS paid_by,
                  DROP COLUMN IF EXISTS receipt_path
            """)
        )
