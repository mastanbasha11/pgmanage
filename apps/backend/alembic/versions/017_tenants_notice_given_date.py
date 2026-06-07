"""Track when a tenant gave notice to vacate.

`tenants.expected_move_out_date` already records the planned vacate date, but
not when the tenant told us about it. This column closes that gap so the
owner can see how much notice was given (audit + retention metrics later)
and the UI can show a "Notice given on X · vacating Y" banner.

Revision ID: 017
Revises: 016
Create Date: 2026-06-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "017"
down_revision = "016"
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
                f'ALTER TABLE "{schema}".tenants '
                "ADD COLUMN IF NOT EXISTS notice_given_date DATE"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".tenants '
                "DROP COLUMN IF EXISTS notice_given_date"
            )
        )
