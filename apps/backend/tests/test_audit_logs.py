"""
Activity-log (unified audit feed) tests.

Covers the write path (log_event fires on real operations), the three read
endpoints (feed / tenant timeline / summary), filtering + pagination, the
OWNER/PARTNER role gate, and the critical guarantee that a logging failure
never breaks the underlying business operation.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


def _payment_payload(tenant_id, amount_paise=700000, payment_type="RENT", for_month=6):
    return {
        "tenant_id": str(tenant_id),
        "amount_paise": amount_paise,
        "payment_type": payment_type,
        "payment_mode": "CASH",
        "for_month": for_month,
        "for_year": 2024,
    }


async def _record_payment(client, owner, tenant, **kw):
    resp = await client.post(
        "/api/v1/payments",
        headers=auth_headers(owner["token"]),
        json=_payment_payload(tenant["tenant_id"], **kw),
    )
    assert resp.status_code == 201, resp.text
    return resp


# ── Positive: write path + feed ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_payment_creates_activity_entry(client: AsyncClient, test_owner, test_tenant):
    await _record_payment(client, test_owner, test_tenant)

    resp = await client.get(
        "/api/v1/audit-logs",
        headers=auth_headers(test_owner["token"]),
        params={"event_category": "payment"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    entry = data["items"][0]
    assert entry["event_type"] == "payment_recorded"
    assert entry["event_category"] == "payment"
    assert entry["actor_name"] == "Test Owner"
    assert entry["tenant_id"] == str(test_tenant["tenant_id"])
    assert "Test Owner" in entry["description"]
    # metadata round-trips as a dict, not a string
    assert isinstance(entry["metadata"], dict)
    assert entry["metadata"]["amount_paise"] == 700000


@pytest.mark.asyncio
async def test_feed_pagination(client: AsyncClient, test_owner, test_tenant):
    for m in (1, 2, 3):
        await _record_payment(client, test_owner, test_tenant, for_month=m)

    p1 = (await client.get(
        "/api/v1/audit-logs",
        headers=auth_headers(test_owner["token"]),
        params={"page_size": 2, "page": 1},
    )).json()
    assert len(p1["items"]) == 2
    assert p1["has_next"] is True

    p2 = (await client.get(
        "/api/v1/audit-logs",
        headers=auth_headers(test_owner["token"]),
        params={"page_size": 2, "page": 2},
    )).json()
    # different rows on page 2
    ids1 = {i["id"] for i in p1["items"]}
    ids2 = {i["id"] for i in p2["items"]}
    assert ids1.isdisjoint(ids2)


@pytest.mark.asyncio
async def test_tenant_timeline_newest_first(client: AsyncClient, test_owner, test_tenant):
    await _record_payment(client, test_owner, test_tenant, for_month=4)
    await _record_payment(client, test_owner, test_tenant, for_month=5)

    resp = await client.get(
        f"/api/v1/audit-logs/tenant/{test_tenant['tenant_id']}",
        headers=auth_headers(test_owner["token"]),
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 2
    assert all(i["tenant_id"] == str(test_tenant["tenant_id"]) for i in items)
    # newest first
    times = [i["created_at"] for i in items]
    assert times == sorted(times, reverse=True)


@pytest.mark.asyncio
async def test_summary_counts(client: AsyncClient, test_owner, test_tenant):
    await _record_payment(client, test_owner, test_tenant)

    resp = await client.get(
        "/api/v1/audit-logs/summary", headers=auth_headers(test_owner["token"])
    )
    assert resp.status_code == 200
    rows = resp.json()
    mine = [r for r in rows if r["user_id"] == str(test_owner["user_id"])]
    assert len(mine) == 1
    assert mine[0]["user_name"] == "Test Owner"
    assert mine[0]["event_count"] >= 1
    assert mine[0]["last_active"] is not None


@pytest.mark.asyncio
async def test_filter_by_actor_and_category(client: AsyncClient, test_owner, test_tenant):
    await _record_payment(client, test_owner, test_tenant)

    by_actor = (await client.get(
        "/api/v1/audit-logs",
        headers=auth_headers(test_owner["token"]),
        params={"actor_user_id": str(test_owner["user_id"])},
    )).json()
    assert by_actor["total"] >= 1
    assert all(i["actor_user_id"] == str(test_owner["user_id"]) for i in by_actor["items"])

    # No expense events were created → category filter yields nothing
    expenses = (await client.get(
        "/api/v1/audit-logs",
        headers=auth_headers(test_owner["token"]),
        params={"event_category": "expense"},
    )).json()
    assert expenses["total"] == 0
    assert expenses["items"] == []


@pytest.mark.asyncio
async def test_search_filter(client: AsyncClient, test_owner, test_tenant):
    await _record_payment(client, test_owner, test_tenant)

    hit = (await client.get(
        "/api/v1/audit-logs",
        headers=auth_headers(test_owner["token"]),
        params={"search": "Test Owner"},
    )).json()
    assert hit["total"] >= 1

    miss = (await client.get(
        "/api/v1/audit-logs",
        headers=auth_headers(test_owner["token"]),
        params={"search": "zzz_no_such_text_zzz"},
    )).json()
    assert miss["total"] == 0


# ── Negative: auth / role gate / validation ─────────────────────────────────

@pytest.mark.asyncio
async def test_audit_endpoints_require_auth(client: AsyncClient, test_tenant):
    for path in (
        "/api/v1/audit-logs",
        "/api/v1/audit-logs/summary",
        f"/api/v1/audit-logs/tenant/{test_tenant['tenant_id']}",
    ):
        resp = await client.get(path)
        assert resp.status_code == 401, f"expected 401 for {path}"


@pytest.mark.asyncio
async def test_supervisor_is_forbidden(client: AsyncClient, test_supervisor, test_tenant):
    """Audit feed is OWNER/PARTNER only — SUPERVISOR gets 403."""
    for path in (
        "/api/v1/audit-logs",
        "/api/v1/audit-logs/summary",
        f"/api/v1/audit-logs/tenant/{test_tenant['tenant_id']}",
    ):
        resp = await client.get(path, headers=auth_headers(test_supervisor["token"]))
        assert resp.status_code == 403, f"expected 403 for {path}, got {resp.status_code}"


@pytest.mark.asyncio
async def test_page_size_over_max_rejected(client: AsyncClient, test_owner):
    resp = await client.get(
        "/api/v1/audit-logs",
        headers=auth_headers(test_owner["token"]),
        params={"page_size": 500},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_timeline_empty_for_unknown_tenant(client: AsyncClient, test_owner):
    resp = await client.get(
        f"/api/v1/audit-logs/tenant/{uuid.uuid4()}",
        headers=auth_headers(test_owner["token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["items"] == []


# ── Critical guarantee: logging failure must NOT break the operation ─────────

@pytest.mark.asyncio
async def test_logging_failure_does_not_break_operation(
    client: AsyncClient, test_owner, test_tenant
):
    """
    If the activity_log INSERT fails (here: table dropped), the SAVEPOINT in
    log_event rolls back only itself — the payment must still be recorded.
    """
    from tests.conftest import TestSessionLocal

    schema = test_tenant["schema_name"]
    # Drop the table in a short-lived session so log_event's INSERT will fail.
    async with TestSessionLocal() as s:
        await s.execute(text(f'DROP TABLE "{schema}".activity_log'))
        await s.commit()

    resp = await client.post(
        "/api/v1/payments",
        headers=auth_headers(test_owner["token"]),
        json=_payment_payload(test_tenant["tenant_id"], for_month=9),
    )
    assert resp.status_code == 201, resp.text
    assert "payment_id" in resp.json()

    # The payment really persisted despite the audit failure (verified via API).
    listing = await client.get(
        "/api/v1/payments",
        headers=auth_headers(test_owner["token"]),
        params={"tenant_id": str(test_tenant["tenant_id"])},
    )
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1
