"""Add notification_log.media_s3_key + media_mime — inbound WhatsApp attachments.

Residents reply to rent reminders with a payment screenshot (an image), but the
webhook only captured `text.body`, so image replies showed up blank in the
Message Log. Inbound media is now fetched from the Graph API and stored in S3;
these two columns hold the object key + mime type so the log can render the
attachment (via a presigned URL).

Adds to every org schema's `notification_log`:
    media_s3_key TEXT
    media_mime   VARCHAR(100)

Revision ID: 038
Revises: 037
Create Date: 2026-09-06
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "038"
down_revision = "037"
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
        if not _has_table(bind, schema, "notification_log"):
            continue
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".notification_log '
                f"ADD COLUMN IF NOT EXISTS media_s3_key TEXT, "
                f"ADD COLUMN IF NOT EXISTS media_mime VARCHAR(100)"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        if not _has_table(bind, schema, "notification_log"):
            continue
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".notification_log '
                f"DROP COLUMN IF EXISTS media_s3_key, "
                f"DROP COLUMN IF EXISTS media_mime"
            )
        )
