"""Compute fiscal-month period bounds for a property.

A "fiscal month" runs from (previous month's close + 1) to (this month's close).
Close date for a (property, month, year) is either:
  - an explicit override row in `billing_periods`, OR
  - the property's `settlement_day` applied to that calendar month.

Returns dates as Python `date` instances. Both ends inclusive.
"""
from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class FiscalPeriod:
    period_start: date
    period_end: date
    settlement_day: int
    overridden: bool          # True if this month's close was explicitly set
    prev_overridden: bool     # True if previous month was


def _last_day_of_month(year: int, month: int) -> int:
    return monthrange(year, month)[1]


def _close_date_default(year: int, month: int, settlement_day: int) -> date:
    # Cap at last day of month — Feb / 30-day months won't accidentally roll over.
    return date(year, month, min(settlement_day, _last_day_of_month(year, month)))


async def get_fiscal_period(
    property_id: UUID, month: int, year: int, db: AsyncSession,
) -> FiscalPeriod:
    """Return (start, end) inclusive for the (property, month, year) fiscal period."""
    # Property's default settlement_day
    sd_row = await db.execute(
        text("SELECT settlement_day FROM properties WHERE id = :id"),
        {"id": str(property_id)},
    )
    settlement_day: int = sd_row.scalar_one_or_none() or 10

    # This month's close (override?)
    cur_row = await db.execute(
        text("""
            SELECT close_date FROM billing_periods
            WHERE property_id = :pid AND period_month = :m AND period_year = :y
        """),
        {"pid": str(property_id), "m": month, "y": year},
    )
    cur = cur_row.scalar_one_or_none()
    end = cur if cur else _close_date_default(year, month, settlement_day)

    # Previous month's close
    if month == 1:
        prev_m, prev_y = 12, year - 1
    else:
        prev_m, prev_y = month - 1, year

    prev_row = await db.execute(
        text("""
            SELECT close_date FROM billing_periods
            WHERE property_id = :pid AND period_month = :m AND period_year = :y
        """),
        {"pid": str(property_id), "m": prev_m, "y": prev_y},
    )
    prev = prev_row.scalar_one_or_none()
    prev_close = prev if prev else _close_date_default(prev_y, prev_m, settlement_day)

    start = prev_close + timedelta(days=1)

    return FiscalPeriod(
        period_start=start,
        period_end=end,
        settlement_day=settlement_day,
        overridden=cur is not None,
        prev_overridden=prev is not None,
    )
