"""Tenant Inbox — unified feed of tenant-initiated events for the admin app.

Every tenant-initiated event (new complaint, notice to vacate, KYC
update, feedback submission, …) writes a row here. The admin webapp
shows it as a feed with Read / Unread filtering — see project memory
[[project-admin-tenant-inbox]].

For v1 we keep it simple: one table, one `read_at` field (org-scoped
not per-staff-user — multiple staff sharing one mailbox feel is fine
for small PGs). Future: a separate `inbox_reads` join table keyed by
user if multiple staff need independent read state.

Revision ID: 022
Revises: 021
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "022"
down_revision = "021"
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

    # Global enum for inbox event kinds.
    bind.execute(
        sa.text(
            "DO $$ BEGIN CREATE TYPE inbox_event_kind_enum AS ENUM "
            "('COMPLAINT_NEW','COMPLAINT_REOPENED','NOTICE_GIVEN',"
            "'KYC_UPDATED','FEEDBACK','OTHER'); "
            "EXCEPTION WHEN duplicate_object THEN null; END $$"
        )
    )

    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(
                f'''
                CREATE TABLE IF NOT EXISTS "{schema}".tenant_inbox_events (
                    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    org_id       UUID NOT NULL,
                    property_id  UUID,
                    tenant_id    UUID,
                    kind         inbox_event_kind_enum NOT NULL,
                    summary      VARCHAR(500) NOT NULL,
                    payload      JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    /* Deep-link target — e.g. /tenants/{{id}} or /complaints */
                    deep_link    VARCHAR(300),
                    read_at      TIMESTAMPTZ,
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                '''
            )
        )
        bind.execute(
            sa.text(
                f'CREATE INDEX IF NOT EXISTS tenant_inbox_events_unread_idx '
                f'ON "{schema}".tenant_inbox_events(created_at DESC) '
                f'WHERE read_at IS NULL'
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        bind.execute(
            sa.text(f'DROP TABLE IF EXISTS "{schema}".tenant_inbox_events')
        )
