"""Activity-log (unified audit feed) table for every existing org schema.

Adds the org-scoped `activity_log` table + indexes. New orgs get it via
`provision_org_schema`; this migration backfills all existing org schemas.
This is the high-level semantic feed and is independent of the existing
`audit_log` (row-diff) table, which is left untouched.

Revision ID: 010
Revises: 009
Create Date: 2026-05-22
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "010"
down_revision = "009"
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
                f"""
                CREATE TABLE IF NOT EXISTS "{schema}".activity_log (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    actor_user_id   UUID,
                    actor_role      VARCHAR(20),
                    actor_name      VARCHAR(200),
                    actor_ip        VARCHAR(45),
                    event_type      VARCHAR(80) NOT NULL,
                    event_category  VARCHAR(40) NOT NULL,
                    description     TEXT NOT NULL,
                    entity_type     VARCHAR(40),
                    entity_id       UUID,
                    entity_name     VARCHAR(200),
                    property_id     UUID,
                    property_name   VARCHAR(200),
                    tenant_id       UUID,
                    metadata        JSONB DEFAULT '{{}}'
                )
                """
            )
        )
        for col in ("actor_user_id", "tenant_id", "event_type", "event_category"):
            bind.execute(
                sa.text(
                    f'CREATE INDEX IF NOT EXISTS idx_activity_log_{col} '
                    f'ON "{schema}".activity_log({col}, created_at DESC)'
                )
            )
        bind.execute(
            sa.text(
                f'CREATE INDEX IF NOT EXISTS idx_activity_log_created_at '
                f'ON "{schema}".activity_log(created_at DESC)'
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(sa.text(f'DROP TABLE IF EXISTS "{schema}".activity_log'))
