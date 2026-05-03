from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"
    APP_NAME: str = "PGManage"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://pgmanage:pgmanage_dev_password@localhost:5432/pgmanage"

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Security ─────────────────────────────────────────────────────────────
    SECRET_KEY: str = "dev-secret-key-change-in-production-use-long-random-string"
    ALGORITHM: str = "HS256"  # Switch to RS256 in production
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # RS256 keys (set in production)
    RS256_PRIVATE_KEY: str = ""
    RS256_PUBLIC_KEY: str = ""

    # ── OTP ───────────────────────────────────────────────────────────────────
    OTP_EXPIRE_SECONDS: int = 600  # 10 minutes
    OTP_MAX_ATTEMPTS: int = 3
    OTP_RATE_LIMIT_PER_MINUTE: int = 5

    # ── AWS ───────────────────────────────────────────────────────────────────
    AWS_REGION: str = "ap-south-1"
    AWS_ACCESS_KEY_ID: str = "test"
    AWS_SECRET_ACCESS_KEY: str = "test"
    AWS_ENDPOINT_URL: str | None = None  # None in prod, localstack URL in dev

    # ── S3 ────────────────────────────────────────────────────────────────────
    S3_BUCKET_NAME: str = "pgmanage-dev"
    S3_PRESIGNED_URL_EXPIRE_UPLOAD: int = 900   # 15 min
    S3_PRESIGNED_URL_EXPIRE_VIEW: int = 3600     # 1 hour

    # ── SQS ───────────────────────────────────────────────────────────────────
    SQS_QUEUE_URL: str = ""
    SQS_NOTIFICATIONS_QUEUE_URL: str = ""

    # ── Stripe ────────────────────────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_GROWTH: str = ""

    # ── CORS / Trusted hosts ─────────────────────────────────────────────────
    # Accepts either a JSON array string or a comma-separated list.
    CORS_ORIGINS: str = '["http://localhost:3000","http://localhost:3001"]'
    ALLOWED_HOSTS: str = "localhost,127.0.0.1"

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60

    # ── Subscription ─────────────────────────────────────────────────────────
    TRIAL_DAYS: int = 30

    # ── Timezone ─────────────────────────────────────────────────────────────
    TIMEZONE: str = "Asia/Kolkata"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str) -> str:
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        v = (self.CORS_ORIGINS or "").strip()
        if not v:
            return []
        if v.startswith("["):
            try:
                return json.loads(v)
            except Exception:
                pass
        return [s.strip() for s in v.split(",") if s.strip()]

    @property
    def allowed_hosts_list(self) -> list[str]:
        v = (self.ALLOWED_HOSTS or "").strip()
        if not v:
            return ["*"]
        return [s.strip() for s in v.split(",") if s.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_local(self) -> bool:
        return self.ENVIRONMENT == "local"

    @property
    def use_rs256(self) -> bool:
        return bool(self.RS256_PRIVATE_KEY and self.RS256_PUBLIC_KEY)

    @property
    def effective_algorithm(self) -> str:
        return "RS256" if self.use_rs256 else self.ALGORITHM

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.is_production:
            if not self.RS256_PRIVATE_KEY:
                raise ValueError("RS256_PRIVATE_KEY must be set in production")
            if self.SECRET_KEY.startswith("dev-secret-key"):
                raise ValueError("SECRET_KEY must be rotated in production")
            # Stripe / Meta / SES are checked lazily at the call site so the
            # backend can boot without them — features that need them will 503.
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
