"""Backfill rent_plans.updated_at (and non_refundable_advance_paise) on org schemas.

`provision_org_schema` was missing rent_plans.updated_at, so deposit/advance
edits — which run `SET updated_at = NOW()` — fail for provisioned orgs. This
adds the column to every existing org schema (idempotent). non_refundable_advance_paise
is included with IF NOT EXISTS as a safety net for any org that predates migration 006.

Revision ID: 011
Revises: 010
Create Date: 2026-05-23
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "011"
down_revision = "010"
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
                f'ALTER TABLE "{schema}".rent_plans '
                "ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            )
        )
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".rent_plans '
                "ADD COLUMN IF NOT EXISTS non_refundable_advance_paise INTEGER NOT NULL DEFAULT 0"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".rent_plans DROP COLUMN IF EXISTS updated_at')
        )
