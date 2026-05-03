"""Auth endpoint tests — signup, login, OTP, token refresh, staff invite."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


# ── Signup ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_signup_creates_org_and_user(client: AsyncClient):
    """POST /auth/signup creates org, schema, and owner user."""
    unique_email = f"owner-{uuid.uuid4().hex[:8]}@testpg.com"
    unique_phone = "+91987654" + str(uuid.uuid4().int)[:4].zfill(4)
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": "Sunrise PG Hostel",
            "owner_name": "Rajesh Kumar",
            "owner_email": unique_email,
            "owner_phone": unique_phone,
            "password": "SecurePass123",
            "city": "Chennai",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert "org_id" in data
    assert "org_slug" in data
    assert "user_id" in data


@pytest.mark.asyncio
async def test_signup_creates_org_schema(client: AsyncClient, db: AsyncSession):
    """Signup provisions a schema for the new org."""
    unique_email = f"schema-{uuid.uuid4().hex[:8]}@testpg.com"
    unique_phone = "+91876543" + str(uuid.uuid4().int)[:4].zfill(4)
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": "Schema Test PG",
            "owner_name": "Schema Owner",
            "owner_email": unique_email,
            "owner_phone": unique_phone,
            "password": "SecurePass123",
            "city": "Bangalore",
        },
    )
    assert response.status_code == 201
    org_id = response.json()["org_id"]

    # Verify schema was created
    result = await db.execute(
        text("SELECT schema_name FROM public.organisations WHERE id = :id"),
        {"id": org_id},
    )
    schema_name = result.scalar_one()
    assert schema_name.startswith("org_")
    await db.commit()  # close implicit transaction before teardown


@pytest.mark.asyncio
async def test_signup_duplicate_email_returns_409(client: AsyncClient):
    """Signing up with an existing email → 409."""
    unique_email = f"dup-{uuid.uuid4().hex[:8]}@testpg.com"
    unique_phone = "+91765432" + str(uuid.uuid4().int)[:4].zfill(4)
    payload = {
        "org_name": "Duplicate PG",
        "owner_name": "Owner One",
        "owner_email": unique_email,
        "owner_phone": unique_phone,
        "password": "SecurePass123",
        "city": "Mumbai",
    }
    await client.post("/api/v1/auth/signup", json=payload)

    # Second signup with same email
    payload2 = {**payload, "org_name": "Another PG", "owner_phone": "+91654321" + str(uuid.uuid4().int)[:4].zfill(4)}
    response = await client.post("/api/v1/auth/signup", json=payload2)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_signup_invalid_phone_returns_422(client: AsyncClient):
    """Invalid Indian phone format → 422."""
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": "Test PG",
            "owner_name": "Test",
            "owner_email": "test@example.com",
            "owner_phone": "12345",  # invalid
            "password": "SecurePass123",
            "city": "Pune",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_signup_short_password_returns_422(client: AsyncClient):
    """Password shorter than 8 characters → 422."""
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": "Test PG",
            "owner_name": "Test",
            "owner_email": "test2@example.com",
            "owner_phone": "+919876543210",
            "password": "short",  # too short
            "city": "Pune",
        },
    )
    assert response.status_code == 422


# ── Login ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_valid_credentials(client: AsyncClient, test_owner: dict):
    """Valid email+password returns access and refresh tokens."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@test.com", "password": "password123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["role"] == "OWNER"
    assert data["user"]["email"] == "owner@test.com"


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client: AsyncClient, test_owner: dict):
    """Wrong password → 401."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@test.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_ERROR"


@pytest.mark.asyncio
async def test_login_nonexistent_email_returns_401(client: AsyncClient):
    """Login with email that doesn't belong to any org → 401."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@doesnotexist.com", "password": "anypassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_missing_fields_returns_422(client: AsyncClient):
    """Missing password field → 422."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com"},
    )
    assert response.status_code == 422


# ── Get current user ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_me_returns_profile(client: AsyncClient, test_owner: dict):
    """GET /auth/me returns current user profile."""
    response = await client.get(
        "/api/v1/auth/me",
        headers=auth_headers(test_owner["token"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "OWNER"
    assert data["email"] == "owner@test.com"
    assert data["name"] == "Test Owner"
    assert "org_id" in data
    assert "id" in data


@pytest.mark.asyncio
async def test_get_me_no_token_returns_401(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_invalid_token_returns_401(client: AsyncClient):
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer totally.invalid.token"},
    )
    assert response.status_code == 401


# ── Token refresh ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_token_returns_new_access_token(
    client: AsyncClient, test_owner: dict
):
    """Valid refresh token → new access token."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@test.com", "password": "password123"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_refresh_with_access_token_fails(
    client: AsyncClient, test_owner: dict
):
    """Using an access token as refresh token → 401."""
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": test_owner["token"]},  # access token, not refresh
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_invalid_token_fails(client: AsyncClient):
    """Invalid refresh token → 401."""
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "not.a.valid.token"},
    )
    assert response.status_code == 401


# ── OTP (staff) ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_otp_request_nonexistent_org_returns_404(client: AsyncClient):
    """OTP request for unknown org slug → 404."""
    response = await client.post(
        "/api/v1/auth/otp/request",
        json={"phone": "+919876543210", "org_slug": "non-existent-slug-xyz"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_otp_verify_invalid_otp_returns_401(
    client: AsyncClient, test_owner: dict, db: AsyncSession
):
    """Providing wrong OTP → 401."""
    # Get org slug
    result = await db.execute(
        text("SELECT slug FROM public.organisations WHERE id = :id"),
        {"id": str(test_owner["org_id"])},
    )
    org_slug = result.scalar_one()
    await db.commit()  # close implicit transaction before client call

    response = await client.post(
        "/api/v1/auth/otp/verify",
        json={
            "phone": "+919876543210",
            "otp": "000000",  # wrong OTP
            "org_slug": org_slug,
        },
    )
    assert response.status_code == 401


# ── Staff invite ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invite_staff_requires_owner_role(
    client: AsyncClient, test_supervisor: dict
):
    """SUPERVISOR cannot invite staff → 403."""
    response = await client.post(
        "/api/v1/auth/staff/invite",
        headers=auth_headers(test_supervisor["token"]),
        json={
            "phone": "+919876543300",
            "name": "New Staff",
            "role": "SUPERVISOR",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_invite_staff_owner_succeeds(
    client: AsyncClient, test_owner: dict
):
    """OWNER can invite staff."""
    response = await client.post(
        "/api/v1/auth/staff/invite",
        headers=auth_headers(test_owner["token"]),
        json={
            "phone": "+919876543301",
            "name": "New Supervisor",
            "role": "SUPERVISOR",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "invite_token" in data
    assert data["message"] == "Invite sent"


# ── Error response format ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_error_response_format(client: AsyncClient):
    """All error responses follow the standard format."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    data = response.json()
    assert "error" in data
    assert "code" in data["error"]
    assert "message" in data["error"]


@pytest.mark.asyncio
async def test_validation_error_format(client: AsyncClient):
    """Validation errors follow the standard format."""
    response = await client.post("/api/v1/auth/signup", json={})
    assert response.status_code == 422
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert "details" in data["error"]
