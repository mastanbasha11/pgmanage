"""Vehicle details on the tenants table.

The PG owner needs to know which residents have vehicles + their plate
numbers (gate security verifies plate against the resident list). Two
fields, both nullable so they can be filled in either at check-in by
staff or via the resident-app KYC step.

  - vehicle_type  enum: NONE | TWO_WHEELER | FOUR_WHEELER
  - vehicle_registration  varchar(20)

The enum is global (lives in `public`) so the values are consistent
across every org schema. Existing tenants get vehicle_type='NONE' by
backfill — the column is NOT NULL so the resident-app onboarding can
treat 'NONE' as "user hasn't said yet" and prompt.

Touch points (see [[backend-org-schema-multitenancy]] convention):
  - provision_org_schema also adds these columns (new orgs).
  - This migration loops every existing org schema and ALTERs.

Revision ID: 020
Revises: 019
Create Date: 2026-06-13
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "020"
down_revision = "019"
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

    # Global enum. Existing pattern in app/models/schemas_migration.py.
    bind.execute(
        sa.text(
            "DO $$ BEGIN CREATE TYPE vehicle_type_enum AS ENUM "
            "('NONE','TWO_WHEELER','FOUR_WHEELER'); "
            "EXCEPTION WHEN duplicate_object THEN null; END $$"
        )
    )

    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'''
                ALTER TABLE "{schema}".tenants
                  ADD COLUMN IF NOT EXISTS vehicle_type vehicle_type_enum
                    NOT NULL DEFAULT 'NONE',
                  ADD COLUMN IF NOT EXISTS vehicle_registration VARCHAR(20)
                '''
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'''
                ALTER TABLE "{schema}".tenants
                  DROP COLUMN IF EXISTS vehicle_registration,
                  DROP COLUMN IF EXISTS vehicle_type
                '''
            )
        )
    # Keep the enum — dropping it would crash if any other table later
    # references it. Cheap to leave around.
