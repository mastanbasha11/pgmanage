"""Website lead intake: organisations.website_lead_token + WEBSITE lead source.

Adds a per-org public site key (website_lead_token) on public.organisations so a
PG owner's website booking form can POST leads to the right account, and adds a
'WEBSITE' value to the shared lead_source_enum.

The token is a PUBLIC routing key (it lives in the owner's website JS), not a
secret — spam protection is rate-limiting + validation at the endpoint.

Revision ID: 012
Revises: 011
Create Date: 2026-05-23
"""
from __future__ import annotations

import secrets

from alembic import op
import sqlalchemy as sa


revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Public site key on organisations (cross-org public table).
    bind.execute(
        sa.text(
            "ALTER TABLE public.organisations "
            "ADD COLUMN IF NOT EXISTS website_lead_token VARCHAR(64)"
        )
    )
    # Optional comma-separated CORS allowlist of the owner's website origin(s).
    # NULL = not configured (permissive); the token is still required.
    bind.execute(
        sa.text(
            "ALTER TABLE public.organisations "
            "ADD COLUMN IF NOT EXISTS website_allowed_origins TEXT"
        )
    )
    # Backfill a unique token for every existing org.
    org_ids = (
        bind.execute(
            sa.text("SELECT id FROM public.organisations WHERE website_lead_token IS NULL")
        )
        .scalars()
        .all()
    )
    for org_id in org_ids:
        bind.execute(
            sa.text(
                "UPDATE public.organisations SET website_lead_token = :t WHERE id = :id"
            ),
            {"t": secrets.token_urlsafe(24), "id": org_id},
        )
    bind.execute(
        sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_org_website_lead_token "
            "ON public.organisations(website_lead_token)"
        )
    )

    # 2. Add WEBSITE to the shared lead_source_enum (lives in public).
    #    ADD VALUE must run outside the migration's transaction; the value isn't
    #    used in this migration so autocommit is safe.
    with op.get_context().autocommit_block():
        bind.execute(
            sa.text("ALTER TYPE lead_source_enum ADD VALUE IF NOT EXISTS 'WEBSITE'")
        )

    # 3. leads.email on every org schema (the booking form collects email).
    schemas = (
        bind.execute(
            sa.text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
            )
        )
        .scalars()
        .all()
    )
    for schema in schemas:
        bind.execute(
            sa.text(f'ALTER TABLE "{schema}".leads ADD COLUMN IF NOT EXISTS email TEXT')
        )


def downgrade() -> None:
    bind = op.get_bind()
    schemas = (
        bind.execute(
            sa.text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name LIKE 'org\\_%' ESCAPE '\\'"
            )
        )
        .scalars()
        .all()
    )
    for schema in schemas:
        bind.execute(sa.text(f'ALTER TABLE "{schema}".leads DROP COLUMN IF EXISTS email'))
    bind.execute(sa.text("DROP INDEX IF EXISTS public.uq_org_website_lead_token"))
    bind.execute(
        sa.text("ALTER TABLE public.organisations DROP COLUMN IF EXISTS website_lead_token")
    )
    # Postgres can't drop an enum value; 'WEBSITE' is left in place (harmless).
