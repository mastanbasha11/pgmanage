"""Tenant ID-proof path (image or PDF stored on the uploads volume).

Revision ID: 009
Revises: 008
Create Date: 2026-05-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "009"
down_revision = "008"
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
                ALTER TABLE "{schema}".tenants
                  ADD COLUMN IF NOT EXISTS id_proof_path VARCHAR(500) NULL
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
            sa.text(f'ALTER TABLE "{schema}".tenants DROP COLUMN IF EXISTS id_proof_path')
        )
