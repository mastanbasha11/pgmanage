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


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon_name: Mapped[str] = mapped_column(String(50), nullable=False, default="receipt")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    expenses: Mapped[list["Expense"]] = relationship(back_populates="category")


DEFAULT_EXPENSE_CATEGORIES = [
    {"name": "Groceries", "icon_name": "shopping-cart", "sort_order": 1},
    {"name": "Vegetables", "icon_name": "leaf", "sort_order": 2},
    {"name": "Electricity", "icon_name": "zap", "sort_order": 3},
    {"name": "Water", "icon_name": "droplets", "sort_order": 4},
    {"name": "Maintenance", "icon_name": "wrench", "sort_order": 5},
    {"name": "Salary", "icon_name": "user", "sort_order": 6},
    {"name": "Internet", "icon_name": "wifi", "sort_order": 7},
    {"name": "Cleaning", "icon_name": "sparkles", "sort_order": 8},
    {"name": "Miscellaneous", "icon_name": "package", "sort_order": 9},
]


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_property_date", "property_id", "purchase_date"),
        Index("ix_expenses_approval_status", "approval_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("properties.id"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("expense_categories.id"), nullable=False
    )

    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vendor_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    purchased_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)

    bill_photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    bill_photo_s3_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    payment_mode: Mapped[str] = mapped_column(
        PgEnum("CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", name="payment_mode_enum", create_type=False),
        nullable=False,
        default="CASH",
    )
    reference_number: Mapped[str | None] = mapped_column(String(200), nullable=True)

    approval_status: Mapped[str] = mapped_column(
        PgEnum("PENDING", "APPROVED", "REJECTED", name="expense_approval_enum", create_type=False),
        nullable=False,
        default="PENDING",
        index=True,
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    category: Mapped["ExpenseCategory"] = relationship(back_populates="expenses")
