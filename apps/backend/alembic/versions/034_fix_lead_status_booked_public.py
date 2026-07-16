"""Follow-up to 033: add BOOKED to public.lead_status_enum (real location).

Migration 033 tried to add BOOKED to a per-org `"{schema}".lead_status_enum`
that doesn't exist — the enum is actually created ONCE in `public` (by the
first org's `provision_org_schema` call, which runs `CREATE TYPE …`
unqualified while the search_path is `public`). Every org table that
declares `status lead_status_enum` resolves via search_path back to that
single `public` enum, so extending public covers all orgs at once.

033's `_has_type(schema, ...)` guard silently returned False for every
org schema and the ADD VALUE never fired. This migration corrects that
by targeting `public.lead_status_enum` directly. Safe + idempotent — the
`IF NOT EXISTS` clause makes it a no-op on any env where the value is
already present (e.g. prod after the manual hotfix).

Revision ID: 034
Revises: 033
Create Date: 2026-07-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The enum is public-scoped by construction (see provision_org_schema).
    # ADD VALUE inside a transaction is allowed since PG 12 provided the
    # new value isn't used later in the same transaction — this migration
    # only mutates the enum, so we're safe.
    op.execute(
        sa.text(
            "ALTER TYPE public.lead_status_enum "
            "ADD VALUE IF NOT EXISTS 'BOOKED' AFTER 'NEGOTIATING'"
        )
    )


def downgrade() -> None:
    # Postgres has no DROP VALUE for enum types. Leaving BOOKED in place
    # is harmless — no rows reference it once you downgrade the app.
    pass
