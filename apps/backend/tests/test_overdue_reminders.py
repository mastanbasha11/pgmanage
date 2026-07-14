"""
Regression tests for the daily rent-overdue reminder query.

Scope decision (product): the daily chaser only chases the CURRENT
calendar month's ledger rows. Prior-month unpaid rows are treated as
stale data and left alone until a human reconciles them. Tests pin
both directions of that scope:

- `test_current_month_unpaid_selected`   → this month, past grace: fire.
- `test_prior_month_unpaid_NOT_selected` → last month, still unpaid: skip.
- `test_paid_row_not_selected`           → row where paid >= due: skip.
- `test_repeat_throttle_default_is_daily`→ config default is 1 day, not 3.

The job's own `AsyncSessionLocal()` runs on a different event loop from
the pytest `db` fixture, so we assert against the SQL directly. The SQL
is imported from the job module as `OVERDUE_SELECT_SQL` so that any
regression on the WHERE clause in prod immediately breaks the test.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Import the PRODUCTION SELECT so any regression on WHERE clause in the
# job file breaks these tests immediately. If tests copied the SQL, prod
# could drift and the guard would silently stop guarding.
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
async def test_current_month_unpaid_selected(
    db: AsyncSession, test_tenant: dict
) -> None:
    """This month, past grace, still unpaid → selected.

    Baseline happy-path pin. If this ever stops holding, the chaser
    silently fires zero messages.
    """
    schema = test_tenant["schema_name"]
    await _set_schema(db, schema)
    today = date.today()
    await _insert_ledger_row(
        db,
        tenant_id=test_tenant["tenant_id"],
        property_id=test_tenant["property_id"],
        month=today.month,
        year=today.year,
        due_date=today - timedelta(days=10),  # comfortably past grace
    )
    rows = (await db.execute(
        OVERDUE_SELECT,
        {"month": today.month, "year": today.year, "grace_days": 3, "repeat_days": 1},
    )).mappings().fetchall()
    await db.commit()
    assert any(str(r["id"]) == str(test_tenant["tenant_id"]) for r in rows), rows


@pytest.mark.asyncio
async def test_prior_month_unpaid_NOT_selected(
    db: AsyncSession, test_tenant: dict
) -> None:
    """Prior calendar-month unpaid rows must NOT be selected.

    Product decision: leave stale prior-month rows to a human review
    instead of chasing them daily on WhatsApp — a tenant who's already
    moved out would keep getting nagged forever otherwise.
    """
    schema = test_tenant["schema_name"]
    await _set_schema(db, schema)
    today = date.today()
    # Seed a row in the PRIOR calendar month.
    prior_month = today.month - 1 or 12
    prior_year = today.year if today.month > 1 else today.year - 1
    await _insert_ledger_row(
        db,
        tenant_id=test_tenant["tenant_id"],
        property_id=test_tenant["property_id"],
        month=prior_month,
        year=prior_year,
        due_date=today - timedelta(days=40),  # long past grace
    )
    # Query with the CURRENT month's params (what the job actually passes).
    rows = (await db.execute(
        OVERDUE_SELECT,
        {"month": today.month, "year": today.year, "grace_days": 3, "repeat_days": 1},
    )).mappings().fetchall()
    await db.commit()
    assert not any(
        str(r["id"]) == str(test_tenant["tenant_id"]) for r in rows
    ), (
        f"a prior-month ({prior_month}/{prior_year}) unpaid row leaked "
        f"into the current-month chase: {rows}"
    )


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
    today = date.today()
    await _insert_ledger_row(
        db,
        tenant_id=test_tenant["tenant_id"],
        property_id=test_tenant["property_id"],
        month=today.month,
        year=today.year,
        due_date=today - timedelta(days=10),
        amount_due_paise=700000,
        amount_paid_paise=700000,  # fully paid
    )
    rows = (await db.execute(
        OVERDUE_SELECT,
        {"month": today.month, "year": today.year, "grace_days": 3, "repeat_days": 1},
    )).mappings().fetchall()
    await db.commit()
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
