"""
Pytest configuration and fixtures for PGManage backend tests.
Uses a real PostgreSQL test database — no mocks.
All client tests use dependency override so they hit the test DB, not prod.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_tenant_token,
    get_password_hash,
)
from app.main import app  # noqa: E402 — must come after env override

# Disable rate limiting for tests — all requests hit the same test IP
# and 200+ test requests would exceed the 60/min default.
settings.RATE_LIMIT_PER_MINUTE = 99999

# ── Test DB engine ─────────────────────────────────────────────────────────────

# Replace only the database name (last path segment), not the username in the DSN
TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/pgmanage_test"

# NullPool avoids connection reuse across event loops, preventing "future attached
# to a different loop" errors in pytest-asyncio session-scoped fixtures.
test_engine = create_async_engine(TEST_DB_URL, echo=False, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


# ── Override get_db so HTTP client hits test DB, not prod ─────────────────────

async def _test_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


app.dependency_overrides[get_db] = _test_get_db

# WebsiteLeadCorsMiddleware opens its own session via AsyncSessionLocal (bound to the
# prod engine) instead of the request's get_db, so point it at the test DB too —
# otherwise it reads the dev DB and uses the pooled engine, causing cross-event-loop
# errors. (Prod runs a single loop + one DB, so this only matters for tests.)
import app.core.website_lead_cors as _wlc  # noqa: E402

_wlc.AsyncSessionLocal = TestSessionLocal


# ── Database setup (once per session) ─────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def db_setup():
    """Create public schema tables in test database once per session."""
    # Flush Redis rate-limit counters from previous test runs
    import redis.asyncio as aioredis
    _r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await _r.flushdb()
    await _r.aclose()

    async with test_engine.begin() as conn:
        # Truncate public tables to start fresh each session (prevents login confusion
        # from stale orgs with the same email across test runs).
        # Use RESTART IDENTITY to reset sequences; no CASCADE needed since org schemas
        # don't have FK references back to these public tables.
        await conn.execute(text("TRUNCATE TABLE public.organisations RESTART IDENTITY"))
        await conn.execute(text("TRUNCATE TABLE public.platform_users RESTART IDENTITY"))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public.subscription_plans (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                max_properties INTEGER NOT NULL DEFAULT 1,
                max_tenants_per_property INTEGER NOT NULL DEFAULT 50,
                price_monthly_paise INTEGER NOT NULL DEFAULT 0,
                features_json JSONB NOT NULL DEFAULT '{}',
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            INSERT INTO public.subscription_plans (name, max_properties, max_tenants_per_property, price_monthly_paise)
            VALUES ('Growth', 5, 200, 249900)
            ON CONFLICT DO NOTHING
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public.organisations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(200) NOT NULL,
                slug VARCHAR(100) NOT NULL UNIQUE,
                owner_email VARCHAR(255) NOT NULL,
                owner_phone VARCHAR(20) NOT NULL,
                plan_id UUID,
                plan_expires_at TIMESTAMPTZ,
                trial_ends_at TIMESTAMPTZ,
                schema_name VARCHAR(100) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public.platform_users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'SUPPORT',
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
    yield
    await test_engine.dispose()


# ── Per-test session ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db(db_setup) -> AsyncGenerator[AsyncSession, None]:
    """Yields an async session; closed after each test."""
    async with TestSessionLocal() as session:
        yield session


# ── Organisation fixture ───────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_org(db: AsyncSession) -> dict:
    """Create a fresh test organisation with its own schema."""
    org_id = uuid.uuid4()
    schema_name = f"org_{str(org_id).replace('-', '_')}"

    await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
    await db.execute(
        text("""
            INSERT INTO public.organisations (id, name, slug, owner_email, owner_phone, schema_name, is_active)
            VALUES (:id, 'Test PG', :slug, 'owner@test.com', '+919876543210', :schema, true)
        """),
        {"id": str(org_id), "slug": f"test-pg-{str(org_id)[:8]}", "schema": schema_name},
    )

    from app.models.schemas_migration import provision_org_schema
    await provision_org_schema(org_id, db)
    await db.commit()

    return {"org_id": org_id, "schema_name": schema_name}


# ── Property fixture ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_property(db: AsyncSession, test_org: dict) -> dict:
    """Create a test property with one floor, one room, and two beds."""
    schema = test_org["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    prop_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO properties (id, org_id, name, address_line1, city, state, pincode, is_active)
            VALUES (:id, :org_id, 'Test PG House', '123 Main St', 'Chennai', 'Tamil Nadu', '600001', true)
        """),
        {"id": str(prop_id), "org_id": str(test_org["org_id"])},
    )

    floor_id = uuid.uuid4()
    await db.execute(
        text("INSERT INTO floors (id, property_id, floor_number, display_name) VALUES (:id, :pid, 0, 'Ground Floor')"),
        {"id": str(floor_id), "pid": str(prop_id)},
    )

    room_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO rooms (id, floor_id, property_id, org_id, room_number, display_name, capacity, monthly_base_rent_paise)
            VALUES (:id, :fid, :pid, :org_id, '101', 'Room 101', 2, 700000)
        """),
        {"id": str(room_id), "fid": str(floor_id), "pid": str(prop_id), "org_id": str(test_org["org_id"])},
    )

    bed_ids = []
    for label in ["A", "B"]:
        bid = uuid.uuid4()
        await db.execute(
            text("INSERT INTO beds (id, room_id, property_id, bed_label, status) VALUES (:id, :rid, :pid, :label, 'VACANT')"),
            {"id": str(bid), "rid": str(room_id), "pid": str(prop_id), "label": label},
        )
        bed_ids.append(bid)

    # Seed one expense category for tests
    cat_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO expense_categories (id, property_id, name, icon_name, is_default, sort_order)
            VALUES (:id, :pid, 'Maintenance', 'wrench', true, 5)
        """),
        {"id": str(cat_id), "pid": str(prop_id)},
    )

    await db.commit()
    return {
        "property_id": prop_id,
        "floor_id": floor_id,
        "room_id": room_id,
        "bed_ids": bed_ids,
        "category_id": cat_id,
        **test_org,
    }


# ── Owner user fixture ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_owner(db: AsyncSession, test_org: dict) -> dict:
    """Create an OWNER user in the test org."""
    schema = test_org["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    user_id = uuid.uuid4()
    pw_hash = get_password_hash("password123")
    await db.execute(
        text("""
            INSERT INTO users (id, org_id, name, phone, email, password_hash, role, is_active)
            VALUES (:id, :org_id, 'Test Owner', '+919876543210', 'owner@test.com', :pw_hash, 'OWNER', true)
        """),
        {"id": str(user_id), "org_id": str(test_org["org_id"]), "pw_hash": pw_hash},
    )
    await db.commit()

    token = create_access_token({
        "sub": str(user_id),
        "user_id": str(user_id),
        "org_id": str(test_org["org_id"]),
        "role": "OWNER",
        "name": "Test Owner",
        "email": "owner@test.com",
        "property_ids": None,
    })
    return {"user_id": user_id, "token": token, "role": "OWNER", **test_org}


# ── Partner user fixture ──────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_partner(db: AsyncSession, test_org: dict) -> dict:
    """Create a PARTNER user in the test org."""
    schema = test_org["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    user_id = uuid.uuid4()
    pw_hash = get_password_hash("password123")
    await db.execute(
        text("""
            INSERT INTO users (id, org_id, name, phone, email, password_hash, role, is_active)
            VALUES (:id, :org_id, 'Test Partner', '+919876543212', 'partner@test.com', :pw_hash, 'PARTNER', true)
        """),
        {"id": str(user_id), "org_id": str(test_org["org_id"]), "pw_hash": pw_hash},
    )
    await db.commit()

    token = create_access_token({
        "sub": str(user_id),
        "user_id": str(user_id),
        "org_id": str(test_org["org_id"]),
        "role": "PARTNER",
        "name": "Test Partner",
        "email": "partner@test.com",
        "property_ids": None,
    })
    return {"user_id": user_id, "token": token, "role": "PARTNER", **test_org}


# ── Supervisor user fixture ───────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_supervisor(db: AsyncSession, test_org: dict, test_property: dict) -> dict:
    """Create a SUPERVISOR user with access to one property."""
    schema = test_org["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    user_id = uuid.uuid4()
    pw_hash = get_password_hash("password123")
    prop_ids = [str(test_property["property_id"])]
    await db.execute(
        text("""
            INSERT INTO users (id, org_id, name, phone, email, password_hash, role, property_access, is_active)
            VALUES (:id, :org_id, 'Test Supervisor', '+919876543211', 'sup@test.com', :pw_hash, 'SUPERVISOR', :props, true)
        """),
        {
            "id": str(user_id),
            "org_id": str(test_org["org_id"]),
            "pw_hash": pw_hash,
            "props": prop_ids,
        },
    )
    await db.commit()

    token = create_access_token({
        "sub": str(user_id),
        "user_id": str(user_id),
        "org_id": str(test_org["org_id"]),
        "role": "SUPERVISOR",
        "name": "Test Supervisor",
        "email": "sup@test.com",
        "property_ids": prop_ids,
    })
    return {"user_id": user_id, "token": token, "role": "SUPERVISOR", **test_property}


# ── Tenant fixture ────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_tenant(db: AsyncSession, test_property: dict) -> dict:
    """Create an active tenant with a rent plan (occupies Bed A)."""
    schema = test_property["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    tenant_id = uuid.uuid4()
    bed_id = test_property["bed_ids"][0]  # Bed A

    await db.execute(
        text("""
            INSERT INTO tenants (id, org_id, property_id, bed_id, name, phone,
                id_type, id_number, emergency_contact_name, emergency_contact_phone,
                emergency_contact_relation, move_in_date, status)
            VALUES (:id, :org_id, :pid, :bed_id, 'Test Tenant', '+919876543299',
                'AADHAR', '123456789012', 'Parent', '+919876543298', 'Parent',
                '2024-01-01', 'ACTIVE')
        """),
        {
            "id": str(tenant_id),
            "org_id": str(test_property["org_id"]),
            "pid": str(test_property["property_id"]),
            "bed_id": str(bed_id),
        },
    )

    await db.execute(
        text("""
            INSERT INTO rent_plans (tenant_id, property_id, monthly_rent_paise,
                security_deposit_paise, billing_day, effective_from, is_active)
            VALUES (:tid, :pid, 700000, 1400000, 1, '2024-01-01', true)
        """),
        {"tid": str(tenant_id), "pid": str(test_property["property_id"])},
    )

    await db.execute(
        text("UPDATE beds SET status = 'OCCUPIED' WHERE id = :id"),
        {"id": str(bed_id)},
    )

    await db.commit()
    return {"tenant_id": tenant_id, "bed_id": bed_id, **test_property}


# ── Tenant portal token fixture ───────────────────────────────────────────────

@pytest_asyncio.fixture
async def tenant_portal_token(test_tenant: dict) -> str:
    """JWT for the test tenant to use the self-service portal."""
    return create_tenant_token(
        tenant_id=test_tenant["tenant_id"],
        property_id=test_tenant["property_id"],
        org_id=test_tenant["org_id"],
    )


# ── HTTP client fixture ───────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP test client. Uses test DB via dependency override."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Helper ────────────────────────────────────────────────────────────────────

def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
