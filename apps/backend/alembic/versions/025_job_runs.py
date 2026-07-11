"""Scheduler job-run log (public.job_runs).

Records one row per execution of the rent_reminders_monthly and
rent_overdue_daily background jobs — summary counts + a JSON `details`
blob with the per-org breakdown — so the Job Monitor screen and the
downloadable log file can show what each run did (even 0-send runs).

Public/cross-org table (the jobs iterate every org), so no per-org loop
and no provision_org_schema change.

Revision ID: 025
Revises: 024
Create Date: 2026-07-11
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_runs",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"), primary_key=True,
        ),
        sa.Column("job_name", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("orgs_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("messages_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("messages_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "ledger_entries_created", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        schema="public",
    )
    op.create_index(
        "ix_job_runs_name_started",
        "job_runs",
        ["job_name", "started_at"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_job_runs_name_started", table_name="job_runs", schema="public")
    op.drop_table("job_runs", schema="public")
