"""Financial dashboard endpoints — OWNER/PARTNER only."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context

router = APIRouter()


def _owner_only(ctx: OrgContext) -> None:
    if ctx.role not in ("OWNER", "PARTNER"):
        raise HTTPException(403, "Financial dashboard is restricted to owners and partners")


@router.get("/dashboard/summary", summary="KPI snapshot (owner only)")
async def dashboard_summary(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    month: int | None = Query(None),
    year: int | None = Query(None),
):
    _owner_only(ctx)

    now = datetime.now()
    m = month or now.month
    y = year or now.year

    # Fiscal period (start/end dates) for the cash-flow KPIs.
    period_start = None
    period_end = None
    if property_id:
        from app.services.billing_period import get_fiscal_period
        fiscal = await get_fiscal_period(property_id, m, y, db)
        period_start = fiscal.period_start
        period_end = fiscal.period_end

    pid_filter = "AND rle.property_id = :pid" if property_id else ""
    params: dict[str, Any] = {"org_id": str(ctx.org_id), "month": m, "year": y}
    if property_id:
        params["pid"] = str(property_id)

    # Rent stats — match the Rent & Payments page exactly:
    #   1. Subtract discount from outstanding (settled = paid + discount)
    #   2. Exclude tenants who checked out on or before the viewed month
    rent_result = await db.execute(
        text(f"""
            SELECT
                COALESCE(SUM(rle.amount_due_paise), 0) as expected,
                COALESCE(SUM(rle.amount_paid_paise), 0) as collected,
                COALESCE(SUM(COALESCE(rle.discount_paise, 0)), 0) as discount_total,
                -- Per-row clamped sum: each tenant's shortfall, summed.
                -- Aggregate subtraction (max(expected - settled, 0)) is wrong
                -- because over-payment by one tenant silently masks
                -- under-payment by another, giving a false 0 outstanding.
                COALESCE(SUM(GREATEST(
                    rle.amount_due_paise
                    - rle.amount_paid_paise
                    - COALESCE(rle.discount_paise, 0),
                    0
                )), 0) as outstanding,
                COUNT(DISTINCT rle.tenant_id) as total_tenants
            FROM rent_ledger_entries rle
            JOIN tenants t ON t.id = rle.tenant_id
            WHERE t.org_id = :org_id AND rle.month = :month AND rle.year = :year
              AND (
                t.actual_move_out_date IS NULL
                OR t.actual_move_out_date
                   >= (make_date(:year, :month, 1) + INTERVAL '1 month')::date
              )
            {pid_filter}
        """),
        params,
    )
    rent = rent_result.mappings().fetchone()

    # Expense stats — fiscal period when a property is selected, else calendar month
    exp_filter = "AND e.property_id = :pid" if property_id else ""
    if period_start and period_end:
        exp_result = await db.execute(
            text(f"""
                SELECT COALESCE(SUM(e.amount_paise), 0) as total_expenses
                FROM expenses e
                WHERE e.org_id = :org_id
                  AND e.purchase_date BETWEEN :start AND :end
                  AND e.approval_status = 'APPROVED'
                  AND e.is_deleted = false
                {exp_filter}
            """),
            {**params, "start": period_start, "end": period_end},
        )
    else:
        exp_result = await db.execute(
            text(f"""
                SELECT COALESCE(SUM(e.amount_paise), 0) as total_expenses
                FROM expenses e
                WHERE e.org_id = :org_id
                    AND EXTRACT(MONTH FROM e.purchase_date) = :month
                    AND EXTRACT(YEAR FROM e.purchase_date) = :year
                    AND e.approval_status = 'APPROVED'
                    AND e.is_deleted = false
                {exp_filter}
            """),
            params,
        )
    expenses = exp_result.mappings().fetchone()

    # Occupancy. RESERVED beds roll into `occupied` for the ratio — from
    # the owner's POV a reserved bed is not sellable today, same as an
    # occupied one, so the dashboard number should reflect "how full is
    # the property" not just "who's physically living in it".
    bed_filter = "AND b.property_id = :pid" if property_id else ""
    occ_result = await db.execute(
        text(f"""
            SELECT
                COUNT(*) FILTER (WHERE b.status IN ('OCCUPIED', 'RESERVED')) as occupied,
                COUNT(*) FILTER (WHERE b.status = 'RESERVED') as reserved,
                COUNT(*) as total
            FROM beds b
            JOIN rooms r ON r.id = b.room_id
            JOIN properties p ON p.id = b.property_id
            WHERE p.org_id = :org_id {bed_filter}
        """),
        params,
    )
    occ = occ_result.mappings().fetchone()

    expected = rent["expected"] or 0
    collected = rent["collected"] or 0
    discount_total = rent["discount_total"] or 0
    outstanding_total = rent["outstanding"] or 0
    settled = collected + discount_total
    total_expenses = expenses["total_expenses"] or 0
    total_beds = occ["total"] or 0
    # `occupied` here already includes RESERVED (see SELECT above), so the
    # ratio is truthful. `reserved_beds` is broken out so the frontend can
    # render an inline "of which N reserved" if it wants.
    occupied = occ["occupied"] or 0
    reserved_beds = occ["reserved"] or 0
    vacant_beds = max(total_beds - occupied, 0)

    # Advance + Refund (fiscal period when property given, else calendar month)
    pay_filter = "AND p.property_id = :pid" if property_id else ""
    if period_start and period_end:
        adv_res = await db.execute(
            text(f"""
                SELECT
                    COALESCE(SUM(p.amount_paise) FILTER (
                        WHERE p.payment_type IN ('ADVANCE', 'DEPOSIT')
                    ), 0) AS advance_paise,
                    COALESCE(SUM(p.amount_paise) FILTER (
                        WHERE p.payment_type = 'REFUND'
                    ), 0) AS refund_paise,
                    COALESCE(SUM(p.amount_paise) FILTER (
                        WHERE p.payment_type = 'POWER'
                    ), 0) AS power_paise
                FROM payments p
                WHERE p.org_id = :org_id
                  AND p.is_deleted = false
                  AND (p.collected_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :start AND :end
                  {pay_filter}
            """),
            {**params, "start": period_start, "end": period_end},
        )
    else:
        adv_res = await db.execute(
            text(f"""
                SELECT
                    COALESCE(SUM(p.amount_paise) FILTER (
                        WHERE p.payment_type IN ('ADVANCE', 'DEPOSIT')
                    ), 0) AS advance_paise,
                    COALESCE(SUM(p.amount_paise) FILTER (
                        WHERE p.payment_type = 'REFUND'
                    ), 0) AS refund_paise,
                    COALESCE(SUM(p.amount_paise) FILTER (
                        WHERE p.payment_type = 'POWER'
                    ), 0) AS power_paise
                FROM payments p
                WHERE p.org_id = :org_id
                  AND p.is_deleted = false
                  AND EXTRACT(MONTH FROM p.collected_at AT TIME ZONE 'Asia/Kolkata') = :month
                  AND EXTRACT(YEAR FROM p.collected_at AT TIME ZONE 'Asia/Kolkata') = :year
                  {pay_filter}
            """),
            params,
        )
    adv = adv_res.mappings().fetchone() or {}
    advance_received = adv.get("advance_paise", 0) or 0
    refunds_given = adv.get("refund_paise", 0) or 0
    power_received = adv.get("power_paise", 0) or 0

    # Fold bookings into rent_in_period (DAILY) + advance_received (ADVANCE).
    # This keeps the dashboard's "Advance Received" KPI consistent with the
    # Rent & Payments page's collector cards.
    book_filter = "AND b.property_id = :pid" if property_id else ""
    if period_start and period_end:
        book_split_res = await db.execute(
            text(f"""
                SELECT
                    COALESCE(SUM(b.amount_paise) FILTER (WHERE b.kind = 'ADVANCE'), 0) AS advance_paise,
                    COALESCE(SUM(b.amount_paise) FILTER (WHERE b.kind = 'DAILY'), 0) AS daily_paise
                FROM bookings b
                WHERE b.org_id = :org_id
                  AND b.is_deleted = false
                  AND b.collected_at BETWEEN :start AND :end
                  {book_filter}
            """),
            {**params, "start": period_start, "end": period_end},
        )
    else:
        book_split_res = await db.execute(
            text(f"""
                SELECT
                    COALESCE(SUM(b.amount_paise) FILTER (WHERE b.kind = 'ADVANCE'), 0) AS advance_paise,
                    COALESCE(SUM(b.amount_paise) FILTER (WHERE b.kind = 'DAILY'), 0) AS daily_paise
                FROM bookings b
                WHERE b.org_id = :org_id
                  AND b.is_deleted = false
                  AND EXTRACT(MONTH FROM b.collected_at) = :month
                  AND EXTRACT(YEAR FROM b.collected_at) = :year
                  {book_filter}
            """),
            params,
        )
    bs = book_split_res.mappings().fetchone() or {}
    advance_bookings = bs.get("advance_paise", 0) or 0
    daily_bookings = bs.get("daily_paise", 0) or 0
    advance_received += advance_bookings

    # Expenses by paid_by (or fall back to creator's username) — same period semantics
    by_person_filter = "AND e.property_id = :pid" if property_id else ""
    if period_start and period_end:
        by_person_res = await db.execute(
            text(f"""
                SELECT COALESCE(NULLIF(TRIM(e.paid_by), ''), u.name, 'Unattributed') AS person,
                       SUM(e.amount_paise) AS total_paise,
                       COUNT(*) AS count
                FROM expenses e
                LEFT JOIN users u ON u.id = e.created_by
                WHERE e.org_id = :org_id
                  AND e.is_deleted = false
                  AND e.approval_status = 'APPROVED'
                  AND e.purchase_date BETWEEN :start AND :end
                  {by_person_filter}
                GROUP BY 1
                ORDER BY total_paise DESC
            """),
            {**params, "start": period_start, "end": period_end},
        )
    else:
        by_person_res = await db.execute(
            text(f"""
                SELECT COALESCE(NULLIF(TRIM(e.paid_by), ''), u.name, 'Unattributed') AS person,
                       SUM(e.amount_paise) AS total_paise,
                       COUNT(*) AS count
                FROM expenses e
                LEFT JOIN users u ON u.id = e.created_by
                WHERE e.org_id = :org_id
                  AND e.is_deleted = false
                  AND e.approval_status = 'APPROVED'
                  AND EXTRACT(MONTH FROM e.purchase_date) = :month
                  AND EXTRACT(YEAR FROM e.purchase_date) = :year
                  {by_person_filter}
                GROUP BY 1
                ORDER BY total_paise DESC
            """),
            params,
        )
    expenses_by_person = [dict(r) for r in by_person_res.mappings().fetchall()]

    # Cash collected by person — aggregates paid_to across rent/advance payments
    # AND bookings. Falls back to the staff member's user.name when paid_to is
    # blank, so historical rows still attribute somewhere.
    cash_in_filter_p = "AND p.property_id = :pid" if property_id else ""
    cash_in_filter_b = "AND b.property_id = :pid" if property_id else ""
    if period_start and period_end:
        cash_in_res = await db.execute(
            text(f"""
                WITH unioned AS (
                    SELECT
                        COALESCE(NULLIF(TRIM(p.paid_to), ''), u.name, 'Unattributed') AS person,
                        p.amount_paise AS amount
                    FROM payments p
                    LEFT JOIN users u ON u.id = p.collected_by
                    WHERE p.org_id = :org_id
                      AND p.is_deleted = false
                      AND p.payment_type IN ('RENT','ADVANCE','DEPOSIT','FOOD','OTHER_CHARGE')
                      AND (p.collected_at AT TIME ZONE 'Asia/Kolkata')::date
                          BETWEEN :start AND :end
                      {cash_in_filter_p}
                    UNION ALL
                    SELECT
                        COALESCE(NULLIF(TRIM(b.paid_to), ''), u.name, 'Unattributed') AS person,
                        b.amount_paise AS amount
                    FROM bookings b
                    LEFT JOIN users u ON u.id = b.collected_by
                    WHERE b.org_id = :org_id
                      AND b.is_deleted = false
                      AND b.collected_at BETWEEN :start AND :end
                      {cash_in_filter_b}
                )
                SELECT person, SUM(amount) AS total_paise, COUNT(*) AS count
                FROM unioned
                GROUP BY person
                ORDER BY total_paise DESC
            """),
            {**params, "start": period_start, "end": period_end},
        )
    else:
        cash_in_res = await db.execute(
            text(f"""
                WITH unioned AS (
                    SELECT
                        COALESCE(NULLIF(TRIM(p.paid_to), ''), u.name, 'Unattributed') AS person,
                        p.amount_paise AS amount
                    FROM payments p
                    LEFT JOIN users u ON u.id = p.collected_by
                    WHERE p.org_id = :org_id
                      AND p.is_deleted = false
                      AND p.payment_type IN ('RENT','ADVANCE','DEPOSIT','FOOD','OTHER_CHARGE')
                      AND EXTRACT(MONTH FROM p.collected_at AT TIME ZONE 'Asia/Kolkata') = :month
                      AND EXTRACT(YEAR FROM p.collected_at AT TIME ZONE 'Asia/Kolkata') = :year
                      {cash_in_filter_p}
                    UNION ALL
                    SELECT
                        COALESCE(NULLIF(TRIM(b.paid_to), ''), u.name, 'Unattributed') AS person,
                        b.amount_paise AS amount
                    FROM bookings b
                    LEFT JOIN users u ON u.id = b.collected_by
                    WHERE b.org_id = :org_id
                      AND b.is_deleted = false
                      AND EXTRACT(MONTH FROM b.collected_at) = :month
                      AND EXTRACT(YEAR FROM b.collected_at) = :year
                      {cash_in_filter_b}
                )
                SELECT person, SUM(amount) AS total_paise, COUNT(*) AS count
                FROM unioned
                GROUP BY person
                ORDER BY total_paise DESC
            """),
            params,
        )
    cash_in_by_person = [dict(r) for r in cash_in_res.mappings().fetchall()]

    # Overdue: number of distinct tenants whose ledger this month or older isn't fully paid
    overdue_filter = "AND t.property_id = :pid" if property_id else ""
    overdue_res = await db.execute(
        text(f"""
            SELECT COUNT(DISTINCT rle.tenant_id) AS overdue_tenants
            FROM rent_ledger_entries rle
            JOIN tenants t ON t.id = rle.tenant_id
            WHERE t.org_id = :org_id
              AND ((rle.year < :year) OR (rle.year = :year AND rle.month <= :month))
              AND rle.amount_paid_paise < rle.amount_due_paise
              {overdue_filter}
        """),
        params,
    )
    overdue_tenants = (overdue_res.mappings().fetchone() or {}).get("overdue_tenants", 0)

    # Period attribution (project-period-attribution-rule): collection rate
    # uses fiscal-window collected vs rent-month expected. Settled is no
    # longer numerator — late catch-ups should still count toward rate.
    rate = (settled / expected) if expected > 0 else 0  # placeholder, overwritten below
    occupancy_rate = (occupied / total_beds) if total_beds > 0 else 0

    # For Net Income we use the period-bound rent collection if a property
    # was selected (matches partner P&L), else the ledger-rolled-up figure.
    # Daily bookings are short-stay rent income — folded in here.
    if property_id and period_start and period_end:
        rip_res = await db.execute(
            text("""
                SELECT COALESCE(SUM(amount_paise), 0) AS rip
                FROM payments
                WHERE org_id = :org_id AND property_id = :pid
                  AND is_deleted = false
                  AND payment_type = 'RENT'
                  AND (collected_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :start AND :end
            """),
            {**params, "start": period_start, "end": period_end},
        )
        rent_in_period = rip_res.scalar() or 0
    else:
        # No property selected → fall back to calendar-month on collected_at
        # so the org-wide Home KPIs still obey the fiscal-window rule.
        rip_res = await db.execute(
            text("""
                SELECT COALESCE(SUM(amount_paise), 0) AS rip
                FROM payments
                WHERE org_id = :org_id
                  AND is_deleted = false
                  AND payment_type = 'RENT'
                  AND EXTRACT(MONTH FROM collected_at AT TIME ZONE 'Asia/Kolkata') = :month
                  AND EXTRACT(YEAR FROM collected_at AT TIME ZONE 'Asia/Kolkata') = :year
            """),
            params,
        )
        rent_in_period = rip_res.scalar() or 0
    rent_in_period += daily_bookings
    # Recompute rate with the fiscal-window collected as the numerator.
    rate = (rent_in_period / expected) if expected > 0 else 0

    # Bookings revenue is already split into rent_in_period (DAILY) and
    # advance_received (ADVANCE) above — keep the total exposed for the KPI.
    bookings_revenue = advance_bookings + daily_bookings

    # Opening balance — owner-set carry-forward from the prior month. Only
    # meaningful when a single property is in scope (org-level rollup would
    # sum opening balances across properties, which the dashboard doesn't
    # currently show separately).
    opening_balance = 0
    if property_id:
        ob_row = (await db.execute(
            text(
                "SELECT opening_balance_paise FROM billing_periods "
                "WHERE property_id = :pid AND period_month = :m AND period_year = :y"
            ),
            {"pid": str(property_id), "m": m, "y": y},
        )).scalar_one_or_none()
        opening_balance = int(ob_row or 0)

    # rent_in_period already includes daily_bookings (folded in above).
    # Expose Rent-only and Daily-stays separately for the dashboard tiles.
    rent_only = int(rent_in_period) - int(daily_bookings)

    # Power-meter recharges are property-level income (no tenant link) — they
    # roll into cash_in alongside rent, advance bookings, and ADVANCE/DEPOSIT
    # payments. See [[project-period-attribution-rule]].
    # Opening Balance + Rent + Advance + Daily Stays + Power = Total Received.
    cash_in = opening_balance + rent_in_period + advance_received + power_received
    cash_out = total_expenses + refunds_given

    # Owner profit split. Each active OWNER on the property_team gets their
    # share_pct of the profit. Missing shares (< 100%) leave a "Unassigned"
    # bucket so the owner sees they haven't fully configured the roster.
    owner_profits: list[dict] = []
    if property_id:
        own_res = await db.execute(
            text("""
                SELECT name, share_pct
                FROM property_team
                WHERE property_id = :pid AND is_active = true
                  AND role = 'OWNER'::team_role_enum
                  AND share_pct IS NOT NULL
                ORDER BY sort_order, name
            """),
            {"pid": str(property_id)},
        )
        owners = [dict(r) for r in own_res.mappings().fetchall()]
        profit = cash_in - cash_out
        assigned_pct = sum(float(o["share_pct"] or 0) for o in owners)
        for o in owners:
            pct = float(o["share_pct"] or 0)
            owner_profits.append({
                "name": o["name"],
                "share_pct": pct,
                "share_paise": int(round(profit * pct / 100)),
            })
        if assigned_pct < 100:
            unassigned_pct = 100 - assigned_pct
            owner_profits.append({
                "name": "Unassigned",
                "share_pct": unassigned_pct,
                "share_paise": int(round(profit * unassigned_pct / 100)),
            })

    # Recurring items spike detection. Diff this fiscal window's keyword
    # buckets against the prior same-length window; surface items with
    # meaningful growth (>= 50% and >= ₹500 absolute change) so owners see
    # what's actually spiking, not tiny noise.
    top_recurring_spikes: list[dict] = []
    if period_start and period_end:
        from datetime import timedelta as _td
        span = (period_end - period_start).days + 1
        prev_end = period_start - _td(days=1)
        prev_start = prev_end - _td(days=span - 1)
        rec_filter = "AND e.property_id = :pid" if property_id else ""

        async def _bucket_totals(bstart, bend):
            r = await db.execute(
                text(f"""
                    WITH keywords(label, pattern) AS (VALUES
                        ('Vegetables', '%vegetable%'), ('Kirana', '%kirana%'),
                        ('Zepto', '%zepto%'), ('Insta Mart', '%insta mart%'),
                        ('Milk', '%milk%'), ('Curd', '%curd%'),
                        ('Chicken', '%chicken%'), ('Mutton', '%mutton%'),
                        ('Eggs', '%egg%'), ('Mushroom', '%mushroom%'),
                        ('Tomato', '%tomato%'), ('Tomato', '%tamota%'),
                        ('Onion', '%onion%'),
                        ('Petrol', '%petrol%'), ('Diesel', '%diesel%'),
                        ('Oil', '%oil%'), ('Masala', '%masala%'),
                        ('Cleaning', '%cleaning%'), ('Water cans', '%water bottle%')
                    )
                    SELECT k.label AS item, SUM(e.amount_paise) AS total_paise
                    FROM keywords k JOIN expenses e ON e.description ILIKE k.pattern
                    WHERE e.org_id = :org_id
                      AND e.purchase_date BETWEEN :start AND :end
                      AND e.approval_status = 'APPROVED' AND e.is_deleted = false
                      {rec_filter}
                    GROUP BY k.label
                """),
                {**params, "start": bstart, "end": bend},
            )
            return {row["item"]: int(row["total_paise"] or 0) for row in r.mappings().fetchall()}

        cur_buckets = await _bucket_totals(period_start, period_end)
        prev_buckets = await _bucket_totals(prev_start, prev_end)
        for item, cur in cur_buckets.items():
            prev = prev_buckets.get(item, 0)
            delta = cur - prev
            if delta < 50_000:  # < ₹500 absolute — ignore noise
                continue
            pct = ((cur / prev) - 1) * 100 if prev > 0 else None
            if prev > 0 and pct is not None and pct < 50:
                continue
            top_recurring_spikes.append({
                "item": item,
                "current_paise": cur,
                "previous_paise": prev,
                "delta_paise": delta,
                "pct_change": round(pct, 1) if pct is not None else None,
            })
        top_recurring_spikes.sort(key=lambda r: r["delta_paise"], reverse=True)
        top_recurring_spikes = top_recurring_spikes[:5]

    return {
        # Canonical names
        "expected_rent_paise": expected,
        # `collected_rent_paise` is now the fiscal-window value (cash actually
        # received this period). The old ledger-roll-up lives as
        # `ledger_paid_paise` for any caller specifically wanting "paid
        # toward this rent month, whenever".
        "collected_rent_paise": rent_in_period,
        "rent_only_paise": rent_only,
        "ledger_paid_paise": collected,
        "discount_paise": discount_total,
        "outstanding_paise": outstanding_total,
        "collection_rate": round(rate, 4),                   # 0..1 fraction
        "advance_received_paise": advance_received,
        "bookings_revenue_paise": int(bookings_revenue),
        "daily_stays_paise": int(daily_bookings),
        "power_received_paise": int(power_received),
        "opening_balance_paise": int(opening_balance),
        "refunds_given_paise": refunds_given,
        "total_expenses_paise": total_expenses,
        "total_received_paise": int(cash_in),
        "total_given_paise": int(cash_out),
        "top_recurring_spikes": top_recurring_spikes,
        "owner_profits": owner_profits,
        "net_income_paise": cash_in - cash_out,
        "expenses_by_person": expenses_by_person,
        "cash_in_by_person": cash_in_by_person,
        "occupancy_rate": round(occupancy_rate, 4),          # 0..1 fraction; INCLUDES reserved
        "total_tenants": rent["total_tenants"] or 0,
        "vacant_beds": vacant_beds,
        "reserved_beds": reserved_beds,
        "total_beds": total_beds,
        "overdue_tenants": overdue_tenants or 0,
        "month": m,
        "year": y,
        "period_start": str(period_start) if period_start else None,
        "period_end": str(period_end) if period_end else None,
        # Back-compat aliases (older clients)
        "gross_rent_expected_paise": expected,
        "rent_collected_paise": rent_in_period,
        "active_tenants": rent["total_tenants"] or 0,
    }


@router.get("/dashboard/cashflow", summary="Monthly cash in vs out (owner only)")
async def cashflow(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    months: int = Query(12, le=24),
):
    _owner_only(ctx)

    pid_filter_income = "AND property_id = :pid" if property_id else ""
    pid_filter_expense = "AND property_id = :pid" if property_id else ""
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}
    if property_id:
        params["pid"] = str(property_id)

    # Income = Total Received (dashboard summary rule):
    #   opening_balance + rent + advance + daily + power (non-REFUND payments +
    #   all bookings). We aggregate payments (excluding REFUND) and bookings
    #   separately by calendar month on collected_at, then fold opening_balance
    #   from billing_periods on (property, year, month).
    income_result = await db.execute(
        text(f"""
            SELECT EXTRACT(YEAR FROM collected_at)::int as year,
                   EXTRACT(MONTH FROM collected_at)::int as month,
                   SUM(amount_paise) as income_paise
            FROM payments
            WHERE org_id = :org_id AND is_deleted = false
                AND payment_type <> 'REFUND'
                AND collected_at >= NOW() - INTERVAL '{months} months'
            {pid_filter_income}
            GROUP BY year, month
            ORDER BY year, month
        """),
        params,
    )
    income_rows = {(r["year"], r["month"]): r["income_paise"] for r in income_result.mappings().fetchall()}

    booking_result = await db.execute(
        text(f"""
            SELECT EXTRACT(YEAR FROM collected_at)::int as year,
                   EXTRACT(MONTH FROM collected_at)::int as month,
                   SUM(amount_paise) as booking_paise
            FROM bookings
            WHERE org_id = :org_id AND is_deleted = false
                AND collected_at >= NOW() - INTERVAL '{months} months'
            {pid_filter_income}
            GROUP BY year, month
        """),
        params,
    )
    booking_rows = {(r["year"], r["month"]): r["booking_paise"] for r in booking_result.mappings().fetchall()}

    opening_result = await db.execute(
        text(f"""
            SELECT period_year as year, period_month as month,
                   SUM(opening_balance_paise) as opening_paise
            FROM billing_periods
            WHERE opening_balance_paise > 0
                {"AND property_id = :pid" if property_id else ""}
            GROUP BY period_year, period_month
        """),
        params,
    )
    opening_rows = {(r["year"], r["month"]): r["opening_paise"] for r in opening_result.mappings().fetchall()}

    # Expenses = Total Spent: approved expenses + REFUND payments in the same
    # calendar month (fiscal window handled at summary time; monthly trend
    # stays calendar-month for readability).
    expense_result = await db.execute(
        text(f"""
            SELECT EXTRACT(YEAR FROM purchase_date)::int as year,
                   EXTRACT(MONTH FROM purchase_date)::int as month,
                   SUM(amount_paise) as expense_paise
            FROM expenses
            WHERE org_id = :org_id AND is_deleted = false AND approval_status = 'APPROVED'
                AND purchase_date >= NOW() - INTERVAL '{months} months'
            {pid_filter_expense}
            GROUP BY year, month
            ORDER BY year, month
        """),
        params,
    )
    expense_rows = {(r["year"], r["month"]): r["expense_paise"] for r in expense_result.mappings().fetchall()}

    refund_result = await db.execute(
        text(f"""
            SELECT EXTRACT(YEAR FROM collected_at)::int as year,
                   EXTRACT(MONTH FROM collected_at)::int as month,
                   SUM(amount_paise) as refund_paise
            FROM payments
            WHERE org_id = :org_id AND is_deleted = false
                AND payment_type = 'REFUND'
                AND collected_at >= NOW() - INTERVAL '{months} months'
            {pid_filter_income}
            GROUP BY year, month
        """),
        params,
    )
    refund_rows = {(r["year"], r["month"]): r["refund_paise"] for r in refund_result.mappings().fetchall()}

    # Build unified timeline. Frontend expects {items: [{month, income_paise, expenses_paise}]}
    # with `month` as a display label (e.g. "May 2026").
    import calendar
    all_keys = sorted(
        set(income_rows.keys()) | set(expense_rows.keys())
        | set(booking_rows.keys()) | set(refund_rows.keys()) | set(opening_rows.keys())
    )
    items = []
    for year, month in all_keys:
        income = (
            int(income_rows.get((year, month), 0) or 0)
            + int(booking_rows.get((year, month), 0) or 0)
            + int(opening_rows.get((year, month), 0) or 0)
        )
        expense = (
            int(expense_rows.get((year, month), 0) or 0)
            + int(refund_rows.get((year, month), 0) or 0)
        )
        items.append({
            "month": f"{calendar.month_abbr[month]} {year}",
            "income_paise": income,
            "expenses_paise": expense,
            "net_paise": income - expense,
        })

    return {"items": items, "months": months}


@router.get(
    "/dashboard/roi-by-room",
    summary="Revenue per room + room-type ROI (owner only)",
)
async def roi_by_room(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    months: int = Query(6, ge=1, le=24),
):
    """
    Per-room revenue over the last `months` calendar months plus a
    room-type roll-up so owners can see which room class earns most per
    bed. Vacancy signal comes from the current occupancy state (RESERVED
    counts as filled, MAINTENANCE doesn't).

    Expense attribution is intentionally property-level for now — the
    user picked "revenue only, no expense allocation" during design. The
    /expenses/summary endpoint gives the property-level spend view.
    """
    _owner_only(ctx)
    if not property_id:
        raise HTTPException(400, "property_id is required")

    params: dict[str, Any] = {"pid": str(property_id), "months": months}
    revenue_res = await db.execute(
        text("""
            SELECT r.id AS room_id, r.room_number, rt.name AS room_type,
                   rt.capacity, rt.monthly_base_rent_paise,
                   COALESCE(SUM(p.amount_paise), 0) AS revenue_paise,
                   COUNT(p.id) FILTER (WHERE p.payment_type = 'RENT') AS rent_txns
            FROM rooms r
            LEFT JOIN room_types rt ON rt.id = r.room_type_id
            LEFT JOIN beds b ON b.room_id = r.id
            LEFT JOIN tenants t ON t.bed_id = b.id AND t.is_deleted = false
            LEFT JOIN payments p ON p.tenant_id = t.id
              AND p.is_deleted = false
              AND p.payment_type IN ('RENT', 'ADVANCE', 'DEPOSIT')
              AND p.collected_at >= NOW() - (:months || ' months')::interval
            WHERE r.property_id = :pid AND r.is_active = true
            GROUP BY r.id, r.room_number, rt.name, rt.capacity, rt.monthly_base_rent_paise
            ORDER BY r.room_number
        """),
        params,
    )
    rooms = [dict(r) for r in revenue_res.mappings().fetchall()]

    # Current occupancy signal per room (used for vacancy alerts).
    occ_res = await db.execute(
        text("""
            SELECT r.id AS room_id,
                   COUNT(b.id) FILTER (WHERE b.status = 'OCCUPIED') AS occupied,
                   COUNT(b.id) FILTER (WHERE b.status = 'VACANT')  AS vacant,
                   COUNT(b.id) FILTER (WHERE b.status = 'RESERVED') AS reserved,
                   COUNT(b.id) AS total_beds
            FROM rooms r
            LEFT JOIN beds b ON b.room_id = r.id
            WHERE r.property_id = :pid AND r.is_active = true
            GROUP BY r.id
        """),
        {"pid": str(property_id)},
    )
    occ = {str(r["room_id"]): dict(r) for r in occ_res.mappings().fetchall()}

    for row in rooms:
        o = occ.get(str(row["room_id"]), {})
        row["occupied_beds"] = int(o.get("occupied", 0) or 0)
        row["vacant_beds"] = int(o.get("vacant", 0) or 0)
        row["reserved_beds"] = int(o.get("reserved", 0) or 0)
        row["total_beds"] = int(o.get("total_beds", 0) or 0)
        # Revenue per bed (avg over the window) — normalises for room size.
        row["revenue_per_bed_paise"] = (
            int(row["revenue_paise"]) // row["total_beds"]
            if row["total_beds"] > 0
            else 0
        )
        row["revenue_per_bed_per_month_paise"] = (
            row["revenue_per_bed_paise"] // months if months > 0 else 0
        )
        # Expected monthly revenue if all beds occupied at base rent.
        expected = int(row["monthly_base_rent_paise"] or 0) * int(row["total_beds"] or 0)
        row["expected_monthly_paise"] = expected

    # Room-type roll-up — total revenue, avg revenue per bed per month, occupancy.
    types: dict[str, dict[str, Any]] = {}
    for row in rooms:
        t = row["room_type"] or "Untyped"
        b = types.setdefault(t, {
            "room_type": t, "rooms": 0, "total_beds": 0, "occupied_beds": 0,
            "revenue_paise": 0, "capacity": row.get("capacity"),
        })
        b["rooms"] += 1
        b["total_beds"] += row["total_beds"]
        b["occupied_beds"] += row["occupied_beds"]
        b["revenue_paise"] += int(row["revenue_paise"] or 0)
    room_types = []
    for b in types.values():
        beds = b["total_beds"] or 1
        b["revenue_per_bed_per_month_paise"] = int(b["revenue_paise"]) // beds // max(months, 1)
        b["occupancy_rate"] = round(b["occupied_beds"] / beds, 4) if beds > 0 else 0
        room_types.append(b)
    room_types.sort(key=lambda x: x["revenue_per_bed_per_month_paise"], reverse=True)

    return {
        "months": months,
        "rooms": rooms,
        "room_types": room_types,
    }


@router.get("/dashboard/occupancy-trend", summary="Occupancy rate by month (owner only)")
async def occupancy_trend(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    months: int = Query(12, le=24),
):
    _owner_only(ctx)
    # This is best tracked via snapshots; return ledger data as proxy
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}
    pid_filter = ""
    if property_id:
        pid_filter = "AND property_id = :pid"
        params["pid"] = str(property_id)

    result = await db.execute(
        text(f"""
            SELECT year, month,
                   COUNT(DISTINCT tenant_id) as occupied_tenants
            FROM rent_ledger_entries
            WHERE {f"property_id = :pid AND" if property_id else ""}
                  (year, month) >= (EXTRACT(YEAR FROM NOW() - INTERVAL '{months} months')::int,
                                    EXTRACT(MONTH FROM NOW() - INTERVAL '{months} months')::int)
            GROUP BY year, month
            ORDER BY year, month
        """),
        params,
    )
    rows = [dict(r) for r in result.mappings().fetchall()]
    return {"data": rows}


@router.get("/dashboard/recent-activity", summary="Recent payments, expenses, check-ins")
async def recent_activity(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    limit: int = Query(20, le=50),
):
    _owner_only(ctx)
    params: dict[str, Any] = {"org_id": str(ctx.org_id), "limit": limit}
    pid_filter = "AND property_id = :pid" if property_id else ""
    if property_id:
        params["pid"] = str(property_id)

    result = await db.execute(
        text(f"""
            SELECT 'PAYMENT' as type, amount_paise, collected_at as created_at,
                   'Payment recorded' as description, NULL as actor_name
            FROM payments
            WHERE org_id = :org_id AND is_deleted = false {pid_filter}
            UNION ALL
            SELECT 'EXPENSE' as type, amount_paise, created_at,
                   COALESCE(description, 'Expense added') as description, NULL
            FROM expenses
            WHERE org_id = :org_id AND is_deleted = false {pid_filter}
            ORDER BY created_at DESC
            LIMIT :limit
        """),
        params,
    )
    rows = [dict(r) for r in result.mappings().fetchall()]
    return {"items": rows}
