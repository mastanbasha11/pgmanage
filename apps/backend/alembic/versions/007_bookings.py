"""Bookings table for daily stays + future bookings (no tenant required).

Revision ID: 007
Revises: 006
Create Date: 2026-05-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Enums live in public schema (alongside payment_mode_enum etc.)
    bind.execute(
        sa.text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_type t
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'booking_kind_enum' AND n.nspname = 'public'
                ) THEN
                    CREATE TYPE booking_kind_enum AS ENUM ('DAILY', 'ADVANCE');
                END IF;
            END $$;
        """)
    )

    schemas = bind.execute(
        sa.text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
        )
    ).scalars().all()

    for schema in schemas:
        bind.execute(
            sa.text(f"""
                CREATE TABLE IF NOT EXISTS "{schema}".bookings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    org_id UUID NOT NULL,
                    property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
                    guest_name TEXT NOT NULL,
                    guest_phone TEXT,
                    room_label TEXT NOT NULL,
                    kind booking_kind_enum NOT NULL,
                    amount_paise INTEGER NOT NULL,
                    check_in_date DATE NOT NULL,
                    check_out_date DATE,
                    payment_mode payment_mode_enum NOT NULL DEFAULT 'CASH',
                    reference_number TEXT,
                    collected_at DATE NOT NULL,
                    collected_by UUID,
                    notes TEXT,
                    is_deleted BOOLEAN NOT NULL DEFAULT false,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
        )
        bind.execute(
            sa.text(f"""
                CREATE INDEX IF NOT EXISTS ix_bookings_property_collected
                ON "{schema}".bookings (property_id, collected_at)
            """)
        )


def downgrade() -> None:
    bind = op.get_bind()
    schemas = bind.execute(
        sa.text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
        )
    ).scalars().all()
    for schema in schemas:
        bind.execute(sa.text(f'DROP TABLE IF EXISTS "{schema}".bookings'))
    bind.execute(sa.text("DROP TYPE IF EXISTS booking_kind_enum"))
