"""
Property, floor, room, and bed endpoint tests.
Covers CRUD, RBAC, validation, and occupancy views.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


# ── Property list ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_properties_requires_auth(client: AsyncClient):
    """Unauthenticated request → 401."""
    response = await client.get("/api/v1/properties")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_list_properties_empty_for_new_org(
    client: AsyncClient, test_owner: dict
):
    """New org with no properties returns empty list."""
    response = await client.get(
        "/api/v1/properties",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_properties_returns_created(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """After a property is seeded, it appears in the list."""
    response = await client.get(
        "/api/v1/properties",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    ids = [item["id"] for item in data["items"]]
    assert str(test_property["property_id"]) in ids


# ── Create property ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_property_owner_succeeds(
    client: AsyncClient, test_owner: dict
):
    """OWNER can create a property."""
    response = await client.post(
        "/api/v1/properties",
        headers=auth_headers(test_owner["token"]),
        json={
            "name": "New PG Home",
            "address_line1": "45 Gandhi Rd",
            "city": "Bangalore",
            "state": "Karnataka",
            "pincode": "560001",
            "amenities": ["WIFI", "AC"],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "New PG Home"
    assert data["city"] == "Bangalore"


@pytest.mark.asyncio
async def test_create_property_partner_succeeds(
    client: AsyncClient, test_partner: dict
):
    """PARTNER can create a property."""
    response = await client.post(
        "/api/v1/properties",
        headers=auth_headers(test_partner["token"]),
        json={
            "name": "Partner PG",
            "address_line1": "10 MG Road",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600001",
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_property_supervisor_forbidden(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot create properties → 403."""
    response = await client.post(
        "/api/v1/properties",
        headers=auth_headers(test_supervisor["token"]),
        json={
            "name": "Blocked PG",
            "address_line1": "Nowhere St",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_property_missing_required_fields(
    client: AsyncClient, test_owner: dict
):
    """Missing required fields → 422."""
    response = await client.post(
        "/api/v1/properties",
        headers=auth_headers(test_owner["token"]),
        json={"name": "Incomplete"},
    )
    assert response.status_code == 422


# ── Get property detail ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_property_detail(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /properties/{id} returns property details."""
    response = await client.get(
        f"/api/v1/properties/{test_property['property_id']}",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(test_property["property_id"])
    assert data["name"] == "Test PG House"
    assert data["city"] == "Chennai"


@pytest.mark.asyncio
async def test_get_property_not_found(client: AsyncClient, test_owner: dict):
    """Non-existent property → 404."""
    response = await client.get(
        f"/api/v1/properties/{uuid.uuid4()}",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 404


# ── Update property ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_property(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """PUT /properties/{id} updates the property."""
    response = await client.put(
        f"/api/v1/properties/{test_property['property_id']}",
        headers=auth_headers(test_owner["token"]),
        json={"name": "Updated PG Name", "city": "Hyderabad"},
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Property updated"

    # Verify the update persisted
    get_resp = await client.get(
        f"/api/v1/properties/{test_property['property_id']}",
        headers=auth_headers(test_owner["token"]),
    )
    assert get_resp.json()["name"] == "Updated PG Name"


@pytest.mark.asyncio
async def test_update_property_no_fields_returns_400(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """PUT with empty body → 400."""
    response = await client.put(
        f"/api/v1/properties/{test_property['property_id']}",
        headers=auth_headers(test_owner["token"]),
        json={},
    )
    assert response.status_code == 400


# ── Property stats ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_property_stats_with_beds(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /properties/{id}/stats returns bed counts and occupancy rate."""
    response = await client.get(
        f"/api/v1/properties/{test_property['property_id']}/stats",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2  # 2 beds seeded
    assert data["vacant"] == 2  # both vacant
    assert data["occupied"] == 0
    assert "occupancy_rate" in data


@pytest.mark.asyncio
async def test_property_stats_with_occupied_bed(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """Stats reflect occupied bed after tenant check-in."""
    response = await client.get(
        f"/api/v1/properties/{test_tenant['property_id']}/stats",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["occupied"] == 1
    assert data["occupancy_rate"] == 50.0  # 1/2 beds


# ── Occupancy grid ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_property_occupancy_grid(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /properties/{id}/occupancy returns full floor/room/bed grid."""
    response = await client.get(
        f"/api/v1/properties/{test_property['property_id']}/occupancy",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert "floors" in data
    assert len(data["floors"]) == 1  # one floor seeded
    floor = data["floors"][0]
    assert floor["floor_number"] == 0
    assert len(floor["rooms"]) == 1
    room = floor["rooms"][0]
    assert room["room_number"] == "101"
    assert len(room["beds"]) == 2


# ── Vacant beds ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_vacant_beds_list(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /properties/{id}/vacant-beds lists only vacant beds."""
    response = await client.get(
        f"/api/v1/properties/{test_property['property_id']}/vacant-beds",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2  # both beds vacant before any tenant


@pytest.mark.asyncio
async def test_vacant_beds_decreases_after_checkin(
    client: AsyncClient, test_owner: dict, test_tenant: dict
):
    """After tenant check-in, vacant bed count decreases."""
    response = await client.get(
        f"/api/v1/properties/{test_tenant['property_id']}/vacant-beds",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1  # Bed A occupied by test_tenant, Bed B still vacant


# ── Floors ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_floor_to_property(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /properties/{id}/floors adds a floor."""
    response = await client.post(
        f"/api/v1/properties/{test_property['property_id']}/floors",
        headers=auth_headers(test_owner["token"]),
        json={"floor_number": 1, "display_name": "First Floor"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["floor_number"] == 1
    assert data["display_name"] == "First Floor"


# ── Room types ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_room_type(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /properties/{id}/room-types creates a room type."""
    response = await client.post(
        f"/api/v1/properties/{test_property['property_id']}/room-types",
        headers=auth_headers(test_owner["token"]),
        json={
            "name": "Deluxe Double",
            "capacity": 2,
            "monthly_base_rent_paise": 900000,
            "amenities": ["AC", "ATTACHED_BATHROOM"],
            "description": "Air conditioned double room",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Deluxe Double"
    assert data["monthly_base_rent_paise"] == 900000


@pytest.mark.asyncio
async def test_list_room_types(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """GET /properties/{id}/room-types lists active room types."""
    # Create one first
    await client.post(
        f"/api/v1/properties/{test_property['property_id']}/room-types",
        headers=auth_headers(test_owner["token"]),
        json={"name": "Single", "capacity": 1, "monthly_base_rent_paise": 500000},
    )
    response = await client.get(
        f"/api/v1/properties/{test_property['property_id']}/room-types",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) >= 1


# ── Rooms ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_room_with_auto_beds(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /properties/{id}/rooms creates room and auto-labels beds."""
    response = await client.post(
        f"/api/v1/properties/{test_property['property_id']}/rooms",
        headers=auth_headers(test_owner["token"]),
        json={
            "floor_id": str(test_property["floor_id"]),
            "room_number": "102",
            "display_name": "Room 102",
            "capacity": 3,
            "monthly_base_rent_paise": 650000,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["room_number"] == "102"
    assert data["beds_created"] == 3  # auto A, B, C


@pytest.mark.asyncio
async def test_create_room_with_custom_bed_labels(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /properties/{id}/rooms with explicit bed labels."""
    response = await client.post(
        f"/api/v1/properties/{test_property['property_id']}/rooms",
        headers=auth_headers(test_owner["token"]),
        json={
            "floor_id": str(test_property["floor_id"]),
            "room_number": "103",
            "display_name": "Room 103",
            "capacity": 2,
            "monthly_base_rent_paise": 600000,
            "bed_labels": ["Lower", "Upper"],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["beds_created"] == 2


@pytest.mark.asyncio
async def test_update_room(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """PATCH /rooms/{id} updates room fields."""
    response = await client.patch(
        f"/api/v1/rooms/{test_property['room_id']}",
        headers=auth_headers(test_owner["token"]),
        json={"display_name": "Premium Room 101", "monthly_base_rent_paise": 750000},
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Room updated"


@pytest.mark.asyncio
async def test_update_room_empty_body_returns_400(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    response = await client.patch(
        f"/api/v1/rooms/{test_property['room_id']}",
        headers=auth_headers(test_owner["token"]),
        json={},
    )
    assert response.status_code == 400


# ── Beds ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_bed_to_room(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """POST /rooms/{id}/beds adds a new bed."""
    response = await client.post(
        f"/api/v1/rooms/{test_property['room_id']}/beds",
        headers=auth_headers(test_owner["token"]),
        json={"bed_label": "C"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["bed_label"] == "C"
    assert data["status"] == "VACANT"


@pytest.mark.asyncio
async def test_update_bed_status(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    """PATCH /beds/{id} updates bed status."""
    bed_id = test_property["bed_ids"][1]  # Bed B (vacant)
    response = await client.patch(
        f"/api/v1/beds/{bed_id}",
        headers=auth_headers(test_owner["token"]),
        json={"status": "MAINTENANCE"},
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Bed updated"


@pytest.mark.asyncio
async def test_update_bed_empty_body_returns_400(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    bed_id = test_property["bed_ids"][0]
    response = await client.patch(
        f"/api/v1/beds/{bed_id}",
        headers=auth_headers(test_owner["token"]),
        json={},
    )
    assert response.status_code == 400
