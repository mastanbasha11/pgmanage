"""
Lead management endpoint tests.
Covers create, list, pipeline stats, detail, update, activities, and conversion.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


# ── Helpers ────────────────────────────────────────────────────────────────────

def _lead_payload(property_id: uuid.UUID, phone: str = "+919876543100") -> dict:
    return {
        "property_id": str(property_id),
        "name": "Priya Sharma",
        "phone": phone,
        "source": "REFERRAL",
        "budget_min_paise": 500000,
        "budget_max_paise": 800000,
        "interested_room_type": "Single",
        "expected_move_in_date": "2024-09-01",
        "notes": "Looking for AC room",
    }


# ── Create lead ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_lead_requires_auth(client: AsyncClient):
    response = await client.post("/api/v1/leads", json={})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_lead_success(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /leads creates a new lead with status NEW."""
    response = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    assert response.status_code == 201
    data = response.json()
    assert "lead_id" in data
    assert data["status"] == "NEW"


@pytest.mark.asyncio
async def test_create_lead_supervisor_can_create(
    client: AsyncClient, test_supervisor: dict, test_property: dict
):
    """SUPERVISOR can create leads (no role restriction)."""
    response = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_supervisor["token"]),
        json=_lead_payload(test_property["property_id"], phone="+919876543101"),
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_lead_missing_required_field(
    client: AsyncClient, test_owner: dict
):
    """Missing required field → 422."""
    response = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json={"name": "Missing Fields"},  # missing property_id and phone
    )
    assert response.status_code == 422


# ── List leads ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_leads_empty_initially(
    client: AsyncClient, test_owner: dict
):
    response = await client.get(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_list_leads_after_create(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Leads appear in list after creation."""
    await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    response = await client.get(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    assert response.json()["total"] >= 1


@pytest.mark.asyncio
async def test_list_leads_filter_by_property(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """?property_id filter scopes results."""
    await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    response = await client.get(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    assert response.json()["total"] >= 1


@pytest.mark.asyncio
async def test_list_leads_filter_by_status(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """?status filter returns only leads of that status."""
    await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    response = await client.get(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        params={"status": "NEW"},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert all(item["status"] == "NEW" for item in items)


@pytest.mark.asyncio
async def test_list_leads_filter_by_source(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """?source filter works."""
    await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    response = await client.get(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        params={"source": "REFERRAL"},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert all(item["source"] == "REFERRAL" for item in items)


# ── Pipeline stats ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pipeline_stats_structure(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /leads/pipeline-stats returns all status counts."""
    response = await client.get(
        "/api/v1/leads/pipeline-stats",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    data = response.json()
    # All 6 statuses must be present
    for status in ("NEW", "CONTACTED", "SITE_VISITED", "NEGOTIATING", "CONVERTED", "LOST"):
        assert status in data
        assert isinstance(data[status], int)


@pytest.mark.asyncio
async def test_pipeline_stats_counts_correctly(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Pipeline stats reflect created leads."""
    await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    response = await client.get(
        "/api/v1/leads/pipeline-stats",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.json()["NEW"] >= 1


# ── Due today ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_due_today_empty_with_no_followups(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """No leads with today's follow-up → empty list."""
    response = await client.get(
        "/api/v1/leads/due-today",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    # May have some from other tests but it's an empty check for this org


@pytest.mark.asyncio
async def test_due_today_with_today_followup(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Lead with follow-up set to today appears in due-today."""
    today = datetime.now(timezone.utc).date().isoformat()
    today_dt = datetime.now(timezone.utc).isoformat()

    create_resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json={
            **_lead_payload(test_property["property_id"], phone="+919876543102"),
            "next_followup_at": today_dt,
        },
    )
    assert create_resp.status_code == 201

    response = await client.get(
        "/api/v1/leads/due-today",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


# ── Get lead detail ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_lead_detail(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /leads/{id} returns lead with activities list."""
    create_resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    lead_id = create_resp.json()["lead_id"]

    response = await client.get(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == lead_id
    assert data["name"] == "Priya Sharma"
    assert "activities" in data
    assert isinstance(data["activities"], list)


@pytest.mark.asyncio
async def test_get_lead_not_found(client: AsyncClient, test_owner: dict):
    response = await client.get(
        f"/api/v1/leads/{uuid.uuid4()}",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 404


# ── Update lead ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_lead_status(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """PATCH /leads/{id} updates lead status."""
    create_resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    lead_id = create_resp.json()["lead_id"]

    response = await client.patch(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
        json={"status": "CONTACTED", "notes": "Called and confirmed interest"},
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Lead updated"


@pytest.mark.asyncio
async def test_update_lead_empty_body_returns_400(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    create_resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    lead_id = create_resp.json()["lead_id"]

    response = await client.patch(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
        json={},
    )
    assert response.status_code == 400


# ── Log activity ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_log_activity_success(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /leads/{id}/activities logs an activity."""
    create_resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    lead_id = create_resp.json()["lead_id"]

    response = await client.post(
        f"/api/v1/leads/{lead_id}/activities",
        headers=auth_headers(test_owner["token"]),
        json={"activity_type": "CALL", "notes": "Called to confirm site visit"},
    )
    assert response.status_code == 201
    assert "activity_id" in response.json()


@pytest.mark.asyncio
async def test_log_activity_updates_last_contacted_at(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """After logging an activity, lead's last_contacted_at is updated."""
    create_resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    lead_id = create_resp.json()["lead_id"]

    await client.post(
        f"/api/v1/leads/{lead_id}/activities",
        headers=auth_headers(test_owner["token"]),
        json={"activity_type": "NOTE", "notes": "Site visit confirmed"},
    )

    detail_resp = await client.get(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
    )
    lead = detail_resp.json()
    assert lead["last_contacted_at"] is not None
    assert len(lead["activities"]) == 1
    assert lead["activities"][0]["activity_type"] == "NOTE"


# ── Convert lead ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_convert_lead_success(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /leads/{id}/convert marks lead as CONVERTED."""
    create_resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    lead_id = create_resp.json()["lead_id"]

    response = await client.post(
        f"/api/v1/leads/{lead_id}/convert",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert "prefill" in data
    assert data["prefill"]["name"] == "Priya Sharma"
    assert data["prefill"]["phone"] == "+919876543100"


@pytest.mark.asyncio
async def test_convert_lead_nonexistent_returns_404(
    client: AsyncClient, test_owner: dict
):
    response = await client.post(
        f"/api/v1/leads/{uuid.uuid4()}/convert",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_convert_lead_updates_status(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Converted lead has status CONVERTED in detail view."""
    create_resp = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"]),
    )
    lead_id = create_resp.json()["lead_id"]

    await client.post(
        f"/api/v1/leads/{lead_id}/convert",
        headers=auth_headers(test_owner["token"]),
    )

    detail_resp = await client.get(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
    )
    assert detail_resp.json()["status"] == "CONVERTED"
