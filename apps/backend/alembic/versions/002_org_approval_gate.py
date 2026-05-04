"""Add approval gate to organisations.

Revision ID: 002
Revises: 001
Create Date: 2026-05-04
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add columns for the signup approval flow.
    op.add_column(
        "organisations",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        schema="public",
    )
    op.add_column(
        "organisations",
        sa.Column("approved_by_email", sa.String(length=255), nullable=True),
        schema="public",
    )
    # Mark all existing organisations as already approved so we don't lock anyone out.
    op.execute(
        "UPDATE public.organisations SET approved_at = COALESCE(approved_at, created_at)"
    )


def downgrade() -> None:
    op.drop_column("organisations", "approved_by_email", schema="public")
    op.drop_column("organisations", "approved_at", schema="public")
