"""Lead CRM v2: BOOKED status + advance tracking + attribution columns.

Introduces:
- Extends `lead_status_enum` with `BOOKED` (inserted between NEGOTIATING
  and CONVERTED). Represents "advance received, physically not moved in
  yet" — a real financial commitment distinct from just verbal interest
  (NEGOTIATING) and from an actual tenant record (CONVERTED).
- New columns on `leads`:
    - `created_by UUID`       — the rep/owner who added the lead
    - `advance_paise BIGINT`  — advance amount at BOOKED
    - `advance_paid_at TIMESTAMPTZ`
    - `source_ad_id VARCHAR(200)`     — Meta ad_id (future webhook wiring)
    - `source_adset_name VARCHAR(200)`

Loops every existing org schema.

Revision ID: 033
Revises: 032
Create Date: 2026-07-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "033"
down_revision = "032"
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


def _has_type(bind, schema: str, typename: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                "SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace "
                "WHERE n.nspname = :schema AND t.typname = :typname"
            ),
            {"schema": schema, "typname": typename},
        ).scalar()
    )


def _has_table(bind, schema: str, tablename: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = :schema AND table_name = :tablename"
            ),
            {"schema": schema, "tablename": tablename},
        ).scalar()
    )


def upgrade() -> None:
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        # Guard against very old org schemas that predate the leads
        # feature — no enum, no table. Nothing to alter, skip cleanly.
        if _has_type(bind, schema, "lead_status_enum"):
            # BOOKED sits between NEGOTIATING and CONVERTED. `IF NOT EXISTS`
            # makes this rerunnable if a partial upgrade added the value.
            bind.execute(
                sa.text(
                    f'ALTER TYPE "{schema}".lead_status_enum '
                    f"ADD VALUE IF NOT EXISTS 'BOOKED' AFTER 'NEGOTIATING'"
                )
            )

        if _has_table(bind, schema, "leads"):
            for col_ddl in (
                "created_by UUID",
                "advance_paise BIGINT",
                "advance_paid_at TIMESTAMPTZ",
                "source_ad_id VARCHAR(200)",
                "source_adset_name VARCHAR(200)",
            ):
                bind.execute(
                    sa.text(
                        f'ALTER TABLE "{schema}".leads '
                        f"ADD COLUMN IF NOT EXISTS {col_ddl}"
                    )
                )


def downgrade() -> None:
    # Postgres has no `DROP VALUE` for enums — reverting BOOKED would
    # require rebuilding the enum and any rows using the value. Leave the
    # enum value in place; drop only the columns.
    bind = op.get_bind()
    for schema in _org_schemas(bind):
        if not _has_table(bind, schema, "leads"):
            continue
        for col in (
            "created_by",
            "advance_paise",
            "advance_paid_at",
            "source_ad_id",
            "source_adset_name",
        ):
            bind.execute(
                sa.text(
                    f'ALTER TABLE "{schema}".leads DROP COLUMN IF EXISTS {col}'
                )
            )
