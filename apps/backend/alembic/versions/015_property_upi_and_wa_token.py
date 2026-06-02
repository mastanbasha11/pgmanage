"""Property-level UPI VPA + plain WhatsApp access token column.

- `upi_vpa`: the property's UPI handle (e.g. "loopliving@okhdfc"). Inserted into
  the {{5}} placeholder of the `rent_reminder` template so tenants can tap to
  pay. Why per-property: each PG often has its own bank/UPI handle.
- `whatsapp_access_token`: a fallback for environments without AWS Secrets
  Manager. Prod can keep using `whatsapp_access_token_secret_arn` (already
  added in 014) — the notification service tries the ARN first, then this
  column. Both live in the org schema; only the owner can set them via
  `PATCH /api/v1/properties/{id}/whatsapp`.

Revision ID: 015
Revises: 014
Create Date: 2026-06-01
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "015"
down_revision = "014"
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
                f'ALTER TABLE "{schema}".properties '
                "ADD COLUMN IF NOT EXISTS upi_vpa VARCHAR(100), "
                "ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".properties '
                "DROP COLUMN IF EXISTS upi_vpa, "
                "DROP COLUMN IF EXISTS whatsapp_access_token"
            )
        )
