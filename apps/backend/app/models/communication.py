from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum as PgEnum, ForeignKey,
    Index, String, Text, func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    target_type: Mapped[str] = mapped_column(
        PgEnum(
            "ALL_TENANTS", "FLOOR", "ROOM", "INDIVIDUAL",
            name="announcement_target_enum",
            create_type=False,
        ),
        nullable=False,
        default="ALL_TENANTS",
    )
    target_ids: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(PGUUID(as_uuid=True)), nullable=True
    )
    channels: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[str] = mapped_column(
        PgEnum("DRAFT", "SCHEDULED", "SENT", "FAILED", name="announcement_status_enum", create_type=False),
        nullable=False,
        default="DRAFT",
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        Index("ix_complaints_property_status", "property_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)

    category: Mapped[str] = mapped_column(
        PgEnum(
            "MAINTENANCE", "CLEANLINESS", "NOISE", "FOOD", "SECURITY", "OTHER",
            name="complaint_category_enum",
            create_type=False,
        ),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_s3_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        PgEnum(
            "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED",
            name="complaint_status_enum",
            create_type=False,
        ),
        nullable=False,
        default="OPEN",
        index=True,
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    response_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NotificationLog(Base):
    __tablename__ = "notification_log"
    __table_args__ = (
        Index("ix_notif_org_channel_status", "org_id", "channel", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)

    recipient_type: Mapped[str] = mapped_column(
        PgEnum("TENANT", "USER", name="notif_recipient_type_enum", create_type=False),
        nullable=False,
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)

    channel: Mapped[str] = mapped_column(
        PgEnum("WHATSAPP", "EMAIL", "PUSH", "SMS", name="notif_channel_enum", create_type=False),
        nullable=False,
    )
    template_name: Mapped[str] = mapped_column(String(100), nullable=False)
    message_body: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(
        PgEnum("SENT", "FAILED", "PENDING", name="notif_status_enum", create_type=False),
        nullable=False,
        default="PENDING",
    )
    external_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    """
    Immutable audit trail. INSERT ONLY. Every financial write must produce an entry.
    Never update or delete rows from this table.
    """
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_org_table", "org_id", "table_name"),
        Index("ix_audit_actor", "actor_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(
        PgEnum("INSERT", "UPDATE", "DELETE", name="audit_action_enum", create_type=False),
        nullable=False,
    )
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)
    record_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    old_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
