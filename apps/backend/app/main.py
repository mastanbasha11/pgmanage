from __future__ import annotations

from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import (
    PGManageException,
    http_exception_handler,
    pgmanage_exception_handler,
    validation_exception_handler,
)
from app.core.middleware import (
    RateLimitMiddleware,
    RequestIDMiddleware,
    RequestLoggingMiddleware,
    WebsiteLeadCorsMiddleware,
)

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
    public_leads,
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


# /api/docs and /api/redoc are served below from a vendored copy of the Swagger /
# ReDoc bundles (app/static/docs) so they work under our locked-down CSP
# (script-src 'self'). Disable FastAPI's CDN-backed defaults here.
app = FastAPI(
    title="PGManage API",
    description="Multi-tenant SaaS platform for PG accommodation management in India",
    version=settings.APP_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Vendored Swagger UI + ReDoc assets — see app/static/docs/README.md for refresh steps.
_STATIC_DIR = Path(__file__).parent / "static"
app.mount("/api/static", StaticFiles(directory=str(_STATIC_DIR)), name="api-static")


@app.get("/api/docs", include_in_schema=False)
async def swagger_ui():
    return get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title="PGManage API — Swagger UI",
        swagger_js_url="/api/static/docs/swagger-ui-bundle.js",
        swagger_css_url="/api/static/docs/swagger-ui.css",
    )


@app.get("/api/redoc", include_in_schema=False)
async def redoc_ui():
    # with_google_fonts=False: our CSP `style-src 'self'` blocks the
    # fonts.googleapis.com <link>; ReDoc falls back cleanly to system fonts.
    return get_redoc_html(
        openapi_url="/api/openapi.json",
        title="PGManage API — ReDoc",
        redoc_js_url="/api/static/docs/redoc.standalone.js",
        with_google_fonts=False,
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
# Runs before CORSMiddleware on incoming requests so external PG-site origins pass preflight.
app.add_middleware(WebsiteLeadCorsMiddleware)
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
app.include_router(public_leads.router, prefix=V1, tags=["public-leads"])
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
