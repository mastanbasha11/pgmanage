"""
Tests for the settlement-aware default month (GET /billing/current-period).

Financial dashboards should default to the fiscal month people are operating
in: once today (IST) is past a property's settlement/close day, the current
month's books are shut and the default rolls to the next month.

Expected values are derived from the same close-date rule the endpoint uses, so
the test holds on any calendar day it runs.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime

import pytest
import pytz
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers

IST = pytz.timezone("Asia/Kolkata")


def _expected(close_day: int) -> tuple[int, int]:
    today = datetime.now(IST).date()
    last_day = monthrange(today.year, today.month)[1]
    close = date(today.year, today.month, min(close_day, last_day))
    if today > close:
        return (1, today.year + 1) if today.month == 12 else (today.month + 1, today.year)
    return (today.month, today.year)


async def _set_settlement_day(db: AsyncSession, schema: str, pid, day: int) -> None:
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    await db.execute(
        text("UPDATE properties SET settlement_day = :d WHERE id = :id"),
        {"d": day, "id": str(pid)},
    )
    await db.commit()


@pytest.mark.asyncio
async def test_defaults_to_next_month_after_close(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Close on the 1st → today is (almost always) past it → next month."""
    await _set_settlement_day(
        db, test_property["schema_name"], test_property["property_id"], 1
    )
    r = await client.get(
        "/api/v1/billing/current-period",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert r.status_code == 200
    body = r.json()
    exp_m, exp_y = _expected(1)
    assert (body["month"], body["year"]) == (exp_m, exp_y)


@pytest.mark.asyncio
async def test_stays_current_month_before_close(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Close on the 28th → today is (almost always) on/before it → current month."""
    await _set_settlement_day(
        db, test_property["schema_name"], test_property["property_id"], 28
    )
    r = await client.get(
        "/api/v1/billing/current-period",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert r.status_code == 200
    body = r.json()
    exp_m, exp_y = _expected(28)
    assert (body["month"], body["year"]) == (exp_m, exp_y)


@pytest.mark.asyncio
async def test_override_close_date_wins(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """A per-month billing_periods override sets the close date, beating
    settlement_day. Override to the 1st → past → next month."""
    schema = test_property["schema_name"]
    pid = test_property["property_id"]
    await _set_settlement_day(db, schema, pid, 28)  # would otherwise stay current
    today = datetime.now(IST).date()
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    await db.execute(
        text("""
            INSERT INTO billing_periods (property_id, period_month, period_year, close_date)
            VALUES (:pid, :m, :y, :cd)
            ON CONFLICT (property_id, period_month, period_year)
            DO UPDATE SET close_date = EXCLUDED.close_date
        """),
        {"pid": str(pid), "m": today.month, "y": today.year,
         "cd": date(today.year, today.month, 1)},
    )
    await db.commit()
    r = await client.get(
        "/api/v1/billing/current-period",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(pid)},
    )
    assert r.status_code == 200
    body = r.json()
    exp_m, exp_y = _expected(1)
    assert (body["month"], body["year"]) == (exp_m, exp_y)


@pytest.mark.asyncio
async def test_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/billing/current-period")
    assert r.status_code == 401
