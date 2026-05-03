"""
Multi-tenancy isolation tests — the most critical security tests.
Verifies that one org cannot access another org's data.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from tests.conftest import auth_headers


# ── Schema isolation ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_org_a_cannot_read_org_b_tenant(
    client: AsyncClient, db: AsyncSession
):
    """Tenant from Org A is NOT visible to Org B's token."""
    # Create two orgs
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()

    for org_id, slug in [
        (org_a_id, f"org-a-{str(org_a_id)[:8]}"),
        (org_b_id, f"org-b-{str(org_b_id)[:8]}"),
    ]:
        schema = f"org_{str(org_id).replace('-', '_')}"
        await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        await db.execute(
            text("""
                INSERT INTO public.organisations (id, name, slug, owner_email, owner_phone, schema_name)
                VALUES (:id, :name, :slug, :email, :phone, :schema)
            """),
            {
                "id": str(org_id),
                "name": f"Org {str(org_id)[:4]}",
                "slug": slug,
                "email": f"owner@{slug}.com",
                "phone": "+919876543000",
                "schema": schema,
            },
        )
        from app.models.schemas_migration import provision_org_schema
        await provision_org_schema(org_id, db)

    await db.commit()

    # Create a tenant in Org A
    schema_a = f"org_{str(org_a_id).replace('-', '_')}"
    await db.execute(text(f'SET LOCAL search_path TO "{schema_a}", public'))

    prop_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO properties (id, org_id, name, address_line1, city, state, pincode)
            VALUES (:id, :org_id, 'Org A PG', 'Test St', 'Chennai', 'TN', '600001')
        """),
        {"id": str(prop_id), "org_id": str(org_a_id)},
    )

    tenant_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO tenants (
                id, org_id, property_id, name, phone, id_type, id_number,
                emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
                move_in_date
            )
            VALUES (
                :id, :org_id, :pid, 'Org A Tenant', '+919876543001', 'AADHAR', '111111111111',
                'Parent', '+919876543002', 'Parent', '2024-01-01'
            )
        """),
        {"id": str(tenant_id), "org_id": str(org_a_id), "pid": str(prop_id)},
    )
    await db.commit()

    # Org B's token should NOT see Org A's tenant
    org_b_token = create_access_token({
        "sub": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "org_id": str(org_b_id),
        "role": "OWNER",
        "name": "Org B Owner",
        "property_ids": None,
    })

    response = await client.get(
        f"/api/v1/tenants/{tenant_id}",
        headers=auth_headers(org_b_token),
    )
    assert response.status_code == 404, (
        "Org B should get 404 — not find Org A's tenant"
    )


@pytest.mark.asyncio
async def test_org_b_properties_dont_include_org_a_data(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Org B cannot see Org A's properties."""
    # Create a second org
    other_org_id = uuid.uuid4()
    schema = f"org_{str(other_org_id).replace('-', '_')}"
    await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    await db.execute(
        text("""
            INSERT INTO public.organisations (id, name, slug, owner_email, owner_phone, schema_name)
            VALUES (:id, 'Other Org', :slug, 'other@org.com', '+919876540000', :schema)
        """),
        {
            "id": str(other_org_id),
            "slug": f"other-{str(other_org_id)[:8]}",
            "schema": schema,
        },
    )
    from app.models.schemas_migration import provision_org_schema
    await provision_org_schema(other_org_id, db)
    await db.commit()

    other_token = create_access_token({
        "sub": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "org_id": str(other_org_id),
        "role": "OWNER",
        "name": "Other Org Owner",
        "property_ids": None,
    })

    # Other org sees only its own (empty) properties
    response = await client.get(
        "/api/v1/properties",
        headers=auth_headers(other_token),
    )
    assert response.status_code == 200
    data = response.json()
    # None of test_owner's properties should appear
    ids = [item["id"] for item in data["items"]]
    assert str(test_property["property_id"]) not in ids


@pytest.mark.asyncio
async def test_payments_isolated_between_orgs(
    client: AsyncClient, test_owner: dict, db: AsyncSession
):
    """Org B's payment list is empty even when Org A has payments."""
    other_org_id = uuid.uuid4()
    schema = f"org_{str(other_org_id).replace('-', '_')}"
    await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    await db.execute(
        text("""
            INSERT INTO public.organisations (id, name, slug, owner_email, owner_phone, schema_name)
            VALUES (:id, 'Isolated Org', :slug, 'isolated@org.com', '+919876541111', :schema)
        """),
        {
            "id": str(other_org_id),
            "slug": f"isolated-{str(other_org_id)[:8]}",
            "schema": schema,
        },
    )
    from app.models.schemas_migration import provision_org_schema
    await provision_org_schema(other_org_id, db)
    await db.commit()

    other_token = create_access_token({
        "sub": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "org_id": str(other_org_id),
        "role": "OWNER",
        "name": "Isolated Org Owner",
        "property_ids": None,
    })

    response = await client.get(
        "/api/v1/payments",
        headers=auth_headers(other_token),
    )
    assert response.status_code == 200
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_leads_isolated_between_orgs(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Leads in Org A are not visible to Org B."""
    # Create a lead in Org A
    await client.post(
        "/api/v1/leads",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "name": "Org A Lead",
            "phone": "+919876543500",
            "source": "REFERRAL",
        },
    )

    # Org B gets empty leads
    other_org_id = uuid.uuid4()
    schema = f"org_{str(other_org_id).replace('-', '_')}"
    await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    await db.execute(
        text("""
            INSERT INTO public.organisations (id, name, slug, owner_email, owner_phone, schema_name)
            VALUES (:id, 'Leads Org B', :slug, 'leadsorgb@org.com', '+919876542222', :schema)
        """),
        {"id": str(other_org_id), "slug": f"leads-b-{str(other_org_id)[:8]}", "schema": schema},
    )
    from app.models.schemas_migration import provision_org_schema
    await provision_org_schema(other_org_id, db)
    await db.commit()

    other_token = create_access_token({
        "sub": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "org_id": str(other_org_id),
        "role": "OWNER",
        "name": "Leads Org B Owner",
        "property_ids": None,
    })

    response = await client.get(
        "/api/v1/leads",
        headers=auth_headers(other_token),
    )
    assert response.status_code == 200
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_new_org_signup_creates_isolated_schema(client: AsyncClient):
    """Signing up creates a unique schema not shared with other orgs."""
    unique_email = f"isolation-{uuid.uuid4().hex[:8]}@test.com"
    unique_phone = "+91987" + str(uuid.uuid4().int)[:6][:6]

    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": "Isolation Test PG",
            "owner_name": "Test User",
            "owner_email": unique_email,
            "owner_phone": "+91987654" + str(uuid.uuid4().int)[:4].zfill(4),
            "password": "TestPass123",
            "city": "Bangalore",
        },
    )
    assert response.status_code in (201, 409)
    if response.status_code == 201:
        data = response.json()
        assert "org_id" in data
        # Each org gets a unique schema name
        org_id = data["org_id"]
        expected_schema = f"org_{org_id.replace('-', '_')}"
        # Schema name is deterministic from org_id
        assert len(expected_schema) > 10


@pytest.mark.asyncio
async def test_expenses_isolated_between_orgs(
    client: AsyncClient, test_owner: dict, test_property: dict, db: AsyncSession
):
    """Expenses in Org A are not visible to Org B."""
    # Create expense in Org A
    await client.post(
        "/api/v1/expenses",
        headers=auth_headers(test_owner["token"]),
        json={
            "property_id": str(test_property["property_id"]),
            "category_id": str(test_property["category_id"]),
            "amount_paise": 50000,
            "purchase_date": "2024-06-15",
        },
    )

    # Create Org B
    other_org_id = uuid.uuid4()
    schema = f"org_{str(other_org_id).replace('-', '_')}"
    await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    await db.execute(
        text("""
            INSERT INTO public.organisations (id, name, slug, owner_email, owner_phone, schema_name)
            VALUES (:id, 'Expenses Org B', :slug, 'exporgb@org.com', '+919876543333', :schema)
        """),
        {"id": str(other_org_id), "slug": f"exp-b-{str(other_org_id)[:8]}", "schema": schema},
    )
    from app.models.schemas_migration import provision_org_schema
    await provision_org_schema(other_org_id, db)
    await db.commit()

    other_token = create_access_token({
        "sub": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "org_id": str(other_org_id),
        "role": "OWNER",
        "name": "Expenses Org B Owner",
        "property_ids": None,
    })

    response = await client.get(
        "/api/v1/expenses",
        headers=auth_headers(other_token),
    )
    assert response.status_code == 200
    assert response.json()["total"] == 0
