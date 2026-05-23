from __future__ import annotations

from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import (
    PGManageException,
    http_exception_handler,
    pgmanage_exception_handler,
    validation_exception_handler,
)
from app.core.middleware import RequestIDMiddleware, RequestLoggingMiddleware, RateLimitMiddleware

# ── Routers ───────────────────────────────────────────────────────────────────
from app.api.v1 import (
    auth,
    properties,
    rooms,
    tenants,
    payments,
    expenses,
    leads,
    announcements,
    complaints,
    dashboard,
    tenant_portal,
    webhooks,
    bookings,
    audit_logs,
)
from app.api.platform import admin as platform_admin
from fastapi import HTTPException


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"Starting PGManage API [{settings.ENVIRONMENT}] v{settings.APP_VERSION}")

    # Test DB connection
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
    print("Database connection OK")

    # Test Redis
    r = await aioredis.from_url(settings.REDIS_URL)
    await r.ping()
    await r.aclose()
    print("Redis connection OK")

    yield

    # Shutdown
    await engine.dispose()
    print("PGManage API shutdown complete")


app = FastAPI(
    title="PGManage API",
    description="Multi-tenant SaaS platform for PG accommodation management in India",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── Middleware (order matters — outermost first) ───────────────────────────────
app.add_middleware(RequestIDMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
if settings.is_production:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

# ── Exception handlers ─────────────────────────────────────────────────────────
app.add_exception_handler(PGManageException, pgmanage_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

# ── Routes ────────────────────────────────────────────────────────────────────
V1 = "/api/v1"

app.include_router(auth.router, prefix=V1, tags=["auth"])
app.include_router(properties.router, prefix=V1, tags=["properties"])
app.include_router(rooms.router, prefix=V1, tags=["rooms"])
app.include_router(tenants.router, prefix=V1, tags=["tenants"])
app.include_router(payments.router, prefix=V1, tags=["payments"])
app.include_router(expenses.router, prefix=V1, tags=["expenses"])
app.include_router(leads.router, prefix=V1, tags=["leads"])
app.include_router(announcements.router, prefix=V1, tags=["announcements"])
app.include_router(complaints.router, prefix=V1, tags=["complaints"])
app.include_router(dashboard.router, prefix=V1, tags=["dashboard"])
app.include_router(bookings.router, prefix=V1, tags=["bookings"])
app.include_router(audit_logs.router, prefix=V1, tags=["audit-logs"])
app.include_router(tenant_portal.router, prefix=V1, tags=["tenant-portal"])
app.include_router(webhooks.router, prefix=V1, tags=["webhooks"])
app.include_router(platform_admin.router, prefix="/api/platform", tags=["platform-admin"])


@app.get("/health", tags=["health"])
async def health_check():
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }
