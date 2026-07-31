"""
Cross-org isolation for the Job Monitor.

`public.job_runs` is a platform-wide table: the rent-reminder / overdue jobs
sweep every org and store a per-org breakdown in `details.orgs`. An owner must
only ever see THEIR org's slice — never the aggregate, another org's counts,
ids or failure reasons. These tests lock the scoping helpers so a regression
that re-exposes another org can't ship silently.
"""
from __future__ import annotations

from datetime import UTC
from types import SimpleNamespace
from uuid import uuid4

from app.api.v1.job_runs import _org_slice, _org_status, _serialize

MINE = uuid4()
OTHER = uuid4()

DETAILS = {
    "job_name": "rent_overdue_daily",
    "messages_sent": 8,           # platform-wide aggregate — must never surface
    "messages_failed": 5,
    "messages_skipped": 5,
    "errors": [{"org_id": str(OTHER), "error": "boom in someone else's schema"}],
    "orgs": [
        {"org_id": str(MINE), "sent": 3, "failed": 0, "skipped": 0,
         "ledger_created": 3},
        {"org_id": str(OTHER), "sent": 0, "failed": 0, "skipped": 5,
         "ledger_created": 0,
         "reasons": {"WhatsApp not configured for this org": 5}},
    ],
}


def _row(details: dict) -> SimpleNamespace:
    from datetime import datetime
    return SimpleNamespace(
        id=uuid4(),
        job_name="rent_overdue_daily",
        started_at=datetime(2026, 7, 31, 4, 30, tzinfo=UTC),
        finished_at=datetime(2026, 7, 31, 4, 30, 1, tzinfo=UTC),
        status="PARTIAL",  # platform-wide column — must NOT be echoed verbatim
        orgs_processed=2,
        messages_sent=8,
        messages_failed=5,
        ledger_entries_created=3,
        details=details,
    )


def test_org_slice_returns_only_my_entry() -> None:
    mine = _org_slice(DETAILS, MINE)
    assert mine is not None
    assert mine["org_id"] == str(MINE)
    assert mine["sent"] == 3
    # not another org's row
    assert _org_slice(DETAILS, OTHER)["org_id"] == str(OTHER)
    # unknown org → nothing
    assert _org_slice(DETAILS, uuid4()) is None


def test_serialize_never_leaks_other_org_or_aggregate() -> None:
    out = _serialize(_row(DETAILS), MINE)
    # only MY counts, not the platform aggregate (8/5/5)
    assert out["messages_sent"] == 3
    assert out["messages_failed"] == 0
    assert out["messages_skipped"] == 0
    assert out["ledger_entries_created"] == 3
    # my org was fine → SUCCESS, even though the platform-wide status was PARTIAL
    assert out["status"] == "SUCCESS"
    # cross-org fields are gone entirely
    assert "orgs_processed" not in out
    # nothing in the payload references the other org or its error text
    blob = repr(out)
    assert str(OTHER) not in blob
    assert "someone else" not in blob


def test_org_scoped_status_hides_other_org_failure() -> None:
    # I failed → PARTIAL
    assert _org_status(DETAILS, _org_slice(DETAILS, MINE)) == "SUCCESS"
    failed_me = {"orgs": [{"org_id": str(MINE), "sent": 0, "failed": 2}]}
    assert _org_status(failed_me, _org_slice(failed_me, MINE)) == "PARTIAL"
    # a fatal run I was never reached in → FAILED
    assert _org_status({"fatal_error": "db down", "orgs": []}, None) == "FAILED"


def test_org_not_in_run_reads_as_empty_not_error() -> None:
    """A run that predates my org (no slice) shows zeros, not another org's data."""
    out = _serialize(_row(DETAILS), uuid4())
    assert out["messages_sent"] == 0
    assert out["messages_skipped"] == 0
    assert out["status"] == "SUCCESS"
