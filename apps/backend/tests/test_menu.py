"""Tests for the weekly menu upload API.

We don't exercise the S3 path in tests (no real bucket); we exercise the
DB lifecycle: create → list → re-upload (deactivates prior) → delete →
tenant fetches the most recent active row.

The presigned-URL endpoint is exercised but its returned URL is a
LocalStack/boto stub — we only assert the response shape.
"""
from __future__ import annotations

from datetime import date, timedelta
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


# ── Staff endpoints ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_menu_upload_url_returns_presigned_shape(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    r = await client.post(
        "/api/v1/menu/upload-url",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "filename": "june-week-3.pdf",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("upload_url", "s3_key", "expires_in", "content_type"):
        assert key in body
    assert body["content_type"] == "application/pdf"
    # Namespaced under the org's path so a leaked URL can't traverse.
    assert str(test_property["org_id"]) in body["s3_key"]
    assert str(test_property["property_id"]) in body["s3_key"]


@pytest.mark.asyncio
async def test_menu_upload_url_rejects_unsupported_extension(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    r = await client.post(
        "/api/v1/menu/upload-url",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "filename": "menu.docx",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_menu_create_and_list(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    monday = _monday_of(date.today())
    r = await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "week_start_date": monday.isoformat(),
            "s3_key": "fake/key/menu.pdf",
            "content_type": "application/pdf",
            "original_filename": "menu.pdf",
            "title": "Week of " + monday.isoformat(),
        },
    )
    assert r.status_code == 201, r.text

    lst = await client.get(
        f"/api/v1/menu?property_id={test_property['property_id']}",
        headers=auth_headers(test_owner["token"]),
    )
    assert lst.status_code == 200
    items = lst.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Week of " + monday.isoformat()
    assert items[0]["content_type"] == "application/pdf"


@pytest.mark.asyncio
async def test_menu_create_normalises_to_monday(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Owner picks a Wednesday — we should store the Monday of that week."""
    a_wednesday = date.today() - timedelta(days=date.today().weekday()) + timedelta(days=2)
    expected_monday = _monday_of(a_wednesday)

    r = await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "week_start_date": a_wednesday.isoformat(),
            "s3_key": "fake/key/menu.pdf",
            "content_type": "application/pdf",
        },
    )
    assert r.status_code == 201
    assert r.json()["week_start_date"] == expected_monday.isoformat()


@pytest.mark.asyncio
async def test_menu_re_upload_deactivates_prior(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Uploading a new file for the same week deactivates the previous row."""
    monday = _monday_of(date.today())
    common_payload = {
        "property_id": str(test_property["property_id"]),
        "week_start_date": monday.isoformat(),
        "content_type": "application/pdf",
    }
    r1 = await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={**common_payload, "s3_key": "fake/key/v1.pdf"},
    )
    assert r1.status_code == 201
    first_id = r1.json()["id"]

    r2 = await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={**common_payload, "s3_key": "fake/key/v2.pdf"},
    )
    assert r2.status_code == 201, r2.text
    second_id = r2.json()["id"]
    assert second_id != first_id

    # Only the second row should be active.
    schema = test_property["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    rows = (
        await db.execute(
            text("SELECT id, is_active FROM menu_uploads WHERE week_start_date = :ws"),
            {"ws": monday},
        )
    ).mappings().fetchall()
    actives = [r for r in rows if r["is_active"]]
    assert len(actives) == 1
    assert str(actives[0]["id"]) == second_id
    await db.commit()


@pytest.mark.asyncio
async def test_menu_delete_soft_deactivates(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    monday = _monday_of(date.today())
    r = await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "week_start_date": monday.isoformat(),
            "s3_key": "fake/key/del.pdf",
            "content_type": "application/pdf",
        },
    )
    menu_id = r.json()["id"]

    d = await client.delete(
        f"/api/v1/menu/{menu_id}",
        headers=auth_headers(test_owner["token"]),
    )
    assert d.status_code == 200

    # Soft-delete: row exists but is_active=false.
    schema = test_property["schema_name"]
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    row = (
        await db.execute(
            text("SELECT is_active FROM menu_uploads WHERE id = :id"),
            {"id": menu_id},
        )
    ).mappings().fetchone()
    assert row is not None
    assert row["is_active"] is False
    await db.commit()

    # And re-uploading the same week works (partial unique index frees).
    r2 = await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "week_start_date": monday.isoformat(),
            "s3_key": "fake/key/replacement.pdf",
            "content_type": "application/pdf",
        },
    )
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_menu_create_rejects_bad_content_type(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    r = await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "week_start_date": _monday_of(date.today()).isoformat(),
            "s3_key": "fake/key/menu.exe",
            "content_type": "application/x-msdownload",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_menu_endpoints_require_staff_role(client: AsyncClient, tenant_portal_token: str):
    """Tenant tokens cannot hit staff menu endpoints — 403."""
    r = await client.post(
        "/api/v1/menu/upload-url",
        headers=auth_headers(tenant_portal_token),
        json={"property_id": str(uuid.uuid4()), "filename": "x.pdf"},
    )
    assert r.status_code == 403


# ── Tenant endpoint ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_menu_current_returns_active_menu(
    client: AsyncClient,
    test_owner: dict,
    test_tenant: dict,
    tenant_portal_token: str,
):
    """After the owner uploads, the tenant sees the current week's menu."""
    monday = _monday_of(date.today())
    await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_tenant["property_id"]),
            "week_start_date": monday.isoformat(),
            "s3_key": "fake/key/this-week.pdf",
            "content_type": "application/pdf",
            "title": "This week",
        },
    )
    r = await client.get(
        "/api/v1/tenant/menu/current",
        headers=auth_headers(tenant_portal_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "This week"
    assert body["is_current_week"] is True
    assert "url" in body and body["url"].startswith("http")


@pytest.mark.asyncio
async def test_tenant_menu_falls_back_to_prior_week(
    client: AsyncClient,
    test_owner: dict,
    test_tenant: dict,
    tenant_portal_token: str,
):
    """If this week has no menu, the tenant gets the most recent prior week
    with is_current_week=False so the UI can say 'last week's menu'."""
    last_monday = _monday_of(date.today()) - timedelta(days=7)
    await client.post(
        "/api/v1/menu",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_tenant["property_id"]),
            "week_start_date": last_monday.isoformat(),
            "s3_key": "fake/key/last-week.pdf",
            "content_type": "application/pdf",
            "title": "Last week",
        },
    )
    r = await client.get(
        "/api/v1/tenant/menu/current",
        headers=auth_headers(tenant_portal_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Last week"
    assert body["is_current_week"] is False


@pytest.mark.asyncio
async def test_tenant_menu_404_when_nothing_uploaded(
    client: AsyncClient, tenant_portal_token: str
):
    r = await client.get(
        "/api/v1/tenant/menu/current",
        headers=auth_headers(tenant_portal_token),
    )
    assert r.status_code == 404
