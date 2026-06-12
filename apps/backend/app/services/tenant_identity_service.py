"""Phone-keyed tenant identity in public schema.

Owner-side flows (check-in, re-check-in, checkout) call into here so the
tenant app's auth layer always has a coherent picture of which orgs a phone
is linked to.

Calls are no-ops when phone is empty / missing — the staff app permits
phoneless tenants, but they obviously can't use the tenant app.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def link_tenant_to_identity(
    db: AsyncSession,
    *,
    phone: str | None,
    email: str | None,
    org_id: UUID,
    schema_name: str,
    tenant_id: UUID,
) -> None:
    """Upsert public.tenant_identity by phone and link it to this tenant.

    Assumes caller is mid-request inside the org's search_path; we explicitly
    write to public.* so it doesn't matter, but every UPDATE inside the txn
    is part of the same commit as the tenants/rent_plans insert above.
    """
    if not phone:
        return

    # Upsert identity row. If a row exists for this phone in another org,
    # we reuse it — that's how multi-org tenants get represented.
    identity_row = (
        await db.execute(
            text(
                """
                INSERT INTO public.tenant_identity (phone, email)
                VALUES (:phone, :email)
                ON CONFLICT (phone) DO UPDATE
                  SET email = COALESCE(public.tenant_identity.email, EXCLUDED.email)
                RETURNING id
                """
            ),
            {"phone": phone, "email": email},
        )
    ).mappings().fetchone()
    identity_id = identity_row["id"]

    # Upsert ACTIVE link for this (identity, org). If the link existed as
    # ARCHIVED (e.g. tenant checked out then re-checked in), flip back to
    # ACTIVE with the new tenant_id.
    await db.execute(
        text(
            """
            INSERT INTO public.tenant_identity_links
                (identity_id, org_id, schema_name, tenant_id, status)
            VALUES (:iid, :oid, :sch, :tid, 'ACTIVE')
            ON CONFLICT (identity_id, org_id) DO UPDATE
              SET schema_name = EXCLUDED.schema_name,
                  tenant_id   = EXCLUDED.tenant_id,
                  status      = 'ACTIVE',
                  request_id  = NULL
            """
        ),
        {
            "iid": str(identity_id),
            "oid": str(org_id),
            "sch": schema_name,
            "tid": str(tenant_id),
        },
    )


async def archive_tenant_identity_link(
    db: AsyncSession,
    *,
    org_id: UUID,
    tenant_id: UUID,
) -> None:
    """Flip the link to ARCHIVED when a tenant checks out. Identity row stays
    so a future re-check-in (possibly at a different org) reuses the same id.
    """
    # Keep tenant_id on the row — it's useful historical context. ARCHIVED
    # has no CHECK constraint requirement on tenant_id.
    await db.execute(
        text(
            """
            UPDATE public.tenant_identity_links
               SET status = 'ARCHIVED'
             WHERE org_id = :oid AND tenant_id = :tid
            """
        ),
        {"oid": str(org_id), "tid": str(tenant_id)},
    )
