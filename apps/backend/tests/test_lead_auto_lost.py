"""
Regression tests for the daily auto-close-stale-leads job.

Product rule: a still-open lead untouched for 30+ days with no pending
follow-up is auto-moved to LOST and stamped with a distinctive lost_reason
(the "flag"). Reps' active leads — recently touched, or with a future
follow-up scheduled — must be left alone.

Like test_overdue_reminders, we import the PRODUCTION UPDATE so any drift in
the WHERE clause breaks these tests immediately. The job's own
AsyncSessionLocal() runs on a different loop from the pytest `db` fixture, so
we exercise the SQL directly against a real org schema.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks.lead_auto_lost import (  # noqa: E402
    AUTO_LOST_REASON,
    AUTO_LOST_UPDATE_SQL,
    IDLE_DAYS,
)

UPDATE = text(AUTO_LOST_UPDATE_SQL)
PARAMS = {"reason": AUTO_LOST_REASON, "idle_days": IDLE_DAYS}


async def _set_schema(db: AsyncSession, schema: str) -> None:
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))


async def _insert_lead(
    db: AsyncSession,
    org_id,
    property_id,
    *,
    name: str,
    status: str = "NEW",
    created_at: datetime,
    last_contacted_at: datetime | None = None,
    next_followup_at: datetime | None = None,
) -> uuid.UUID:
    lead_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO leads
                (id, org_id, property_id, name, phone, source, status,
                 created_at, last_contacted_at, next_followup_at)
            VALUES
                (:id, :org, :pid, :name, '9876500000',
                 CAST('OTHER' AS lead_source_enum),
                 CAST(:status AS lead_status_enum),
                 :created, :contacted, :followup)
        """),
        {
            "id": str(lead_id),
            "org": str(org_id),
            "pid": str(property_id),
            "name": name,
            "status": status,
            "created": created_at,
            "contacted": last_contacted_at,
            "followup": next_followup_at,
        },
    )
    return lead_id


def _days_ago(n: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=n)


async def _run_and_status(db: AsyncSession, lead_id: uuid.UUID) -> tuple[str, str | None]:
    await db.execute(UPDATE, PARAMS)
    row = (
        await db.execute(
            text("SELECT status::text, lost_reason FROM leads WHERE id = :id"),
            {"id": str(lead_id)},
        )
    ).first()
    return row[0], row[1]


@pytest.mark.asyncio
async def test_stale_untouched_lead_is_auto_lost(
    db: AsyncSession, test_property: dict
) -> None:
    """Open lead, created 40 days ago, never contacted, no follow-up → LOST + flag."""
    schema = test_property["schema_name"]
    await _set_schema(db, schema)
    lead_id = await _insert_lead(
        db,
        test_property["org_id"],
        test_property["property_id"],
        name="Stale",
        created_at=_days_ago(40),
    )
    status, reason = await _run_and_status(db, lead_id)
    await db.commit()
    assert status == "LOST"
    assert reason == AUTO_LOST_REASON


@pytest.mark.asyncio
async def test_recently_contacted_lead_is_kept(
    db: AsyncSession, test_property: dict
) -> None:
    """Created long ago but contacted 3 days ago → still active, not touched."""
    schema = test_property["schema_name"]
    await _set_schema(db, schema)
    lead_id = await _insert_lead(
        db,
        test_property["org_id"],
        test_property["property_id"],
        name="Warm",
        created_at=_days_ago(90),
        last_contacted_at=_days_ago(3),
    )
    status, _ = await _run_and_status(db, lead_id)
    await db.commit()
    assert status == "NEW"


@pytest.mark.asyncio
async def test_future_followup_lead_is_kept(
    db: AsyncSession, test_property: dict
) -> None:
    """Idle 45 days but a rep scheduled a follow-up for tomorrow → keep alive."""
    schema = test_property["schema_name"]
    await _set_schema(db, schema)
    lead_id = await _insert_lead(
        db,
        test_property["org_id"],
        test_property["property_id"],
        name="Scheduled",
        created_at=_days_ago(45),
        next_followup_at=datetime.now(UTC) + timedelta(days=1),
    )
    status, _ = await _run_and_status(db, lead_id)
    await db.commit()
    assert status == "NEW"


@pytest.mark.asyncio
async def test_overdue_followup_stale_lead_is_auto_lost(
    db: AsyncSession, test_property: dict
) -> None:
    """A follow-up that's itself in the past doesn't protect a stale lead."""
    schema = test_property["schema_name"]
    await _set_schema(db, schema)
    lead_id = await _insert_lead(
        db,
        test_property["org_id"],
        test_property["property_id"],
        name="Forgotten",
        created_at=_days_ago(60),
        next_followup_at=_days_ago(35),
    )
    status, reason = await _run_and_status(db, lead_id)
    await db.commit()
    assert status == "LOST"
    assert reason == AUTO_LOST_REASON


@pytest.mark.asyncio
async def test_converted_lead_is_never_touched(
    db: AsyncSession, test_property: dict
) -> None:
    """CONVERTED is terminal — an old converted lead must stay converted."""
    schema = test_property["schema_name"]
    await _set_schema(db, schema)
    lead_id = await _insert_lead(
        db,
        test_property["org_id"],
        test_property["property_id"],
        name="Won",
        status="CONVERTED",
        created_at=_days_ago(200),
    )
    status, _ = await _run_and_status(db, lead_id)
    await db.commit()
    assert status == "CONVERTED"


@pytest.mark.asyncio
async def test_fresh_lead_within_window_is_kept(
    db: AsyncSession, test_property: dict
) -> None:
    """Created 10 days ago (< 30) → too fresh to auto-close."""
    schema = test_property["schema_name"]
    await _set_schema(db, schema)
    lead_id = await _insert_lead(
        db,
        test_property["org_id"],
        test_property["property_id"],
        name="Fresh",
        created_at=_days_ago(10),
    )
    status, _ = await _run_and_status(db, lead_id)
    await db.commit()
    assert status == "NEW"
