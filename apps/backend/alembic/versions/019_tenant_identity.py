"""Phone-keyed tenant identity in public schema, with backfill from org tenants.

The legacy `/tenant/auth/otp` flow required the caller to send `org_slug` +
`property_id`, which means the tenant had to know which org they belonged to
before they could log in. That doesn't survive a tenant who's moved between
PGs over time, and it makes onboarding-via-invite-link awkward.

This migration introduces a phone-keyed identity layer in `public` so the
auth flow becomes phone → identity → list of orgs this phone has ever been
associated with → org picker if needed.

  - public.tenant_identity:        one row per phone (globally unique)
  - public.tenant_identity_links:  many rows per identity (one per org)

Backfill walks every existing org schema's `tenants` table and seeds an
identity row + an ACTIVE link per existing tenant. After this migration:

  SELECT * FROM public.tenant_identity_links
  WHERE phone_via_identity = '+919876543210';

gives the auth layer everything it needs without touching org schemas first.

Revision ID: 019
Revises: 018
Create Date: 2026-06-12
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "019"
down_revision = "018"
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

    bind.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS public.tenant_identity (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                phone           VARCHAR(20) NOT NULL UNIQUE,
                email           VARCHAR(255),
                preferred_lang  VARCHAR(5) NOT NULL DEFAULT 'en',
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_login_at   TIMESTAMPTZ
            )
            """
        )
    )

    bind.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS public.tenant_identity_links (
                identity_id     UUID NOT NULL
                                  REFERENCES public.tenant_identity(id) ON DELETE CASCADE,
                org_id          UUID NOT NULL,
                schema_name     VARCHAR(100) NOT NULL,
                tenant_id       UUID,
                request_id      UUID,
                status          VARCHAR(20) NOT NULL,    -- ACTIVE / PENDING / ARCHIVED
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (identity_id, org_id),
                CHECK (
                    (status = 'ACTIVE'  AND tenant_id IS NOT NULL) OR
                    (status = 'PENDING' AND request_id IS NOT NULL) OR
                    status = 'ARCHIVED'
                )
            )
            """
        )
    )

    bind.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS tenant_identity_links_org_idx "
            "ON public.tenant_identity_links(org_id, status)"
        )
    )

    # ── Backfill ─────────────────────────────────────────────────────────────
    # Every existing tenant (any status — checked-out tenants might come back)
    # gets an identity row + an ARCHIVED link if checked-out, ACTIVE otherwise.
    for schema in _org_schemas(bind):
        # First, get org_id for this schema (1:1 with public.organisations).
        org_row = bind.execute(
            sa.text(
                "SELECT id FROM public.organisations WHERE schema_name = :s LIMIT 1"
            ),
            {"s": schema},
        ).fetchone()
        if not org_row:
            continue
        org_id = org_row[0]

        # Insert identities (one per unique phone) — phones that already exist
        # across orgs share a single identity row.
        bind.execute(
            sa.text(
                f'''
                INSERT INTO public.tenant_identity (phone, email)
                SELECT DISTINCT ON (t.phone) t.phone, t.email
                FROM "{schema}".tenants t
                WHERE t.phone IS NOT NULL
                  AND t.phone != ''
                  AND t.is_deleted = false
                ON CONFLICT (phone) DO NOTHING
                '''
            )
        )

        # Insert links — one per (identity, this org). The CHECK constraint
        # forces tenant_id when status=ACTIVE; checked-out becomes ARCHIVED.
        bind.execute(
            sa.text(
                f'''
                INSERT INTO public.tenant_identity_links
                    (identity_id, org_id, schema_name, tenant_id, status)
                SELECT
                    ti.id,
                    :org_id,
                    :schema,
                    t.id,
                    CASE t.status::text
                        WHEN 'ACTIVE' THEN 'ACTIVE'
                        ELSE 'ARCHIVED'
                    END
                FROM "{schema}".tenants t
                JOIN public.tenant_identity ti ON ti.phone = t.phone
                WHERE t.is_deleted = false
                ON CONFLICT (identity_id, org_id) DO NOTHING
                '''
            ),
            {"org_id": str(org_id), "schema": schema},
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DROP TABLE IF EXISTS public.tenant_identity_links"))
    bind.execute(sa.text("DROP TABLE IF EXISTS public.tenant_identity"))
