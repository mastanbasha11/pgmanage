"""
Payback plan endpoint tests.

The class-of-bug this file guards against:

    A new field is added to `PaybackPlanUpdate` but the hand-maintained
    `key_map` inside `set_payback_plan` isn't updated → KeyError → 500
    on save. The round-trip test below (every field goes out, every
    field comes back) fails the moment either side drifts.

Add ONE assertion to `test_save_full_plan_roundtrip` for every new field
you introduce on the plan model. It's not enough to add the field to the
Pydantic body — the test proves the field actually persists.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_save_minimal_plan(
    client: AsyncClient, test_owner: dict, test_property: dict
) -> None:
    """Minimal viable plan — just investment + target + rent — saves and
    round-trips."""
    pid = test_property["property_id"]
    resp = await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json={
            "investment_paise": 10_000_000_00,  # ₹1 Cr in paise
            "target_months": 18,
            "grace_months": 2,
            "lessor_rent_paise": 4_00_000_00,  # ₹4 L in paise
        },
    )
    assert resp.status_code == 200, resp.text

    got = await client.get(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
    )
    assert got.status_code == 200
    data = got.json()
    assert data["configured"] is True
    assert data["plan"]["investment_paise"] == 10_000_000_00
    assert data["plan"]["target_months"] == 18
    assert data["plan"]["grace_months"] == 2
    assert data["plan"]["lessor_rent_paise"] == 4_00_000_00


@pytest.mark.asyncio
async def test_save_full_plan_roundtrip(
    client: AsyncClient, test_owner: dict, test_property: dict
) -> None:
    """EVERY plan field must go over the wire and come back on the GET.

    This is the test that would have caught the lease_term_months /
    annual_rent_hike_pct KeyError. If you add a new field to
    PaybackPlanUpdate, add the corresponding assertion here.
    """
    pid = test_property["property_id"]
    payload = {
        "investment_paise": 81_59_216_00,      # ₹81,59,216
        "target_months": 18,
        "grace_months": 2,
        "lessor_rent_paise": 6_40_000_00,      # ₹6,40,000
        "plan_start_date": "2026-02-15",
        "lease_term_months": 36,               # 3-year lease
        "annual_rent_hike_pct": 5.0,
        "annual_hikes": [5.0, 6.0],            # year1→year2, year2→year3
    }
    resp = await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json=payload,
    )
    assert resp.status_code == 200, resp.text

    got = await client.get(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
    )
    assert got.status_code == 200
    body = got.json()
    plan = body["plan"]
    # Every input field survives the round-trip.
    assert plan["investment_paise"] == payload["investment_paise"]
    assert plan["target_months"] == payload["target_months"]
    assert plan["grace_months"] == payload["grace_months"]
    assert plan["lessor_rent_paise"] == payload["lessor_rent_paise"]
    assert plan["plan_start_date"] == payload["plan_start_date"]
    assert plan["lease_term_months"] == payload["lease_term_months"]
    assert float(plan["annual_rent_hike_pct"]) == payload["annual_rent_hike_pct"]
    assert plan["annual_hikes"] == payload["annual_hikes"]


@pytest.mark.asyncio
async def test_partial_update_only_changes_named_fields(
    client: AsyncClient, test_owner: dict, test_property: dict
) -> None:
    """PUT is a partial update — omitted fields keep their prior value."""
    pid = test_property["property_id"]
    # Seed a full plan
    await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json={
            "investment_paise": 10_000_000_00,
            "target_months": 24,
            "grace_months": 3,
            "lessor_rent_paise": 3_00_000_00,
            "lease_term_months": 48,
            "annual_rent_hike_pct": 5.0,
        },
    )
    # Now update only target_months
    resp = await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json={"target_months": 30},
    )
    assert resp.status_code == 200

    got = await client.get(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
    )
    plan = got.json()["plan"]
    assert plan["target_months"] == 30
    assert plan["grace_months"] == 3            # unchanged
    assert plan["lease_term_months"] == 48      # unchanged
    assert float(plan["annual_rent_hike_pct"]) == 5.0  # unchanged


@pytest.mark.asyncio
async def test_hike_math_year_stepped(
    client: AsyncClient, test_owner: dict, test_property: dict
) -> None:
    """Rent hikes should compound per year, and monthly targets should
    step down at each anniversary as rent goes up."""
    pid = test_property["property_id"]
    await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json={
            "investment_paise": 100_00_000_00,  # ₹1 Cr
            "target_months": 24,
            "grace_months": 2,
            "lessor_rent_paise": 4_00_000_00,   # ₹4 L base
            "lease_term_months": 48,
            "annual_rent_hike_pct": 5.0,
        },
    )
    got = await client.get(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
    )
    calc = got.json()["calc"]
    rents = calc["rent_by_month_paise"]
    # Month 0-1: grace → rent 0
    assert rents[0] == 0 and rents[1] == 0
    # Month 2-11: year 0 → base rent
    assert rents[2] == 4_00_000_00
    assert rents[11] == 4_00_000_00
    # Month 12-23: year 1 → ×1.05
    assert rents[12] == int(round(4_00_000_00 * 1.05))
    # Month 24-35: year 2 → ×1.05²
    assert rents[24] == int(round(4_00_000_00 * (1.05 ** 2)))
    # Month 36-47: year 3 → ×1.05³
    assert rents[36] == int(round(4_00_000_00 * (1.05 ** 3)))
    # Full response length matches lease_term_months
    assert len(rents) == 48
    assert len(calc["monthly_targets_paise"]) == 48
    # Post-payback profit == sum of monthly_targets past T
    T = 24
    assert calc["post_payback_months"] == 48 - T
    expected_post = sum(calc["monthly_targets_paise"][T:])
    assert calc["post_payback_profit_paise"] == expected_post


@pytest.mark.asyncio
async def test_annual_hikes_ladder_beats_flat_pct(
    client: AsyncClient, test_owner: dict, test_property: dict
) -> None:
    """When `annual_hikes` is set, the ladder wins over `annual_rent_hike_pct`.

    Scenario: 3-year lease with hikes [5%, 6%] — year 2 = base × 1.05,
    year 3 = base × 1.05 × 1.06. The flat 10% is ignored.
    """
    pid = test_property["property_id"]
    base_rent = 4_00_000_00
    await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json={
            "investment_paise": 100_00_000_00,
            "target_months": 24,
            "grace_months": 2,
            "lessor_rent_paise": base_rent,
            "lease_term_months": 36,
            "annual_rent_hike_pct": 10.0,          # should be shadowed
            "annual_hikes": [5.0, 6.0],
        },
    )
    got = await client.get(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
    )
    calc = got.json()["calc"]
    rents = calc["rent_by_month_paise"]
    # Year 1 (post-grace): base rent
    assert rents[2] == base_rent
    # Year 2: base × 1.05
    assert rents[12] == int(round(base_rent * 1.05))
    # Year 3: base × 1.05 × 1.06
    assert rents[24] == int(round(base_rent * 1.05 * 1.06))
    # Ladder shorter than lease → last value reused (year 3 already covers it here).


@pytest.mark.asyncio
async def test_annual_hikes_empty_list_falls_back_to_flat_pct(
    client: AsyncClient, test_owner: dict, test_property: dict
) -> None:
    """`annual_hikes = []` = "not set" → the flat pct still applies.

    Guards against a UI regression where the dialog sends `[]` instead
    of omitting the field.
    """
    pid = test_property["property_id"]
    base_rent = 4_00_000_00
    await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json={
            "investment_paise": 100_00_000_00,
            "target_months": 24,
            "grace_months": 0,
            "lessor_rent_paise": base_rent,
            "lease_term_months": 36,
            "annual_rent_hike_pct": 7.5,
            "annual_hikes": [],
        },
    )
    got = await client.get(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
    )
    rents = got.json()["calc"]["rent_by_month_paise"]
    # Empty ladder → flat 7.5% every year.
    assert rents[12] == int(round(base_rent * 1.075))
    assert rents[24] == int(round(base_rent * (1.075 ** 2)))


@pytest.mark.asyncio
async def test_lease_term_shorter_than_target_rejected(
    client: AsyncClient, test_owner: dict, test_property: dict
) -> None:
    """A 12-month lease with an 18-month target payback is nonsensical."""
    pid = test_property["property_id"]
    # Save a valid plan first so the property has a target_months.
    await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json={
            "investment_paise": 10_000_000_00,
            "target_months": 18,
            "grace_months": 2,
            "lessor_rent_paise": 4_00_000_00,
            "lease_term_months": 24,
        },
    )
    # Now check GET surfaces the error path when lease < target.
    # We validate by reading back — the compute returns an error field.
    # Direct enforcement lives on the frontend today; the server just
    # emits calc.error for the caller to render.
    resp = await client.put(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
        json={"lease_term_months": 12},  # < target 18
    )
    assert resp.status_code == 200  # save itself is allowed
    got = await client.get(
        f"/api/v1/properties/{pid}/payback-plan",
        headers=auth_headers(test_owner["token"]),
    )
    body = got.json()
    assert body["calc"].get("error"), body["calc"]
