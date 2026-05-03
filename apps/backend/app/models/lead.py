from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, Enum as PgEnum, ForeignKey,
    Index, Integer, String, Text, func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
        Index("ix_leads_property_status", "property_id", "status"),
        Index("ix_leads_followup", "next_followup_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    whatsapp_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    source: Mapped[str] = mapped_column(
        PgEnum(
            "META_AD", "INSTAGRAM", "REFERRAL", "WALKIN", "JUSTDIAL", "OTHER",
            name="lead_source_enum",
            create_type=False,
        ),
        nullable=False,
        default="OTHER",
    )
    source_campaign_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    interested_room_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interested_bed_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    budget_min_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    budget_max_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_move_in_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(
        PgEnum(
            "NEW", "CONTACTED", "SITE_VISITED", "NEGOTIATING", "CONVERTED", "LOST",
            name="lead_status_enum",
            create_type=False,
        ),
        nullable=False,
        default="NEW",
        index=True,
    )
    lost_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    converted_tenant_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    activities: Mapped[list["LeadActivity"]] = relationship(back_populates="lead", cascade="all, delete-orphan")


class LeadActivity(Base):
    __tablename__ = "lead_activities"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_type: Mapped[str] = mapped_column(
        PgEnum("NOTE", "CALL", "VISIT", "WA_MESSAGE", name="lead_activity_type_enum", create_type=False),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    done_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lead: Mapped["Lead"] = relationship(back_populates="activities")
