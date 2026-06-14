"""Tests for the filesystem-backed weekly menu upload API."""
from __future__ import annotations

import io
from datetime import date, timedelta
from pathlib import Path
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _pdf_bytes(content: bytes = b'%PDF-1.4 fake') -> bytes:
    return content


async def _upload(
    client: AsyncClient,
    token: str,
    property_id,
    *,
    filename: str = 'menu.pdf',
    week_start: date | None = None,
    title: str | None = None,
    content: bytes | None = None,
    content_type: str = 'application/pdf',
):
    week = (week_start or _monday_of(date.today())).isoformat()
    files = {'file': (filename, content or _pdf_bytes(), content_type)}
    data: dict[str, str] = {
        'property_id': str(property_id),
        'week_start_date': week,
    }
    if title is not None:
        data['title'] = title
    return await client.post(
        '/api/v1/menu/upload',
        headers=auth_headers(token),
        data=data,
        files=files,
    )


# ── Upload ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_menu_upload_persists_row_and_writes_file(
    client: AsyncClient, test_owner: dict, test_property: dict, tmp_path: Path, monkeypatch
):
    monkeypatch.setattr('app.api.v1.menu.UPLOAD_ROOT', tmp_path)
    r = await _upload(client, test_owner['token'], test_property['property_id'])
    assert r.status_code == 201, r.text
    menu_id = r.json()['id']
    # File landed on disk under {org}/menu/{id}.pdf
    target = tmp_path / str(test_property['org_id']) / 'menu' / f'{menu_id}.pdf'
    assert target.exists()
    assert target.read_bytes().startswith(b'%PDF')


@pytest.mark.asyncio
async def test_menu_upload_normalises_to_monday(
    client: AsyncClient, test_owner: dict, test_property: dict, tmp_path: Path, monkeypatch
):
    monkeypatch.setattr('app.api.v1.menu.UPLOAD_ROOT', tmp_path)
    wed = _monday_of(date.today()) + timedelta(days=2)
    r = await _upload(client, test_owner['token'], test_property['property_id'], week_start=wed)
    assert r.status_code == 201
    assert r.json()['week_start_date'] == _monday_of(wed).isoformat()


@pytest.mark.asyncio
async def test_menu_upload_rejects_unsupported_extension(
    client: AsyncClient, test_owner: dict, test_property: dict
):
    r = await _upload(
        client, test_owner['token'], test_property['property_id'],
        filename='menu.docx', content_type='application/msword',
    )
    assert r.status_code == 422
    assert r.json()['error']['code'] == 'UNSUPPORTED_FILE_TYPE'


@pytest.mark.asyncio
async def test_menu_upload_rejects_oversize(
    client: AsyncClient, test_owner: dict, test_property: dict, tmp_path: Path, monkeypatch
):
    monkeypatch.setattr('app.api.v1.menu.UPLOAD_ROOT', tmp_path)
    monkeypatch.setattr('app.api.v1.menu.MAX_UPLOAD_BYTES', 1024)
    r = await _upload(
        client, test_owner['token'], test_property['property_id'],
        content=b'x' * 2048,
    )
    assert r.status_code == 413
    assert r.json()['error']['code'] == 'FILE_TOO_LARGE'


# ── Re-upload (deactivates prior) ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_menu_reupload_deactivates_prior(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession,
    tmp_path: Path, monkeypatch,
):
    monkeypatch.setattr('app.api.v1.menu.UPLOAD_ROOT', tmp_path)
    r1 = await _upload(client, test_owner['token'], test_property['property_id'], content=b'%PDF-A')
    assert r1.status_code == 201
    first_id = r1.json()['id']
    r2 = await _upload(client, test_owner['token'], test_property['property_id'], content=b'%PDF-B')
    assert r2.status_code == 201
    second_id = r2.json()['id']
    assert first_id != second_id

    schema = test_property['schema_name']
    await db.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    actives = (
        await db.execute(text("SELECT id FROM menu_uploads WHERE is_active = true"))
    ).mappings().fetchall()
    assert len(actives) == 1
    assert str(actives[0]['id']) == second_id
    await db.commit()


# ── List + delete ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_menu_list_and_delete(
    client: AsyncClient, test_owner: dict, test_property: dict, tmp_path: Path, monkeypatch
):
    monkeypatch.setattr('app.api.v1.menu.UPLOAD_ROOT', tmp_path)
    r = await _upload(client, test_owner['token'], test_property['property_id'], title='Week 1')
    menu_id = r.json()['id']

    lst = await client.get(
        f'/api/v1/menu?property_id={test_property["property_id"]}',
        headers=auth_headers(test_owner['token']),
    )
    assert lst.status_code == 200
    assert len(lst.json()['items']) == 1
    assert lst.json()['items'][0]['title'] == 'Week 1'

    d = await client.delete(
        f'/api/v1/menu/{menu_id}', headers=auth_headers(test_owner['token']),
    )
    assert d.status_code == 200

    # Re-upload same week now works again.
    r2 = await _upload(client, test_owner['token'], test_property['property_id'], title='Replacement')
    assert r2.status_code == 201


# ── File-URL token-signed serve ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_menu_file_url_and_public_serve(
    client: AsyncClient, test_owner: dict, test_property: dict, tmp_path: Path, monkeypatch
):
    monkeypatch.setattr('app.api.v1.menu.UPLOAD_ROOT', tmp_path)
    r = await _upload(client, test_owner['token'], test_property['property_id'])
    menu_id = r.json()['id']

    # Mint a URL
    u = await client.get(
        f'/api/v1/menu/{menu_id}/file-url',
        headers=auth_headers(test_owner['token']),
    )
    assert u.status_code == 200
    url = u.json()['url']
    assert url.startswith('/api/v1/menu/file/')

    # Open the URL with NO auth — token IS the auth.
    s = await client.get(url)
    assert s.status_code == 200
    assert s.headers['content-type'].startswith('application/pdf')
    assert s.content.startswith(b'%PDF')


@pytest.mark.asyncio
async def test_menu_file_serve_invalid_token_returns_404(client: AsyncClient):
    r = await client.get('/api/v1/menu/file/nonsense')
    assert r.status_code == 404


# ── Role gates ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_menu_upload_requires_staff_role(client: AsyncClient, tenant_portal_token: str):
    r = await client.post(
        '/api/v1/menu/upload',
        headers=auth_headers(tenant_portal_token),
        data={'property_id': str(uuid.uuid4()), 'week_start_date': '2026-06-01'},
        files={'file': ('x.pdf', b'%PDF', 'application/pdf')},
    )
    assert r.status_code == 403


# ── Tenant /tenant/menu/current ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_current_menu_returns_token_url(
    client: AsyncClient, test_owner: dict, test_tenant: dict,
    tenant_portal_token: str, tmp_path: Path, monkeypatch,
):
    monkeypatch.setattr('app.api.v1.menu.UPLOAD_ROOT', tmp_path)
    await _upload(client, test_owner['token'], test_tenant['property_id'], title='This week')
    r = await client.get(
        '/api/v1/tenant/menu/current',
        headers=auth_headers(tenant_portal_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['title'] == 'This week'
    assert body['is_current_week'] is True
    assert body['url'].startswith('/api/v1/menu/file/')

    # That URL is publicly fetchable.
    s = await client.get(body['url'])
    assert s.status_code == 200
    assert s.content.startswith(b'%PDF')


@pytest.mark.asyncio
async def test_tenant_current_menu_falls_back_to_prior_week(
    client: AsyncClient, test_owner: dict, test_tenant: dict,
    tenant_portal_token: str, tmp_path: Path, monkeypatch,
):
    monkeypatch.setattr('app.api.v1.menu.UPLOAD_ROOT', tmp_path)
    last_monday = _monday_of(date.today()) - timedelta(days=7)
    await _upload(
        client, test_owner['token'], test_tenant['property_id'],
        week_start=last_monday, title='Last week',
    )
    r = await client.get(
        '/api/v1/tenant/menu/current',
        headers=auth_headers(tenant_portal_token),
    )
    assert r.status_code == 200
    assert r.json()['title'] == 'Last week'
    assert r.json()['is_current_week'] is False


@pytest.mark.asyncio
async def test_tenant_current_menu_404_when_empty(
    client: AsyncClient, tenant_portal_token: str
):
    r = await client.get(
        '/api/v1/tenant/menu/current',
        headers=auth_headers(tenant_portal_token),
    )
    assert r.status_code == 404
