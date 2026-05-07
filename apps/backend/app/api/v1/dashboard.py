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

    # Rent stats
    rent_result = await db.execute(
        text(f"""
            SELECT
                COALESCE(SUM(rle.amount_due_paise), 0) as expected,
                COALESCE(SUM(rle.amount_paid_paise), 0) as collected,
                COUNT(DISTINCT rle.tenant_id) as total_tenants
            FROM rent_ledger_entries rle
            JOIN tenants t ON t.id = rle.tenant_id
            WHERE t.org_id = :org_id AND rle.month = :month AND rle.year = :year
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

    # Occupancy
    bed_filter = "AND b.property_id = :pid" if property_id else ""
    occ_result = await db.execute(
        text(f"""
            SELECT
                COUNT(*) FILTER (WHERE b.status = 'OCCUPIED') as occupied,
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
    total_expenses = expenses["total_expenses"] or 0
    total_beds = occ["total"] or 0
    occupied = occ["occupied"] or 0
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
                    ), 0) AS refund_paise
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
                    ), 0) AS refund_paise
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

    rate = (collected / expected) if expected > 0 else 0
    occupancy_rate = (occupied / total_beds) if total_beds > 0 else 0

    # For Net Income we use the period-bound rent collection if a property
    # was selected (matches partner P&L), else the ledger-rolled-up figure.
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
        rent_in_period = collected
    cash_in = rent_in_period + advance_received
    cash_out = total_expenses + refunds_given
    return {
        # Canonical names
        "expected_rent_paise": expected,
        "collected_rent_paise": collected,
        "outstanding_paise": max(expected - collected, 0),
        "collection_rate": round(rate, 4),                   # 0..1 fraction
        "advance_received_paise": advance_received,
        "refunds_given_paise": refunds_given,
        "total_expenses_paise": total_expenses,
        "net_income_paise": cash_in - cash_out,
        "expenses_by_person": expenses_by_person,
        "occupancy_rate": round(occupancy_rate, 4),          # 0..1 fraction
        "total_tenants": rent["total_tenants"] or 0,
        "vacant_beds": vacant_beds,
        "total_beds": total_beds,
        "overdue_tenants": overdue_tenants or 0,
        "month": m,
        "year": y,
        "period_start": str(period_start) if period_start else None,
        "period_end": str(period_end) if period_end else None,
        # Back-compat aliases (older clients)
        "gross_rent_expected_paise": expected,
        "rent_collected_paise": collected,
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

    income_result = await db.execute(
        text(f"""
            SELECT EXTRACT(YEAR FROM collected_at)::int as year,
                   EXTRACT(MONTH FROM collected_at)::int as month,
                   SUM(amount_paise) as income_paise
            FROM payments
            WHERE org_id = :org_id AND is_deleted = false
                AND collected_at >= NOW() - INTERVAL '{months} months'
            {pid_filter_income}
            GROUP BY year, month
            ORDER BY year, month
        """),
        params,
    )
    income_rows = {(r["year"], r["month"]): r["income_paise"] for r in income_result.mappings().fetchall()}

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

    # Build unified timeline
    from datetime import date
    all_keys = sorted(set(income_rows.keys()) | set(expense_rows.keys()))
    cashflow_data = []
    for year, month in all_keys:
        income = income_rows.get((year, month), 0)
        expense = expense_rows.get((year, month), 0)
        cashflow_data.append({
            "year": year, "month": month,
            "income_paise": income, "expense_paise": expense,
            "net_paise": income - expense,
        })

    return {"data": cashflow_data, "months": months}


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
