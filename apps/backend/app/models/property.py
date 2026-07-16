from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as PgEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address_line1: Mapped[str] = mapped_column(String(300), nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String(300), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    pincode: Mapped[str] = mapped_column(String(10), nullable=False)
    google_maps_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    amenities_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    floors: Mapped[list["Floor"]] = relationship(back_populates="property", cascade="all, delete-orphan")
    rooms: Mapped[list["Room"]] = relationship(back_populates="property")
    room_types: Mapped[list["RoomType"]] = relationship(back_populates="property")


class RoomType(Base):
    """Admin-defined room types per property. Not hardcoded."""
    __tablename__ = "room_types"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "Single AC", "Double Sharing"
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    monthly_base_rent_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amenities_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    property: Mapped["Property"] = relationship(back_populates="room_types")
    rooms: Mapped[list["Room"]] = relationship(back_populates="room_type")


class Floor(Base):
    __tablename__ = "floors"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    floor_number: Mapped[int] = mapped_column(Integer, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)  # "Ground Floor", "1st Floor"
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    property: Mapped["Property"] = relationship(back_populates="floors")
    rooms: Mapped[list["Room"]] = relationship(back_populates="floor", cascade="all, delete-orphan")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    floor_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    room_number: Mapped[str] = mapped_column(String(20), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    room_type_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("room_types.id"), nullable=True
    )
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    monthly_base_rent_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amenities_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(
        PgEnum("ACTIVE", "INACTIVE", "UNDER_MAINTENANCE", name="room_status_enum", create_type=False),
        nullable=False,
        default="ACTIVE",
    )
    has_ac: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    floor: Mapped["Floor"] = relationship(back_populates="rooms")
    property: Mapped["Property"] = relationship(back_populates="rooms")
    room_type: Mapped["RoomType | None"] = relationship(back_populates="rooms")
    beds: Mapped[list["Bed"]] = relationship(back_populates="room", cascade="all, delete-orphan")


class Bed(Base):
    __tablename__ = "beds"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    property_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    bed_label: Mapped[str] = mapped_column(String(20), nullable=False)  # "A", "B", "Left", "1", etc.
    status: Mapped[str] = mapped_column(
        PgEnum("VACANT", "OCCUPIED", "RESERVED", "MAINTENANCE", name="bed_status_enum", create_type=False),
        nullable=False,
        default="VACANT",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    room: Mapped["Room"] = relationship(back_populates="beds")
