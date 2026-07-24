"""Platform-level models (public schema). One row per organisation."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"
    __table_args__ = {"schema": "public"}

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # Starter / Growth / Enterprise
    max_properties: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_tenants_per_property: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    price_monthly_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 0 = free
    features_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organisations: Mapped[list["Organisation"]] = relationship(back_populates="plan")


class Organisation(Base):
    __tablename__ = "organisations"
    __table_args__ = {"schema": "public"}

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    owner_email: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_phone: Mapped[str] = mapped_column(String(20), nullable=False)

    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("public.subscription_plans.id"), nullable=True
    )
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # WhatsApp Business Account (per org)
    whatsapp_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp_phone_number_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    whatsapp_access_token_secret_arn: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Payment — Stripe is the platform's SaaS subscription billing (owner pays
    # PGManage). Razorpay is per-org and powers TENANT→OWNER rent payments: each
    # owner connects their own account so funds never touch the platform.
    razorpay_key_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_key_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)
    razorpay_key_secret_arn: Mapped[str | None] = mapped_column(String(500), nullable=True)
    razorpay_webhook_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)
    razorpay_webhook_secret_arn: Mapped[str | None] = mapped_column(String(500), nullable=True)
    razorpay_payments_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Meta Lead Ads
    meta_webhook_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Schema
    schema_name: Mapped[str] = mapped_column(String(100), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    plan: Mapped[SubscriptionPlan | None] = relationship(back_populates="organisations")


class PlatformUser(Base):
    """Super admins — separate from org users."""
    __tablename__ = "platform_users"
    __table_args__ = {"schema": "public"}

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_superadmin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
