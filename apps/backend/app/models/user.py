from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as PgEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.core.database import Base


class Role(str, enum.Enum):
    OWNER = "OWNER"
    PARTNER = "PARTNER"
    PROPERTY_MANAGER = "PROPERTY_MANAGER"
    SUPERVISOR = "SUPERVISOR"
    TENANT = "TENANT"


class User(Base):
    """Staff users within an organisation schema."""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)

    role: Mapped[str] = mapped_column(
        PgEnum(
            "OWNER", "PARTNER", "PROPERTY_MANAGER", "SUPERVISOR",
            name="user_role_enum",
            create_type=False,
        ),
        nullable=False,
        default="SUPERVISOR",
    )

    # NULL = access to all properties (owner/partner)
    # list of UUIDs = access only to those properties (manager/supervisor)
    property_access: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(PGUUID(as_uuid=True)), nullable=True
    )

    invite_token: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    invite_token_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
