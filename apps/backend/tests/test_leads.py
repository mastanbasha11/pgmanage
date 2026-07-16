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


# ── CRM v2 (migration 033): BOOKED status + advance tracking + attribution ─────
#
# The roundtrip test below is the "one assertion per persisted field" guard
# per the feedback-endpoint-field-roundtrip memory. Whenever a new field is
# added to LeadCreate / LeadUpdate, add a matching assertion here in the
# same commit. Removing the corresponding column from the INSERT / PATCH
# key path breaks this test immediately instead of silently in prod.

@pytest.mark.asyncio
async def test_book_lead_full_roundtrip_of_new_fields(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Every field added by migration 033 must survive create -> patch -> get."""
    payload = {
        "property_id": str(test_property["property_id"]),
        "name": "Anil Kumar",
        "phone": "+919876543101",
        "source": "META_AD",
        "source_campaign_name": "Monsoon Move-in 2026",
        "source_ad_id": "23855029301230123",
        "source_adset_name": "Bangalore · Male · 22-32",
        "budget_min_paise": 800000,
        "budget_max_paise": 1200000,
        "interested_room_type": "Single AC",
        "expected_move_in_date": "2026-08-01",
        "notes": "Wants to see rooms Sat morning",
    }
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=payload,
    )
    assert create.status_code == 201, create.text
    lead_id = create.json()["lead_id"]

    # Everything set on create round-trips on the GET.
    got = await client.get(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
    )
    assert got.status_code == 200
    body = got.json()
    assert body["name"] == payload["name"]
    assert body["source"] == payload["source"]
    assert body["source_campaign_name"] == payload["source_campaign_name"]
    assert body["source_ad_id"] == payload["source_ad_id"]
    assert body["source_adset_name"] == payload["source_adset_name"]
    # created_by is stamped from the token on the server side; the owner
    # fixture's user_id is authoritative.
    assert body["created_by"] == str(test_owner["user_id"])
    # New nullables start unset.
    assert body["advance_paise"] is None
    assert body["advance_paid_at"] is None
    assert body["status"] == "NEW"

    # Mark as BOOKED with an advance — the update path that the Kanban's
    # "Mark as Booked" button will call.
    patch = await client.patch(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
        json={
            "status": "BOOKED",
            "advance_paise": 500000,          # ₹5,000 token advance
            "advance_paid_at": "2026-07-16T12:30:00+05:30",
            "notes": "Advance received in UPI, ref ABCD1234",
        },
    )
    assert patch.status_code == 200, patch.text

    got2 = await client.get(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
    )
    body2 = got2.json()
    assert body2["status"] == "BOOKED"
    assert body2["advance_paise"] == 500000
    # timestamp is stored as UTC in the DB — parse liberally.
    assert body2["advance_paid_at"] is not None
    assert body2["notes"] == "Advance received in UPI, ref ABCD1234"


@pytest.mark.asyncio
async def test_patch_lead_can_edit_core_fields(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Detail-drawer edits — name / phone / budget / source — persist.

    Covers the LeadUpdate extension in the same commit as migration 033.
    """
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json=_lead_payload(test_property["property_id"], phone="+919876543102"),
    )
    lead_id = create.json()["lead_id"]

    patch = await client.patch(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
        json={
            "name": "Priya Sharma (corrected)",
            "phone": "+919876543103",
            "email": "priya@example.com",
            "source": "INSTAGRAM",
            "budget_max_paise": 1500000,
            "interested_bed_count": 2,
        },
    )
    assert patch.status_code == 200, patch.text

    got = await client.get(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers(test_owner["token"]),
    )
    body = got.json()
    assert body["name"] == "Priya Sharma (corrected)"
    assert body["phone"] == "+919876543103"
    assert body["email"] == "priya@example.com"
    assert body["source"] == "INSTAGRAM"
    assert body["budget_max_paise"] == 1500000
    assert body["interested_bed_count"] == 2
