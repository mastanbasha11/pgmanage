"""Payment metadata: paid_to, per-payment discount, for_days; ledger discount_paise.

Revision ID: 003
Revises: 002
Create Date: 2026-05-06
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # All these columns live in *every* org schema. Iterate, since each org has
    # its own copy of the rent_ledger_entries / payments tables.
    bind = op.get_bind()
    schemas = bind.execute(
        sa.text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
        )
    ).scalars().all()

    for schema in schemas:
        # payments: paid_to, discount_paise, for_days
        bind.execute(
            sa.text(f"""
                ALTER TABLE "{schema}".payments
                  ADD COLUMN IF NOT EXISTS paid_to VARCHAR(255) NULL,
                  ADD COLUMN IF NOT EXISTS discount_paise INTEGER NOT NULL DEFAULT 0,
                  ADD COLUMN IF NOT EXISTS for_days INTEGER NULL
            """)
        )
        # rent_ledger_entries: discount_paise (cumulative discounts applied to the month)
        bind.execute(
            sa.text(f"""
                ALTER TABLE "{schema}".rent_ledger_entries
                  ADD COLUMN IF NOT EXISTS discount_paise INTEGER NOT NULL DEFAULT 0
            """)
        )

    # Ensure the schema-provisioning helper picks them up for *new* orgs too —
    # this is purely informational; provision_org_schema() is updated in code.


def downgrade() -> None:
    bind = op.get_bind()
    schemas = bind.execute(
        sa.text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
        )
    ).scalars().all()
    for schema in schemas:
        bind.execute(
            sa.text(f"""
                ALTER TABLE "{schema}".payments
                  DROP COLUMN IF EXISTS paid_to,
                  DROP COLUMN IF EXISTS discount_paise,
                  DROP COLUMN IF EXISTS for_days
            """)
        )
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".rent_ledger_entries DROP COLUMN IF EXISTS discount_paise')
        )
