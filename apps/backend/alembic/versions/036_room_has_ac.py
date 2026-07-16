"""Add rooms.has_ac — AC is per-room, not per-room-type.

Previously the frontend inferred AC from the room type's NAME ("Double
Sharing AC" → 2-share + AC). That's wrong: a property can have both AC
and non-AC rooms of the same type. AC now lives on the individual room.

Adds `rooms.has_ac BOOLEAN NOT NULL DEFAULT false` to every org schema.
The room-type label loses the "AC" suffix in the UI; vacancy cards
render a small AC badge based on this column instead.

Revision ID: 036
Revises: 035
Create Date: 2026-07-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "036"
down_revision = "035"
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


def _has_table(bind, schema: str, tablename: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = :schema AND table_name = :tablename"
            ),
            {"schema": schema, "tablename": tablename},
        ).scalar()
    )


def upgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        if not _has_table(bind, schema, "rooms"):
            continue
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".rooms '
                f"ADD COLUMN IF NOT EXISTS has_ac BOOLEAN NOT NULL DEFAULT false"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        if not _has_table(bind, schema, "rooms"):
            continue
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".rooms DROP COLUMN IF EXISTS has_ac')
        )
