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

    # In-process cron — rent reminders + overdue notices. Only runs when
    # SCHEDULER_ENABLED=true (so dev boxes don't spam tenants). Safe today
    # because prod is a single backend replica; if we ever scale out, swap
    # this for an external scheduler (EventBridge / k8s CronJob) or add a
    # Redis-backed distributed lock around each fire.
    scheduler = None
    if settings.SCHEDULER_ENABLED:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        from pytz import timezone as _tz

        from app.tasks.rent_reminders import _generate_and_remind, _send_overdue_reminders

        ist = _tz("Asia/Kolkata")
        scheduler = AsyncIOScheduler(timezone=ist)
        # 1st of every month at 10:00 IST — create ledger + send `rent_reminder`.
        scheduler.add_job(
            _generate_and_remind,
            CronTrigger(day=1, hour=10, minute=0, timezone=ist),
            args=[{}, None],
            id="rent_reminders_monthly",
            misfire_grace_time=3600,
            coalesce=True,
        )
        # Daily at 10:00 IST — chase anyone still UNPAID/PARTIAL for the month.
        scheduler.add_job(
            _send_overdue_reminders,
            CronTrigger(hour=10, minute=0, timezone=ist),
            args=[{}, None],
            id="rent_overdue_daily",
            misfire_grace_time=3600,
            coalesce=True,
        )
        scheduler.start()
        print(
            "Scheduler started — rent_reminders_monthly (1st 10:00 IST), "
            "rent_overdue_daily (10:00 IST)"
        )

    yield

    # Shutdown
    if scheduler is not None:
        scheduler.shutdown(wait=False)
        print("Scheduler stopped")
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
