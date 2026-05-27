"""Add paid_to to bookings (who collected the cash on behalf of the org).

Revision ID: 008
Revises: 007
Create Date: 2026-05-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "008"
down_revision = "007"
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
                ALTER TABLE "{schema}".bookings
                  ADD COLUMN IF NOT EXISTS paid_to TEXT
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
            sa.text(f'ALTER TABLE "{schema}".bookings DROP COLUMN IF EXISTS paid_to')
        )
