"""Add MARKETING role to user_role_enum.

Marketing reps focus on lead intake + tenant onboarding: they add and
work leads through the pipeline, do tenant check-ins, view vacant beds.
They do NOT see financial totals, settings, ROI, or the money-facing
dashboard widgets.

Enum is public-scoped (see the 034 postmortem — every org table's
`role user_role_enum` resolves via search_path back to public), so a
single ADD VALUE covers all orgs. Idempotent via IF NOT EXISTS.

Revision ID: 035
Revises: 034
Create Date: 2026-07-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "ALTER TYPE public.user_role_enum "
            "ADD VALUE IF NOT EXISTS 'MARKETING'"
        )
    )


def downgrade() -> None:
    # Postgres has no DROP VALUE for enum types. Leaving MARKETING in
    # place is harmless once the app stops assigning it to users.
    pass
