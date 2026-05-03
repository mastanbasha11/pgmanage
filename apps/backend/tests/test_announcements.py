"""
Announcement and complaint endpoint tests.
Covers creation, listing, and complaint status updates.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


# ── Announcements ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_announcement_requires_auth(client: AsyncClient):
    response = await client.post("/api/v1/announcements", json={})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_announcement_success(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /announcements creates an announcement in DRAFT status."""
    response = await client.post(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "title": "Water supply interrupted",
            "body": "Water supply will be interrupted on Sunday 9am-12pm for maintenance.",
            "target_type": "ALL_TENANTS",
            "channels": ["APP"],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["status"] == "DRAFT"


@pytest.mark.asyncio
async def test_create_scheduled_announcement(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Announcement with scheduled_at is in SCHEDULED status."""
    response = await client.post(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "title": "Upcoming maintenance",
            "body": "Electrical maintenance on next Monday.",
            "scheduled_at": "2025-01-15T09:00:00Z",
        },
    )
    assert response.status_code == 201
    assert response.json()["status"] == "SCHEDULED"


@pytest.mark.asyncio
async def test_list_announcements_empty_initially(
    client: AsyncClient, test_owner: dict
):
    response = await client.get(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.asyncio
async def test_list_announcements_after_create(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Announcements appear in list after creation."""
    await client.post(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "title": "Test Notice",
            "body": "This is a test notice.",
        },
    )
    response = await client.get(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    assert len(response.json()["items"]) >= 1


@pytest.mark.asyncio
async def test_list_announcements_filter_by_property(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """?property_id filter works for announcements."""
    await client.post(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "title": "Filtered Notice",
            "body": "Property-specific notice.",
        },
    )
    response = await client.get(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) >= 1
    # Verify structure
    for item in items:
        assert "id" in item
        assert "title" in item
        assert "status" in item


@pytest.mark.asyncio
async def test_announcement_item_structure(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Announcement items have all required fields."""
    await client.post(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "title": "Structure Test",
            "body": "Verifying the response shape.",
        },
    )
    response = await client.get(
        "/api/v1/announcements",
        headers=auth_headers(test_owner["token"]),
    )
    items = response.json()["items"]
    if items:
        item = items[0]
        assert "id" in item
        assert "title" in item
        assert "body" in item
        assert "target_type" in item
        assert "status" in item
        assert "created_at" in item


# ── Complaints ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_complaint_requires_auth(client: AsyncClient):
    response = await client.post("/api/v1/complaints", json={})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_complaint_success(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /complaints creates a complaint with OPEN status."""
    response = await client.post(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "category": "MAINTENANCE",
            "description": "Ceiling fan not working in Room 101.",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "complaint_id" in data
    assert data["status"] == "OPEN"


@pytest.mark.asyncio
async def test_list_complaints_empty_initially(
    client: AsyncClient, test_owner: dict
):
    response = await client.get(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.asyncio
async def test_list_complaints_after_create(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """Complaints appear in list after creation."""
    await client.post(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "category": "CLEANLINESS",
            "description": "Common bathroom not clean.",
        },
    )
    response = await client.get(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    assert len(response.json()["items"]) >= 1


@pytest.mark.asyncio
async def test_list_complaints_filter_by_status(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """?status filter returns only complaints of that status."""
    await client.post(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "category": "NOISE",
            "description": "Loud music at night.",
        },
    )
    response = await client.get(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        params={"status": "OPEN"},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert all(item["status"] == "OPEN" for item in items)


@pytest.mark.asyncio
async def test_update_complaint_status(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """PATCH /complaints/{id} updates complaint status."""
    create_resp = await client.post(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "category": "MAINTENANCE",
            "description": "Broken lock on Room 101.",
        },
    )
    complaint_id = create_resp.json()["complaint_id"]

    response = await client.patch(
        f"/api/v1/complaints/{complaint_id}",
        headers=auth_headers(test_owner["token"]),
        json={"status": "IN_PROGRESS", "response_note": "Assigned to maintenance team."},
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Complaint updated"


@pytest.mark.asyncio
async def test_update_complaint_to_resolved(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Resolving a complaint sets resolved_at timestamp."""
    create_resp = await client.post(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "category": "SECURITY",
            "description": "Gate lock broken.",
        },
    )
    complaint_id = create_resp.json()["complaint_id"]

    response = await client.patch(
        f"/api/v1/complaints/{complaint_id}",
        headers=auth_headers(test_owner["token"]),
        json={"status": "RESOLVED", "response_note": "Lock replaced."},
    )
    assert response.status_code == 200

    # Verify resolved_at is set in DB
    schema = test_property["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    result = await db.execute(
        text("SELECT status, resolved_at FROM complaints WHERE id = :id"),
        {"id": str(complaint_id)},
    )
    row = result.fetchone()
    assert row is not None
    assert row[0] == "RESOLVED"
    assert row[1] is not None  # resolved_at should be set
    await db.commit()  # close implicit transaction before teardown


@pytest.mark.asyncio
async def test_update_complaint_empty_body_returns_400(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """PATCH with empty body → 400."""
    create_resp = await client.post(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "category": "OTHER",
            "description": "Test complaint.",
        },
    )
    complaint_id = create_resp.json()["complaint_id"]

    response = await client.patch(
        f"/api/v1/complaints/{complaint_id}",
        headers=auth_headers(test_owner["token"]),
        json={},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_list_complaints_filter_by_property(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """?property_id filter works for complaints."""
    await client.post(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "category": "FOOD",
            "description": "Food quality poor.",
        },
    )
    response = await client.get(
        "/api/v1/complaints",
        headers=auth_headers(test_owner["token"]),
        params={"property_id": str(test_property["property_id"])},
    )
    assert response.status_code == 200
    assert len(response.json()["items"]) >= 1
