"""Per-property team roster.

Owners get % shares (used for profit split); managers + collectors
populate the Paid To / Paid By dropdowns. Kept separate from `users`
(login staff) because collectors like Shammi / Harshi / Pandu don't
need logins.

Revision ID: 027
Revises: 026
Create Date: 2026-07-11
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "027"
down_revision = "026"
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
                "DO $$ BEGIN CREATE TYPE team_role_enum AS ENUM "
                "('OWNER','MANAGER','COLLECTOR'); "
                "EXCEPTION WHEN duplicate_object THEN null; END $$"
            )
        )
        bind.execute(
            sa.text(
                f'CREATE TABLE IF NOT EXISTS "{schema}".property_team ('
                f"id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
                f'property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE, '
                f"name VARCHAR(200) NOT NULL, "
                f"phone VARCHAR(20), "
                f"role team_role_enum NOT NULL, "
                f"share_pct NUMERIC(5,2) CHECK (share_pct >= 0 AND share_pct <= 100), "
                f"sort_order INTEGER NOT NULL DEFAULT 0, "
                f"is_active BOOLEAN NOT NULL DEFAULT true, "
                f"notes TEXT, "
                f"created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
                f"updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
                f")"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(sa.text(f'DROP TABLE IF EXISTS "{schema}".property_team'))
