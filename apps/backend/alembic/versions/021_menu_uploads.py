"""Per-property weekly menu uploads.

Owner uploads a single file per (property, week_start_date) — either a
PDF or an image. Resident app fetches and renders.

Design notes:
  - One row per upload (file). A NEW upload for the same week REPLACES
    the active one via the (property_id, week_start_date) unique
    constraint scoped to is_active = true (handled at the app layer:
    soft-deactivate the prior row before insert).
  - Files live in S3 at {org}/{property}/menu/{uuid}.{ext} via the
    existing s3_service.get_s3_key namespace.
  - week_start_date is the Monday of the covered week. App layer
    normalises whatever the owner picks.

Revision ID: 021
Revises: 020
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "021"
down_revision = "020"
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
                f'''
                CREATE TABLE IF NOT EXISTS "{schema}".menu_uploads (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    org_id          UUID NOT NULL,
                    property_id     UUID NOT NULL REFERENCES "{schema}".properties(id),
                    week_start_date DATE NOT NULL,
                    s3_key          TEXT NOT NULL,
                    content_type    VARCHAR(100) NOT NULL,
                    original_filename TEXT,
                    title           VARCHAR(200),
                    is_active       BOOLEAN NOT NULL DEFAULT true,
                    uploaded_by     UUID,
                    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                '''
            )
        )
        # Active menu uniqueness — one active row per (property, week).
        # A re-upload deactivates the prior row first, then inserts.
        bind.execute(
            sa.text(
                f'''
                CREATE UNIQUE INDEX IF NOT EXISTS menu_uploads_active_uk
                  ON "{schema}".menu_uploads(property_id, week_start_date)
                  WHERE is_active = true
                '''
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(sa.text(f'DROP TABLE IF EXISTS "{schema}".menu_uploads'))
