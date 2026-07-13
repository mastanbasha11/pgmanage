"""Property, floor, room type, room, and bed management endpoints."""
from __future__ import annotations

import json
from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, get_org_schema_name, set_schema
from app.core.dependencies import (
    OrgContext,
    get_org_context,
    require_property_access,
    require_roles,
)
from app.core.exceptions import ConflictError, NotFoundError

router = APIRouter()


# ── Request bodies ────────────────────────────────────────────────────────────

class PropertyCreate(BaseModel):
    name: str
    address_line1: str
    address_line2: str | None = None
    city: str
    state: str
    pincode: str
    google_maps_url: str | None = None
    amenities: list[str] = []


class PropertyUpdate(BaseModel):
    name: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    google_maps_url: str | None = None
    amenities: list[str] | None = None


class FloorCreate(BaseModel):
    floor_number: int
    display_name: str


class RoomTypeCreate(BaseModel):
    name: str
    capacity: int = 1
    monthly_base_rent_paise: int
    amenities: list[str] = []
    description: str | None = None


class RoomCreate(BaseModel):
    floor_id: UUID
    room_type_id: UUID | None = None
    room_number: str
    display_name: str
    capacity: int | None = None
    monthly_base_rent_paise: int | None = None
    bed_labels: list[str] | None = None  # if None, auto-label A, B, C...


class RoomUpdate(BaseModel):
    room_number: str | None = None
    display_name: str | None = None
    status: str | None = None
    capacity: int | None = None
    room_type_id: UUID | None = None
    monthly_base_rent_paise: int | None = None


class BedCreate(BaseModel):
    bed_label: str


class BedUpdate(BaseModel):
    status: str | None = None
    bed_label: str | None = None


# ── Properties ────────────────────────────────────────────────────────────────

@router.get("/properties", summary="List all properties for org")
async def list_properties(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    is_active: bool = Query(True),
):
    """List properties with occupancy stats embedded for the dashboard cards."""
    result = await db.execute(
        text("""
            SELECT
                p.id, p.name, p.city, p.state, p.address_line1,
                p.is_active, p.created_at,
                COALESCE(b.total_beds, 0) AS total_beds,
                COALESCE(b.occupied_beds, 0) AS occupied_beds,
                COALESCE(b.vacant_beds, 0) AS vacant_beds
            FROM properties p
            LEFT JOIN (
                SELECT
                    property_id,
                    COUNT(*) AS total_beds,
                    COUNT(*) FILTER (WHERE status = 'OCCUPIED') AS occupied_beds,
                    COUNT(*) FILTER (WHERE status = 'VACANT') AS vacant_beds
                FROM beds
                GROUP BY property_id
            ) b ON b.property_id = p.id
            WHERE p.org_id = :org_id AND p.is_active = :is_active
            ORDER BY p.name
        """),
        {"org_id": str(ctx.org_id), "is_active": is_active},
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/properties", status_code=status.HTTP_201_CREATED, summary="Create property")
async def create_property(
    body: PropertyCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can create properties")

    result = await db.execute(
        text("""
            INSERT INTO properties (org_id, name, address_line1, address_line2, city, state, pincode, google_maps_url, amenities_json, created_by)
            VALUES (:org_id, :name, :addr1, :addr2, :city, :state, :pincode, :maps, CAST(:amenities AS jsonb), :creator)
            RETURNING id, name, city, state, is_active, created_at
        """),
        {
            "org_id": str(ctx.org_id), "name": body.name,
            "addr1": body.address_line1, "addr2": body.address_line2,
            "city": body.city, "state": body.state, "pincode": body.pincode,
            "maps": body.google_maps_url, "amenities": str(body.amenities).replace("'", '"'),
            "creator": str(ctx.user_id),
        },
    )
    row = result.mappings().fetchone()
    await db.commit()

    # SET LOCAL search_path is lost after commit — re-set it for the expense categories insert
    await set_schema(db, get_org_schema_name(ctx.org_id))

    # Seed default expense categories
    from app.models.expense import DEFAULT_EXPENSE_CATEGORIES
    for cat in DEFAULT_EXPENSE_CATEGORIES:
        await db.execute(
            text("INSERT INTO expense_categories (property_id, name, icon_name, is_default, sort_order) VALUES (:pid, :name, :icon, true, :sort)"),
            {"pid": str(row["id"]), "name": cat["name"], "icon": cat["icon_name"], "sort": cat["sort_order"]},
        )
    await db.commit()

    return dict(row)


@router.get("/properties/{property_id}", summary="Property detail")
async def get_property(
    property_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT * FROM properties WHERE id = :id AND org_id = :org_id"),
        {"id": str(property_id), "org_id": str(ctx.org_id)},
    )
    row = result.mappings().fetchone()
    if not row:
        raise NotFoundError("Property", property_id)
    return dict(row)


@router.put("/properties/{property_id}", summary="Update property")
async def update_property(
    property_id: UUID,
    body: PropertyUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = str(property_id)
    updates["org_id"] = str(ctx.org_id)

    await db.execute(
        text(f"UPDATE properties SET {set_clauses}, updated_at = NOW() WHERE id = :id AND org_id = :org_id"),
        updates,
    )
    await db.commit()
    return {"message": "Property updated"}


@router.get("/properties/{property_id}/stats", summary="Property occupancy stats")
async def property_stats(
    property_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'VACANT') AS vacant,
                COUNT(*) FILTER (WHERE status = 'OCCUPIED') AS occupied,
                COUNT(*) FILTER (WHERE status = 'RESERVED') AS reserved,
                COUNT(*) FILTER (WHERE status = 'MAINTENANCE') AS maintenance,
                COUNT(*) AS total
            FROM beds
            WHERE property_id = :pid
        """),
        {"pid": str(property_id)},
    )
    row = result.mappings().fetchone()
    stats = dict(row)
    total = stats["total"] or 1
    stats["occupancy_rate"] = round(stats["occupied"] / total * 100, 1)
    return stats


@router.get("/properties/{property_id}/occupancy", summary="Full building occupancy grid")
async def property_occupancy(
    property_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    floors_result = await db.execute(
        text("SELECT id, floor_number, display_name FROM floors WHERE property_id = :pid AND is_active = true ORDER BY floor_number"),
        {"pid": str(property_id)},
    )
    floors = floors_result.mappings().fetchall()

    occupancy = []
    for floor in floors:
        rooms_result = await db.execute(
            text("""
                SELECT r.id, r.room_number, r.display_name, r.capacity, r.status,
                       rt.name as room_type_name,
                       COUNT(b.id) FILTER (WHERE b.status = 'VACANT') as vacant_count,
                       COUNT(b.id) FILTER (WHERE b.status = 'OCCUPIED') as occupied_count,
                       COUNT(b.id) as total_beds
                FROM rooms r
                LEFT JOIN room_types rt ON rt.id = r.room_type_id
                LEFT JOIN beds b ON b.room_id = r.id
                WHERE r.floor_id = :floor_id
                GROUP BY r.id, rt.name
                ORDER BY r.room_number
            """),
            {"floor_id": str(floor["id"])},
        )
        rooms = rooms_result.mappings().fetchall()

        rooms_with_beds = []
        for room in rooms:
            beds_result = await db.execute(
                text("""
                    SELECT b.id, b.bed_label, b.status,
                           t.id as tenant_id, t.name as tenant_name
                    FROM beds b
                    LEFT JOIN tenants t ON t.bed_id = b.id AND t.status = 'ACTIVE'
                    WHERE b.room_id = :room_id
                    ORDER BY b.bed_label
                """),
                {"room_id": str(room["id"])},
            )
            beds = [dict(b) for b in beds_result.mappings().fetchall()]
            room_dict = dict(room)
            room_dict["beds"] = beds
            rooms_with_beds.append(room_dict)

        occupancy.append({
            **dict(floor),
            "rooms": rooms_with_beds,
        })

    return {"property_id": str(property_id), "floors": occupancy}


@router.get("/properties/{property_id}/vacant-beds", summary="List all vacant beds (+ upcoming vacancies)")
async def vacant_beds(
    property_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    include_upcoming: bool = Query(True),
    upcoming_within_days: int = Query(60, ge=0, le=180),
):
    """
    Returns currently-vacant beds AND (by default) upcoming vacancies — beds
    currently OCCUPIED by a tenant with an `expected_move_out_date` falling
    within the next ``upcoming_within_days`` days.

    Each row carries an ``available_from`` date and ``status`` ∈
    {"VACANT", "UPCOMING"} so the UI can render them in one chronological list.
    """
    rows: list[dict[str, Any]] = []

    cur_res = await db.execute(
        text("""
            SELECT b.id, b.bed_label,
                   r.id AS room_id, r.room_number, r.display_name AS room_name,
                   f.id AS floor_id, f.floor_number, f.display_name AS floor_name,
                   rt.name AS room_type,
                   r.monthly_base_rent_paise,
                   'VACANT' AS status,
                   CURRENT_DATE AS available_from,
                   NULL::text AS current_tenant_name,
                   NULL::uuid AS current_tenant_id
            FROM beds b
            JOIN rooms r ON r.id = b.room_id
            JOIN floors f ON f.id = r.floor_id
            LEFT JOIN room_types rt ON rt.id = r.room_type_id
            WHERE b.property_id = :pid AND b.status = 'VACANT' AND r.status = 'ACTIVE'
            ORDER BY f.floor_number, r.room_number, b.bed_label
        """),
        {"pid": str(property_id)},
    )
    rows.extend(dict(r) for r in cur_res.mappings().fetchall())

    if include_upcoming:
        from datetime import date as _date, timedelta as _td
        cutoff = _date.today() + _td(days=upcoming_within_days)
        up_res = await db.execute(
            text("""
                SELECT b.id, b.bed_label,
                       r.id AS room_id, r.room_number, r.display_name AS room_name,
                       f.id AS floor_id, f.floor_number, f.display_name AS floor_name,
                       rt.name AS room_type,
                       r.monthly_base_rent_paise,
                       'UPCOMING' AS status,
                       t.expected_move_out_date AS available_from,
                       t.name AS current_tenant_name,
                       t.id AS current_tenant_id
                FROM beds b
                JOIN rooms r ON r.id = b.room_id
                JOIN floors f ON f.id = r.floor_id
                LEFT JOIN room_types rt ON rt.id = r.room_type_id
                JOIN tenants t ON t.bed_id = b.id AND t.status = 'ACTIVE'
                WHERE b.property_id = :pid
                  AND b.status = 'OCCUPIED'
                  AND r.status = 'ACTIVE'
                  AND t.expected_move_out_date IS NOT NULL
                  AND t.expected_move_out_date >= CURRENT_DATE
                  AND t.expected_move_out_date <= :cutoff
                ORDER BY t.expected_move_out_date, f.floor_number, r.room_number, b.bed_label
            """),
            {"pid": str(property_id), "cutoff": cutoff},
        )
        rows.extend(dict(r) for r in up_res.mappings().fetchall())

    return {
        "items": rows,
        "total": len(rows),
        "vacant_count": sum(1 for r in rows if r["status"] == "VACANT"),
        "upcoming_count": sum(1 for r in rows if r["status"] == "UPCOMING"),
    }


# ── Floors ────────────────────────────────────────────────────────────────────

@router.post("/properties/{property_id}/floors", status_code=201, summary="Add floor to property")
async def add_floor(
    property_id: UUID,
    body: FloorCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    # Prevent duplicate floor_number per property
    dup = await db.execute(
        text("""
            SELECT id FROM floors
            WHERE property_id = :pid AND (floor_number = :num OR display_name = :name)
              AND is_active = true
        """),
        {"pid": str(property_id), "num": body.floor_number, "name": body.display_name},
    )
    if dup.scalar_one_or_none():
        raise ConflictError("A floor with this number or name already exists in this property")

    result = await db.execute(
        text("INSERT INTO floors (property_id, floor_number, display_name) VALUES (:pid, :num, :name) RETURNING id, floor_number, display_name"),
        {"pid": str(property_id), "num": body.floor_number, "name": body.display_name},
    )
    row = result.mappings().fetchone()
    await db.commit()
    return dict(row)


@router.patch("/floors/{floor_id}", summary="Update floor")
async def update_floor(
    floor_id: UUID,
    body: FloorCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            UPDATE floors
            SET floor_number = :num, display_name = :name, updated_at = NOW()
            WHERE id = :id
        """),
        {"id": str(floor_id), "num": body.floor_number, "name": body.display_name},
    )
    await db.commit()
    return {"message": "Floor updated"}


@router.delete("/floors/{floor_id}", summary="Delete a floor (only if it has no rooms)")
async def delete_floor(
    floor_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    rooms_check = await db.execute(
        text("SELECT COUNT(*) FROM rooms WHERE floor_id = :id"),
        {"id": str(floor_id)},
    )
    if (rooms_check.scalar() or 0) > 0:
        raise ConflictError("Floor has rooms; remove or move them before deleting the floor.")
    await db.execute(text("DELETE FROM floors WHERE id = :id"), {"id": str(floor_id)})
    await db.commit()
    return {"message": "Floor deleted"}


# ── Room Types ────────────────────────────────────────────────────────────────

@router.get("/properties/{property_id}/room-types", summary="List room types")
async def list_room_types(
    property_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT * FROM room_types WHERE property_id = :pid AND is_active = true ORDER BY name"),
        {"pid": str(property_id)},
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows]}


@router.post("/properties/{property_id}/room-types", status_code=201, summary="Create room type")
async def create_room_type(
    property_id: UUID,
    body: RoomTypeCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    import json
    # Prevent duplicate room type names within the same property
    dup = await db.execute(
        text("""
            SELECT id FROM room_types
            WHERE property_id = :pid AND lower(name) = lower(:name) AND is_active = true
        """),
        {"pid": str(property_id), "name": body.name},
    )
    if dup.scalar_one_or_none():
        raise ConflictError(f"A room type named '{body.name}' already exists in this property")

    result = await db.execute(
        text("""
            INSERT INTO room_types (property_id, name, capacity, monthly_base_rent_paise, amenities_json, description)
            VALUES (:pid, :name, :cap, :rent, CAST(:amenities AS jsonb), :desc)
            RETURNING id, name, capacity, monthly_base_rent_paise
        """),
        {
            "pid": str(property_id), "name": body.name, "cap": body.capacity,
            "rent": body.monthly_base_rent_paise, "amenities": json.dumps(body.amenities),
            "desc": body.description,
        },
    )
    row = result.mappings().fetchone()
    await db.commit()
    return dict(row)


@router.patch("/room-types/{room_type_id}", summary="Update a room type")
async def update_room_type(
    room_type_id: UUID,
    body: RoomTypeCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    import json
    await db.execute(
        text("""
            UPDATE room_types
            SET name = :name, capacity = :cap, monthly_base_rent_paise = :rent,
                amenities_json = CAST(:amenities AS jsonb), description = :desc, updated_at = NOW()
            WHERE id = :id
        """),
        {
            "id": str(room_type_id), "name": body.name, "cap": body.capacity,
            "rent": body.monthly_base_rent_paise, "amenities": json.dumps(body.amenities),
            "desc": body.description,
        },
    )
    await db.commit()
    return {"message": "Room type updated"}


@router.delete("/room-types/{room_type_id}", summary="Delete a room type")
async def delete_room_type(
    room_type_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    rooms_check = await db.execute(
        text("SELECT COUNT(*) FROM rooms WHERE room_type_id = :id"),
        {"id": str(room_type_id)},
    )
    if (rooms_check.scalar() or 0) > 0:
        raise ConflictError(
            "This room type is in use by existing rooms; reassign those rooms first."
        )
    await db.execute(
        text("UPDATE room_types SET is_active = false WHERE id = :id"),
        {"id": str(room_type_id)},
    )
    await db.commit()
    return {"message": "Room type removed"}


# ── Rooms ─────────────────────────────────────────────────────────────────────

@router.post("/properties/{property_id}/rooms", status_code=201, summary="Add room")
async def create_room(
    property_id: UUID,
    body: RoomCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    # Prevent duplicate room number on the same floor
    dup = await db.execute(
        text("""
            SELECT id FROM rooms
            WHERE floor_id = :floor_id AND room_number = :rn
        """),
        {"floor_id": str(body.floor_id), "rn": body.room_number},
    )
    if dup.scalar_one_or_none():
        raise ConflictError(f"Room {body.room_number} already exists on this floor")

    # Get base rent from room type if not overridden
    capacity = body.capacity
    rent = body.monthly_base_rent_paise

    if body.room_type_id and (capacity is None or rent is None):
        rt = await db.execute(
            text("SELECT capacity, monthly_base_rent_paise FROM room_types WHERE id = :id"),
            {"id": str(body.room_type_id)},
        )
        rt_row = rt.mappings().fetchone()
        if rt_row:
            capacity = capacity or rt_row["capacity"]
            rent = rent or rt_row["monthly_base_rent_paise"]

    capacity = capacity or 1
    rent = rent or 0

    room_result = await db.execute(
        text("""
            INSERT INTO rooms (floor_id, property_id, org_id, room_number, display_name, room_type_id, capacity, monthly_base_rent_paise)
            VALUES (:floor_id, :pid, :org_id, :room_num, :display, :rt_id, :cap, :rent)
            RETURNING id, room_number, display_name, capacity
        """),
        {
            "floor_id": str(body.floor_id), "pid": str(property_id), "org_id": str(ctx.org_id),
            "room_num": body.room_number, "display": body.display_name,
            "rt_id": str(body.room_type_id) if body.room_type_id else None,
            "cap": capacity, "rent": rent,
        },
    )
    room = room_result.mappings().fetchone()
    room_id = room["id"]

    # Create beds
    bed_labels = body.bed_labels
    if not bed_labels:
        # Auto-label: 1 bed → ["A"], 2 → ["A","B"], 3 → ["A","B","C"]
        bed_labels = [chr(65 + i) for i in range(capacity)]

    for label in bed_labels:
        await db.execute(
            text("INSERT INTO beds (room_id, property_id, bed_label) VALUES (:room_id, :pid, :label)"),
            {"room_id": str(room_id), "pid": str(property_id), "label": label},
        )

    await db.commit()
    return {**dict(room), "beds_created": len(bed_labels)}


@router.patch("/rooms/{room_id}", summary="Update room")
async def update_room(
    room_id: UUID,
    body: RoomUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    # Dup-check if renaming room_number
    if "room_number" in updates:
        floor_q = await db.execute(
            text("SELECT floor_id FROM rooms WHERE id = :id"), {"id": str(room_id)}
        )
        floor_row = floor_q.mappings().fetchone()
        if floor_row:
            dup = await db.execute(
                text(
                    "SELECT id FROM rooms WHERE floor_id = :fid AND room_number = :rn AND id <> :rid"
                ),
                {"fid": str(floor_row["floor_id"]), "rn": updates["room_number"], "rid": str(room_id)},
            )
            if dup.scalar_one_or_none():
                raise ConflictError(
                    f"Room {updates['room_number']} already exists on this floor"
                )

    if "room_type_id" in updates:
        updates["room_type_id"] = str(updates["room_type_id"])
    if "status" in updates:
        # status is an enum on rooms — coerce in the SQL
        pass

    set_parts = []
    for k in updates:
        if k == "status":
            set_parts.append("status = CAST(:status AS room_status_enum)")
        else:
            set_parts.append(f"{k} = :{k}")
    set_clauses = ", ".join(set_parts)
    updates["room_id"] = str(room_id)
    await db.execute(
        text(f"UPDATE rooms SET {set_clauses}, updated_at = NOW() WHERE id = :room_id"),
        updates,
    )
    await db.commit()
    return {"message": "Room updated"}


@router.delete("/rooms/{room_id}", summary="Delete a room (only if no occupied beds)")
async def delete_room(
    room_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    occ_check = await db.execute(
        text("""
            SELECT COUNT(*) FROM beds
            WHERE room_id = :id AND status IN ('OCCUPIED', 'RESERVED')
        """),
        {"id": str(room_id)},
    )
    if (occ_check.scalar() or 0) > 0:
        raise ConflictError(
            "This room has occupied or reserved beds; check tenants out first."
        )
    # Cascading delete of beds, then the room.
    await db.execute(text("DELETE FROM beds WHERE room_id = :id"), {"id": str(room_id)})
    await db.execute(text("DELETE FROM rooms WHERE id = :id"), {"id": str(room_id)})
    await db.commit()
    return {"message": "Room deleted"}


# ── Beds ──────────────────────────────────────────────────────────────────────

@router.post("/rooms/{room_id}/beds", status_code=201, summary="Add bed to room")
async def add_bed(
    room_id: UUID,
    body: BedCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    # Get property_id from room
    room = await db.execute(
        text("SELECT property_id FROM rooms WHERE id = :id"), {"id": str(room_id)}
    )
    row = room.mappings().fetchone()
    if not row:
        raise NotFoundError("Room", room_id)

    result = await db.execute(
        text("INSERT INTO beds (room_id, property_id, bed_label) VALUES (:room_id, :pid, :label) RETURNING id, bed_label, status"),
        {"room_id": str(room_id), "pid": str(row["property_id"]), "label": body.bed_label},
    )
    bed = result.mappings().fetchone()
    await db.commit()
    return dict(bed)


@router.patch("/beds/{bed_id}", summary="Update bed status or label")
async def update_bed(
    bed_id: UUID,
    body: BedUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["bed_id"] = str(bed_id)
    await db.execute(
        text(f"UPDATE beds SET {set_clauses}, updated_at = NOW() WHERE id = :bed_id"), updates
    )
    await db.commit()
    return {"message": "Bed updated"}


# ── Billing periods (fiscal-month overrides) ──────────────────────────────────

class BillingPeriodSet(BaseModel):
    close_date: date | None = None
    opening_balance_paise: int | None = None
    notes: str | None = None


@router.patch("/properties/{property_id}/settlement-day", summary="Update default settlement day")
async def set_settlement_day(
    property_id: UUID,
    body: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can change settlement day")
    day = int(body.get("settlement_day", 10))
    if day < 1 or day > 28:
        raise HTTPException(400, "settlement_day must be 1-28")
    await db.execute(
        text("UPDATE properties SET settlement_day = :d, updated_at = NOW() "
             "WHERE id = :id AND org_id = :org_id"),
        {"d": day, "id": str(property_id), "org_id": str(ctx.org_id)},
    )
    await db.commit()
    return {"message": "Settlement day updated", "settlement_day": day}


@router.get(
    "/properties/{property_id}/billing-period/{year}/{month}",
    summary="Compute the fiscal period for a (property, month, year)",
)
async def get_billing_period(
    property_id: UUID,
    year: int,
    month: int,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as _date
    from app.services.billing_period import get_fiscal_period
    p = await get_fiscal_period(property_id, month, year, db)
    ob_row = (await db.execute(
        text(
            "SELECT opening_balance_paise FROM billing_periods "
            "WHERE property_id = :pid AND period_month = :m AND period_year = :y"
        ),
        {"pid": str(property_id), "m": month, "y": year},
    )).scalar_one_or_none()
    return {
        "property_id": str(property_id),
        "month": month,
        "year": year,
        "period_start": str(p.period_start),
        "period_end": str(p.period_end),
        "settlement_day": p.settlement_day,
        "overridden": p.overridden,
        "prev_overridden": p.prev_overridden,
        "opening_balance_paise": int(ob_row or 0),
        "today": str(_date.today()),
    }


@router.put(
    "/properties/{property_id}/billing-period/{year}/{month}",
    summary="Set or update the close date for a (month, year). Pass null close_date to clear.",
)
async def set_billing_period(
    property_id: UUID,
    year: int,
    month: int,
    body: BillingPeriodSet,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can set the close date")
    if month < 1 or month > 12:
        raise HTTPException(400, "Invalid month")
    if body.close_date is not None:
        # Sanity: close_date must be in the (month, year) ± a small grace
        # window — calendar month or up to ~20 days into the next month.
        if body.close_date.year != year or body.close_date.month not in (month, month % 12 + 1):
            raise HTTPException(
                400,
                "close_date should fall in the named month or the first ~20 days of the next month",
            )
    if body.close_date is None and body.opening_balance_paise is None:
        raise HTTPException(400, "Nothing to set — provide close_date and/or opening_balance_paise")
    ob = max(int(body.opening_balance_paise or 0), 0)
    await db.execute(
        text("""
            INSERT INTO billing_periods
                (property_id, period_month, period_year, close_date, opening_balance_paise, notes)
            VALUES (:pid, :m, :y, :d, :ob, :n)
            ON CONFLICT (property_id, period_month, period_year)
            DO UPDATE SET
                close_date = COALESCE(EXCLUDED.close_date, billing_periods.close_date),
                opening_balance_paise = CASE
                    WHEN :ob_set THEN EXCLUDED.opening_balance_paise
                    ELSE billing_periods.opening_balance_paise
                END,
                notes = COALESCE(EXCLUDED.notes, billing_periods.notes),
                updated_at = NOW()
        """),
        {
            "pid": str(property_id), "m": month, "y": year,
            "d": body.close_date,
            "ob": ob,
            "ob_set": body.opening_balance_paise is not None,
            "n": body.notes,
        },
    )
    await db.commit()
    return {
        "message": "Billing period saved",
        "close_date": str(body.close_date) if body.close_date else None,
        "opening_balance_paise": ob,
    }


@router.delete(
    "/properties/{property_id}/billing-period/{year}/{month}",
    summary="Clear the per-month override (fall back to settlement_day)",
)
async def clear_billing_period(
    property_id: UUID,
    year: int,
    month: int,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners can clear billing periods")
    await db.execute(
        text("""
            DELETE FROM billing_periods
            WHERE property_id = :pid AND period_month = :m AND period_year = :y
        """),
        {"pid": str(property_id), "m": month, "y": year},
    )
    await db.commit()
    return {"message": "Override removed"}


# ── WhatsApp settings (per-property) + test send ──────────────────────────────

class WhatsAppSettings(BaseModel):
    """
    Per-property WhatsApp Cloud API config + payment handle.

    `whatsapp_phone_number_id` is the long numeric id Meta shows in WhatsApp
    Manager → Phone Numbers; `whatsapp_number` is the human-readable +91…
    used for display + click-to-chat. `whatsapp_access_token` is a long-lived
    System User token (kept plaintext here; future work can move it to
    Secrets Manager — the service layer already prefers `..._secret_arn`
    when present). `upi_vpa` lands in the {{5}} placeholder of the
    `rent_reminder` template so tenants can tap to pay.

    Pass `null` to clear a field; omit it to leave unchanged.
    """

    whatsapp_phone_number_id: str | None = None
    whatsapp_number: str | None = None
    whatsapp_access_token: str | None = None
    upi_vpa: str | None = None
    # Optional Meta template overrides. NULL/omitted → use defaults (template
    # names "rent_reminder" / "rent_overdue", language "en_US").
    wa_rent_reminder_template_name: str | None = None
    wa_rent_reminder_template_language: str | None = None
    wa_rent_overdue_template_name: str | None = None
    wa_rent_overdue_template_language: str | None = None
    # Per-template param mapping. List of {"kind": "variable"|"static",
    # "key": str, "value": str} dicts — one per `{{N}}` placeholder, in order.
    # `[]` means a 0-param template (e.g. Meta's hello_world). NULL/omitted
    # → fall back to the legacy hardcoded ordered list for that template.
    wa_rent_reminder_template_params: list[dict] | None = None
    wa_rent_overdue_template_params: list[dict] | None = None


@router.get("/properties/{property_id}/whatsapp", summary="Read WhatsApp + UPI settings")
async def get_whatsapp_settings(
    property_id: UUID,
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER"])),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            text(
                "SELECT whatsapp_phone_number_id, whatsapp_number, upi_vpa, "
                "       wa_rent_reminder_template_name, wa_rent_reminder_template_language, "
                "       wa_rent_reminder_template_params, "
                "       wa_rent_overdue_template_name,  wa_rent_overdue_template_language, "
                "       wa_rent_overdue_template_params, "
                "       (whatsapp_access_token IS NOT NULL OR "
                "        whatsapp_access_token_secret_arn IS NOT NULL) AS has_token "
                "FROM properties WHERE id = :id AND org_id = :org_id"
            ),
            {"id": str(property_id), "org_id": str(ctx.org_id)},
        )
    ).mappings().fetchone()
    if not row:
        raise NotFoundError("Property", str(property_id))
    return {
        "whatsapp_phone_number_id": row["whatsapp_phone_number_id"],
        "whatsapp_number": row["whatsapp_number"],
        "upi_vpa": row["upi_vpa"],
        "has_access_token": bool(row["has_token"]),
        "wa_rent_reminder_template_name":     row["wa_rent_reminder_template_name"],
        "wa_rent_reminder_template_language": row["wa_rent_reminder_template_language"],
        "wa_rent_reminder_template_params":   row["wa_rent_reminder_template_params"],
        "wa_rent_overdue_template_name":      row["wa_rent_overdue_template_name"],
        "wa_rent_overdue_template_language":  row["wa_rent_overdue_template_language"],
        "wa_rent_overdue_template_params":    row["wa_rent_overdue_template_params"],
    }


@router.patch("/properties/{property_id}/whatsapp", summary="Update WhatsApp + UPI settings")
async def update_whatsapp_settings(
    property_id: UUID,
    body: WhatsAppSettings,
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER"])),
    db: AsyncSession = Depends(get_db),
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "No fields to update")

    # Verify the property belongs to this org (defence in depth on top of search_path).
    exists = (
        await db.execute(
            text("SELECT 1 FROM properties WHERE id = :id AND org_id = :org"),
            {"id": str(property_id), "org": str(ctx.org_id)},
        )
    ).scalar()
    if not exists:
        raise NotFoundError("Property", str(property_id))

    # JSONB columns must be bound as text + cast in SQL, otherwise psycopg
    # tries to send Python list → JSONB and fails with "invalid input
    # syntax for type jsonb".
    JSONB_COLS = {"wa_rent_reminder_template_params", "wa_rent_overdue_template_params"}

    set_parts: list[str] = []
    params: dict[str, Any] = {"id": str(property_id)}
    for k, v in fields.items():
        if k in JSONB_COLS:
            set_parts.append(f"{k} = CAST(:{k} AS jsonb)")
            params[k] = json.dumps(v) if v is not None else None
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v
    set_clause = ", ".join(set_parts)
    await db.execute(
        text(f"UPDATE properties SET {set_clause}, updated_at = NOW() WHERE id = :id"),
        params,
    )

    # Keep public.whatsapp_routing in sync so inbound webhooks know which
    # org/property owns this phone_number_id.
    if body.whatsapp_phone_number_id:
        schema_name = get_org_schema_name(ctx.org_id)
        await db.execute(
            text(
                """
                INSERT INTO public.whatsapp_routing
                    (phone_number_id, org_id, schema_name, property_id, whatsapp_number)
                VALUES (:pnid, :org, :schema, :pid, :wa_num)
                ON CONFLICT (phone_number_id) DO UPDATE SET
                    org_id = EXCLUDED.org_id,
                    schema_name = EXCLUDED.schema_name,
                    property_id = EXCLUDED.property_id,
                    whatsapp_number = COALESCE(EXCLUDED.whatsapp_number,
                                               public.whatsapp_routing.whatsapp_number)
                """
            ),
            {
                "pnid": body.whatsapp_phone_number_id,
                "org": str(ctx.org_id),
                "schema": schema_name,
                "pid": str(property_id),
                "wa_num": body.whatsapp_number,
            },
        )
    await db.commit()
    return {"message": "WhatsApp settings saved"}


class WhatsAppTestSend(BaseModel):
    """Body for the manual smoke-test send (Settings → 'Send test')."""

    to_phone: str            # any number you want to ping
    template_name: str = "rent_reminder"


@router.post("/properties/{property_id}/whatsapp/test-send", summary="Send a one-off test message")
async def whatsapp_test_send(
    property_id: UUID,
    body: WhatsAppTestSend,
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Fires a single template message to verify Meta credentials + template
    approval before the scheduler runs. Uses harmless placeholder params for
    the well-known templates; for anything else, params default to ["Test"].
    Returns the Meta response so the owner can see why it failed (template not
    approved, phone not in test list, etc.).
    """
    from app.services.notification_service import send_whatsapp_template

    # Confirm property is in this org.
    exists = (
        await db.execute(
            text("SELECT 1 FROM properties WHERE id = :id AND org_id = :org"),
            {"id": str(property_id), "org": str(ctx.org_id)},
        )
    ).scalar()
    if not exists:
        raise NotFoundError("Property", str(property_id))

    # Legacy ordered fallback (used when the property hasn't run the wizard
    # yet and there's no per-template params config saved on the DB).
    if body.template_name == "rent_reminder":
        legacy = ["Test Tenant", "₹1,000", "June 2026", "10 Jun 2026", "demo@upi"]
    elif body.template_name == "rent_overdue":
        legacy = ["Test Tenant", "₹1,000", "June 2026", "+919999999999"]
    elif body.template_name == "welcome_checkin":
        legacy = ["Test Tenant", "Demo Property", "101", "A", "01 Jun 2026"]
    else:
        legacy = ["Test"]

    # Sample-data context the wizard variables resolve against. When the
    # owner has configured per-property params, this is what fills them in.
    test_context = {
        "tenant_name": "Test Tenant",
        "tenant_first_name": "Test",
        "amount_rupees": "₹1,000",
        "month_name": "June 2026",
        "due_date": "10 Jun 2026",
        "days_overdue": "7",
        "upi_vpa": "demo@upi",
        "property_name": "Demo Property",
        "room_label": "101·A",
        "manager_phone": "+919999999999",
    }

    result = await send_whatsapp_template(
        to_phone=body.to_phone,
        template_name=body.template_name,
        template_params=legacy,
        property_id=property_id,
        db=db,
        context=test_context,
    )
    return result


@router.get(
    "/whatsapp/template-variables",
    summary="Catalogue of dynamic variables available in WhatsApp templates",
)
async def whatsapp_template_variables(
    ctx: OrgContext = Depends(require_roles(["OWNER", "PARTNER"])),  # noqa: ARG001
):
    """
    Returns the per-template catalogue used by the Templates wizard. The
    wizard pastes the user's template body, detects `{{N}}` placeholders,
    and shows this list in a dropdown next to each placeholder so the
    owner can pick which value goes where (or type a static string).

    Each variable has:
      - key:     stable id used in the saved params config
      - label:   human-readable description shown in the dropdown
      - example: a sample value shown in the wizard's preview pane
    """
    from app.services.notification_service import BUILT_IN_VARIABLES
    return BUILT_IN_VARIABLES


# ── ROI Payback Plan ─────────────────────────────────────────────────────────

class PaybackPlanUpdate(BaseModel):
    investment_paise: int | None = None
    target_months: int | None = None
    grace_months: int | None = None
    lessor_rent_paise: int | None = None
    plan_start_date: date | None = None


def _compute_payback(
    investment: int,
    target_months: int,
    grace_months: int,
    lessor_rent: int,
) -> dict:
    """Grace = lessor rent is fully waived. Post-grace = full rent applies.

    Break-even:   G·P_grace + (T−G)·P_regular = I
    Constraint:   P_regular = P_grace − lessor_rent
    Solving:      P_grace = (I + (T−G)·lessor_rent) / T
    """
    if target_months <= 0:
        return {"error": "target_months must be > 0"}
    if grace_months < 0 or grace_months > target_months:
        return {"error": "grace_months must be between 0 and target_months"}
    p_grace = (investment + (target_months - grace_months) * lessor_rent) / target_months
    p_regular = p_grace - lessor_rent
    return {
        "grace_month_profit_paise": int(round(p_grace)),
        "regular_month_profit_paise": int(round(p_regular)),
        "grace_period_total_paise": int(round(p_grace * grace_months)),
        "regular_period_total_paise": int(round(p_regular * (target_months - grace_months))),
    }


@router.get(
    "/properties/{property_id}/payback-plan",
    summary="Payback plan (investment vs target profit) + actual tracking",
)
async def get_payback_plan(
    property_id: UUID,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        text("""
            SELECT roi_investment_paise, roi_target_months, roi_grace_months,
                   roi_lessor_rent_paise, roi_plan_start_date
            FROM properties WHERE id = :pid
        """),
        {"pid": str(property_id)},
    )).mappings().fetchone()
    if not row:
        raise HTTPException(404, "Property not found")

    plan = {
        "investment_paise": row["roi_investment_paise"],
        "target_months": row["roi_target_months"],
        "grace_months": row["roi_grace_months"],
        "lessor_rent_paise": row["roi_lessor_rent_paise"],
        "plan_start_date": row["roi_plan_start_date"].isoformat() if row["roi_plan_start_date"] else None,
    }
    configured = all(
        plan[k] is not None
        for k in ("investment_paise", "target_months", "grace_months", "lessor_rent_paise")
    )

    # Owners breakdown from the team roster.
    owners_res = await db.execute(
        text("""
            SELECT name, share_pct, capital_paise
            FROM property_team
            WHERE property_id = :pid AND is_active = true
              AND role = 'OWNER'::team_role_enum
            ORDER BY sort_order, name
        """),
        {"pid": str(property_id)},
    )
    owners = [dict(r) for r in owners_res.mappings().fetchall()]

    result: dict = {"plan": plan, "configured": configured, "owners": owners}
    if not configured:
        return result

    calc = _compute_payback(
        int(plan["investment_paise"] or 0),
        int(plan["target_months"] or 0),
        int(plan["grace_months"] or 0),
        int(plan["lessor_rent_paise"] or 0),
    )
    if "error" in calc:
        result["calc"] = calc
        return result

    # Per-owner monthly numbers.
    per_owner = []
    for o in owners:
        pct = float(o["share_pct"] or 0)
        per_owner.append({
            "name": o["name"],
            "share_pct": pct,
            "capital_paise": o["capital_paise"],
            "grace_month_share_paise": int(round(calc["grace_month_profit_paise"] * pct / 100)),
            "regular_month_share_paise": int(round(calc["regular_month_profit_paise"] * pct / 100)),
        })

    # Actual-vs-projected: cumulative net_income since the plan_start_date
    # (fiscal-window rule applies to the monthly totals — we just sum the
    # per-month dashboard math without re-doing it here).
    actual_cumulative_paise = 0
    months_elapsed = 0
    if plan["plan_start_date"]:
        from datetime import date as _date
        start = row["roi_plan_start_date"]
        today = _date.today()
        # Whole calendar months between start and today (rounded down)
        months_elapsed = max(
            0,
            (today.year - start.year) * 12 + (today.month - start.month),
        )

        # Cumulative rent-in-period + advance + power − expenses − refunds,
        # by calendar month (we don't re-do fiscal-window here; the accuracy
        # is good enough for a payback tracker).
        cum_res = await db.execute(
            text(f"""
                WITH inc AS (
                    SELECT SUM(amount_paise) AS a
                    FROM payments
                    WHERE property_id = :pid AND is_deleted = false
                      AND payment_type IN ('RENT','ADVANCE','DEPOSIT','POWER')
                      AND (collected_at AT TIME ZONE 'Asia/Kolkata')::date >= :start
                ),
                bkg AS (
                    SELECT SUM(amount_paise) AS a
                    FROM bookings
                    WHERE property_id = :pid AND is_deleted = false
                      AND collected_at::date >= :start
                ),
                exp AS (
                    SELECT SUM(amount_paise) AS a
                    FROM expenses
                    WHERE property_id = :pid AND is_deleted = false
                      AND approval_status = 'APPROVED'::expense_approval_enum
                      AND purchase_date >= :start
                ),
                ref AS (
                    SELECT SUM(amount_paise) AS a
                    FROM payments
                    WHERE property_id = :pid AND is_deleted = false
                      AND payment_type = 'REFUND'
                      AND (collected_at AT TIME ZONE 'Asia/Kolkata')::date >= :start
                )
                SELECT COALESCE((SELECT a FROM inc), 0)
                     + COALESCE((SELECT a FROM bkg), 0)
                     - COALESCE((SELECT a FROM exp), 0)
                     - COALESCE((SELECT a FROM ref), 0) AS net
            """),
            {"pid": str(property_id), "start": start},
        )
        actual_cumulative_paise = int(cum_res.scalar() or 0)

    # Expected cumulative by now: grace months at P_grace, remainder at P_regular.
    if months_elapsed > 0:
        g = min(months_elapsed, int(plan["grace_months"] or 0))
        r = months_elapsed - g
        expected_cumulative_paise = int(
            g * calc["grace_month_profit_paise"] + r * calc["regular_month_profit_paise"]
        )
    else:
        expected_cumulative_paise = 0

    result.update({
        "calc": calc,
        "per_owner": per_owner,
        "months_elapsed": months_elapsed,
        "actual_cumulative_paise": actual_cumulative_paise,
        "expected_cumulative_paise": expected_cumulative_paise,
    })
    return result


@router.put(
    "/properties/{property_id}/payback-plan",
    summary="Set or update the ROI payback plan",
)
async def set_payback_plan(
    property_id: UUID,
    body: PaybackPlanUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Only owners or partners can edit the payback plan")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "Nothing to update")

    key_map = {
        "investment_paise": "roi_investment_paise",
        "target_months": "roi_target_months",
        "grace_months": "roi_grace_months",
        "lessor_rent_paise": "roi_lessor_rent_paise",
        "plan_start_date": "roi_plan_start_date",
    }
    set_parts = []
    params: dict[str, object] = {"pid": str(property_id)}
    for k, v in updates.items():
        col = key_map[k]
        set_parts.append(f"{col} = :{col}")
        params[col] = v

    res = await db.execute(
        text(f"UPDATE properties SET {', '.join(set_parts)}, updated_at = NOW() WHERE id = :pid"),
        params,
    )
    if res.rowcount == 0:
        raise HTTPException(404, "Property not found")
    await db.commit()
    return {"message": "Payback plan saved"}
