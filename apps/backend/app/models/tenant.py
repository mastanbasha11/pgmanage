from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, Enum as PgEnum, ForeignKey,
    Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = (
        UniqueConstraint("phone", "property_id", name="uq_tenant_phone_property"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    property_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id"), nullable=False, index=True
    )
    bed_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("beds.id"), nullable=True
    )

    # Personal details
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Identity
    id_type: Mapped[str] = mapped_column(
        PgEnum("AADHAR", "PASSPORT", "DRIVING_LICENSE", "OTHER", name="id_type_enum", create_type=False),
        nullable=False,
        default="AADHAR",
    )
    id_number: Mapped[str] = mapped_column(String(50), nullable=False)
    id_photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    id_photo_s3_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_photo_s3_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Emergency contact
    emergency_contact_name: Mapped[str] = mapped_column(String(200), nullable=False)
    emergency_contact_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    emergency_contact_relation: Mapped[str] = mapped_column(String(50), nullable=False)

    # Professional
    occupation: Mapped[str | None] = mapped_column(String(200), nullable=True)
    employer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    hometown: Mapped[str | None] = mapped_column(String(200), nullable=True)
    permanent_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tenancy
    move_in_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_move_out_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_move_out_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(
        PgEnum("ACTIVE", "CHECKED_OUT", "RESERVED", name="tenant_status_enum", create_type=False),
        nullable=False,
        default="ACTIVE",
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    rent_plans: Mapped[list["RentPlan"]] = relationship(back_populates="tenant")


class RentPlan(Base):
    __tablename__ = "rent_plans"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    property_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)

    # All amounts in paise (₹1 = 100 paise)
    monthly_rent_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    security_deposit_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    advance_paid_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    food_included: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    food_charges_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # [{label: "Electricity", amount_paise: 50000}]
    other_charges_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Day of month rent is due (1-28)
    billing_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped["Tenant"] = relationship(back_populates="rent_plans")

    @property
    def total_monthly_paise(self) -> int:
        """Sum of rent + food + other charges (excluding discount)."""
        other = sum(c.get("amount_paise", 0) for c in (self.other_charges_json or []))
        total = self.monthly_rent_paise + self.food_charges_paise + other
        return max(0, total - self.discount_amount_paise)
