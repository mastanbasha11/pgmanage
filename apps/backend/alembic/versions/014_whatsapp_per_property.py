"""Per-property WhatsApp (Meta Cloud API) wiring.

Each PROPERTY connects its own WhatsApp number (not per-org, not platform-wide):
- properties.whatsapp_phone_number_id / whatsapp_access_token_secret_arn /
  whatsapp_number  (org-scoped; token kept in Secrets Manager in prod).
- public.whatsapp_routing — maps an inbound message's phone_number_id to its
  org/schema/property. Needed because inbound webhooks only carry the
  phone_number_id, and properties live inside per-org schemas, so we need one
  public lookup to know which org/property a message belongs to.

Revision ID: 014
Revises: 013
Create Date: 2026-05-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "014"
down_revision = "013"
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

    # Public inbound-routing table: phone_number_id -> org/property.
    bind.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS public.whatsapp_routing (
                phone_number_id VARCHAR(100) PRIMARY KEY,
                org_id          UUID NOT NULL,
                schema_name     VARCHAR(100) NOT NULL,
                property_id     UUID NOT NULL,
                whatsapp_number VARCHAR(20),
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )

    # Per-property WhatsApp credentials on every org schema.
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".properties '
                "ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id VARCHAR(100), "
                "ADD COLUMN IF NOT EXISTS whatsapp_access_token_secret_arn VARCHAR(500), "
                "ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20)"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'ALTER TABLE "{schema}".properties '
                "DROP COLUMN IF EXISTS whatsapp_phone_number_id, "
                "DROP COLUMN IF EXISTS whatsapp_access_token_secret_arn, "
                "DROP COLUMN IF EXISTS whatsapp_number"
            )
        )
    bind.execute(sa.text("DROP TABLE IF EXISTS public.whatsapp_routing"))
