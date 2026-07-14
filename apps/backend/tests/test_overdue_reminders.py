"""
Regression tests for the daily rent-overdue reminder query.

Guards against two shipped bugs:

1. The overdue SELECT hardcoded the CURRENT calendar month, so any
   unpaid ledger row from a PRIOR month silently fell off the radar the
   moment the month rolled over. `test_prior_month_unpaid_selected`
   pins the fix: a June-unpaid row must still be picked up on Jul 14.

2. The repeat throttle defaulted to 3 days — the job was named
   "daily" but only truly ran once every 3 days per tenant.
   `test_repeat_throttle_default_is_daily` pins the config.

The job's own `AsyncSessionLocal()` runs on a different event loop
from the pytest `db` fixture, so we assert against the SQL directly
(the SELECT is the piece that actually changed). Any regression on
the WHERE clause / DISTINCT-ON semantics will show up here.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# Import the PRODUCTION SELECT so any regression on WHERE clause /
# DISTINCT-ON / ORDER BY in the job file breaks these tests immediately.
# If tests copied the SQL, prod could drift and the guard would silently
# stop guarding.
from app.tasks.rent_reminders import OVERDUE_SELECT_SQL  # noqa: E402

OVERDUE_SELECT = text(OVERDUE_SELECT_SQL)


async def _set_schema(db: AsyncSession, schema: str) -> None:
    """SET LOCAL search_path — must be called before every query in a test
    because SET LOCAL is scoped to the current transaction only."""
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))


async def _insert_ledger_row(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    property_id: uuid.UUID,
    month: int,
    year: int,
    due_date: date,
    amount_due_paise: int = 700000,
    amount_paid_paise: int = 0,
) -> None:
    # Compute status in Python — asyncpg types un-CAST params as text, which
    # blows up any `:paid >= :due` comparison in SQL with "text > integer".
    if amount_paid_paise >= amount_due_paise:
        status = "PAID"
    elif amount_paid_paise > 0:
        status = "PARTIAL"
    else:
        status = "UNPAID"
    await db.execute(
        text("""
            INSERT INTO rent_ledger_entries
                (tenant_id, property_id, month, year, amount_due_paise,
                 amount_paid_paise, due_date, status)
            VALUES (:tid, :pid, :m, :y, :due, :paid, :dd,
                    CAST(:status AS rent_status_enum))
            ON CONFLICT (tenant_id, month, year) DO UPDATE
                SET amount_due_paise = EXCLUDED.amount_due_paise,
                    amount_paid_paise = EXCLUDED.amount_paid_paise,
                    due_date = EXCLUDED.due_date,
                    status = EXCLUDED.status
        """),
        {
            "tid": str(tenant_id),
            "pid": str(property_id),
            "m": month, "y": year,
            "due": amount_due_paise,
            "paid": amount_paid_paise,
            "dd": due_date,
            "status": status,
        },
    )


@pytest.mark.asyncio
async def test_prior_month_unpaid_selected(
    db: AsyncSession, test_tenant: dict
) -> None:
    """A ledger row from a prior calendar month must still be selected.

    Regression: SELECT used to filter `rle.month = now.month`, silently
    dropping June-unpaid rows the moment July started. This test pins the
    behaviour — a row with any prior (month, year) but a past-grace
    due_date shows up.
    """
    schema = test_tenant["schema_name"]
    await _set_schema(db, schema)
    await _insert_ledger_row(
        db,
        tenant_id=test_tenant["tenant_id"],
        property_id=test_tenant["property_id"],
        # Pick a month deliberately different from today to catch the
        # "current month" regression regardless of when the test runs.
        month=(date.today().month - 1) or 12,
        year=date.today().year if date.today().month > 1 else date.today().year - 1,
        due_date=date.today() - timedelta(days=40),
    )
    rows = (await db.execute(
        OVERDUE_SELECT, {"grace_days": 3, "repeat_days": 1}
    )).mappings().fetchall()
    await db.commit()  # close implicit transaction before teardown
    assert any(str(r["id"]) == str(test_tenant["tenant_id"]) for r in rows), (
        f"prior-month unpaid ledger row was not selected: {rows}"
    )


@pytest.mark.asyncio
async def test_only_one_row_per_tenant_oldest_first(
    db: AsyncSession, test_tenant: dict
) -> None:
    """`DISTINCT ON (t.id)` + `ORDER BY due_date ASC` picks the OLDEST.

    Prevents WhatsApp spam when a tenant has multiple open months — one
    reminder per run, referencing the earliest still-owed month.
    """
    schema = test_tenant["schema_name"]
    await _set_schema(db, schema)
    for m, days in [(4, 100), (5, 70), (6, 40)]:
        await _insert_ledger_row(
            db,
            tenant_id=test_tenant["tenant_id"],
            property_id=test_tenant["property_id"],
            month=m,
            year=2026,
            due_date=date.today() - timedelta(days=days),
        )
    rows = (await db.execute(
        OVERDUE_SELECT, {"grace_days": 3, "repeat_days": 1}
    )).mappings().fetchall()
    await db.commit()  # close implicit transaction before teardown
    mine = [r for r in rows if str(r["id"]) == str(test_tenant["tenant_id"])]
    assert len(mine) == 1, mine
    # Oldest month wins — April.
    assert mine[0]["month"] == 4, mine[0]


@pytest.mark.asyncio
async def test_paid_row_not_selected(
    db: AsyncSession, test_tenant: dict
) -> None:
    """A ledger row where amount_paid >= amount_due must NOT be selected.

    Prevents a chasing bug where a row still marked UNPAID (data drift)
    but with amount_paid caught up would keep firing.
    """
    schema = test_tenant["schema_name"]
    await _set_schema(db, schema)
    await _insert_ledger_row(
        db,
        tenant_id=test_tenant["tenant_id"],
        property_id=test_tenant["property_id"],
        month=6, year=2026,
        due_date=date.today() - timedelta(days=40),
        amount_due_paise=700000,
        amount_paid_paise=700000,  # fully paid
    )
    rows = (await db.execute(
        OVERDUE_SELECT, {"grace_days": 3, "repeat_days": 1}
    )).mappings().fetchall()
    await db.commit()  # close implicit transaction before teardown
    assert not any(
        str(r["id"]) == str(test_tenant["tenant_id"]) for r in rows
    ), rows


def test_repeat_throttle_default_is_daily() -> None:
    """The daily overdue job must actually be daily by default.

    Guards against a config regression that would silently drop cadence
    back to every-3-days without anyone noticing.
    """
    from app.core.config import settings

    assert settings.OVERDUE_REPEAT_DAYS == 1, (
        f"OVERDUE_REPEAT_DAYS should default to 1 (daily); got "
        f"{settings.OVERDUE_REPEAT_DAYS}"
    )
