"""Expense management: submit, approve, list, summary."""
from __future__ import annotations

import json
from calendar import monthrange
from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.core.exceptions import NotFoundError
from app.services.s3_service import generate_presigned_upload_url

router = APIRouter()


class ExpenseCreate(BaseModel):
    category_id: UUID
    amount_paise: int
    description: str | None = None
    vendor_name: str | None = None
    purchase_date: date
    bill_photo_s3_key: str | None = None
    payment_mode: str = "CASH"
    reference_number: str | None = None
    property_id: UUID


class ExpenseApproval(BaseModel):
    approved: bool
    rejection_reason: str | None = None


@router.post("/expenses", status_code=status.HTTP_201_CREATED, summary="Create expense")
async def create_expense(
    body: ExpenseCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    # Auto-approve if owner/partner
    approval_status = "APPROVED" if ctx.role in ("OWNER", "PARTNER") else "PENDING"
    approved_by = str(ctx.user_id) if approval_status == "APPROVED" else None

    result = await db.execute(
        text("""
            INSERT INTO expenses (
                org_id, property_id, category_id, amount_paise, description,
                vendor_name, purchased_by, purchase_date, bill_photo_s3_key,
                payment_mode, reference_number, approval_status, approved_by,
                approved_at, created_by
            )
            VALUES (
                :org_id, :pid, :cat_id, :amount, :desc,
                :vendor, :purchased_by, :pdate, :bill_key,
                CAST(:pay_mode AS payment_mode_enum), :ref_num, CAST(:approval_status AS expense_approval_enum), :approved_by,
                CASE WHEN :approval_status = 'APPROVED' THEN NOW() ELSE NULL END,
                :creator
            )
            RETURNING id
        """),
        {
            "org_id": str(ctx.org_id), "pid": str(body.property_id),
            "cat_id": str(body.category_id), "amount": body.amount_paise,
            "desc": body.description, "vendor": body.vendor_name,
            "purchased_by": str(ctx.user_id), "pdate": body.purchase_date,
            "bill_key": body.bill_photo_s3_key, "pay_mode": body.payment_mode,
            "ref_num": body.reference_number, "approval_status": approval_status,
            "approved_by": approved_by, "creator": str(ctx.user_id),
        },
    )
    expense_id = result.scalar_one()
    await db.commit()
    return {"expense_id": str(expense_id), "approval_status": approval_status}


@router.get("/expenses", summary="List expenses")
async def list_expenses(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    approval_status: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    month: int | None = Query(None),
    year: int | None = Query(None),
    category_id: UUID | None = Query(None),
    limit: int = Query(50, le=200),
):
    conditions = ["e.org_id = :org_id", "e.is_deleted = false"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id)}

    if property_id:
        conditions.append("e.property_id = :pid")
        params["pid"] = str(property_id)
    if approval_status:
        conditions.append("e.approval_status = CAST(:approval_status AS expense_approval_enum)")
        params["approval_status"] = approval_status
    # month/year shortcut → convert to date range
    if month and year:
        last_day = monthrange(year, month)[1]
        start_date = start_date or date(year, month, 1)
        end_date = end_date or date(year, month, last_day)
    if start_date:
        conditions.append("e.purchase_date >= :start_date")
        params["start_date"] = start_date
    if end_date:
        conditions.append("e.purchase_date <= :end_date")
        params["end_date"] = end_date
    if category_id:
        conditions.append("e.category_id = :cat_id")
        params["cat_id"] = str(category_id)

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"""
            SELECT e.id, e.amount_paise, e.description, e.vendor_name,
                   e.purchase_date, e.purchase_date as expense_date,
                   e.approval_status, e.approval_status as status,
                   e.bill_photo_s3_key, e.payment_mode, e.created_at,
                   ec.name as category_name, ec.icon_name,
                   u.name as submitted_by_name
            FROM expenses e
            JOIN expense_categories ec ON ec.id = e.category_id
            LEFT JOIN users u ON u.id = e.created_by
            WHERE {where}
            ORDER BY e.purchase_date DESC, e.created_at DESC
            LIMIT :limit
        """),
        {**params, "limit": limit},
    )
    rows = result.mappings().fetchall()

    # Add presigned URLs for bill photos
    from app.services.s3_service import generate_presigned_view_url
    items = []
    for row in rows:
        item = dict(row)
        if item.get("bill_photo_s3_key"):
            item["bill_photo_url"] = await generate_presigned_view_url(item["bill_photo_s3_key"])
        items.append(item)

    return {"items": items, "total": len(items)}


@router.get("/expenses/summary", summary="Expense summary by category")
async def expense_summary(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    property_id: UUID | None = Query(None),
    month: int | None = Query(None),
    year: int | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
):
    today = date.today()
    # Resolve date range — prefer explicit dates, fall back to month/year, then current month
    if not start_date or not end_date:
        m = month or today.month
        y = year or today.year
        start_date = start_date or date(y, m, 1)
        end_date = end_date or date(y, m, monthrange(y, m)[1])

    conditions = ["e.org_id = :org_id", "e.purchase_date BETWEEN :start AND :end",
                  "e.approval_status = 'APPROVED'::expense_approval_enum", "e.is_deleted = false"]
    params: dict[str, Any] = {"org_id": str(ctx.org_id), "start": start_date, "end": end_date}

    if property_id:
        conditions.append("e.property_id = :pid")
        params["pid"] = str(property_id)

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"""
            SELECT ec.name as category_name, ec.icon_name,
                   SUM(e.amount_paise) as total_paise,
                   COUNT(e.id) as count
            FROM expenses e
            JOIN expense_categories ec ON ec.id = e.category_id
            WHERE {where}
            GROUP BY ec.id, ec.name, ec.icon_name
            ORDER BY total_paise DESC
        """),
        params,
    )
    rows = [dict(r) for r in result.mappings().fetchall()]
    total = sum(r["total_paise"] for r in rows)
    for r in rows:
        r["percentage"] = round(r["total_paise"] / total * 100, 1) if total > 0 else 0

    return {"items": rows, "total_paise": total, "period_start": str(start_date), "period_end": str(end_date)}


@router.patch("/expenses/{expense_id}/approve", summary="Approve or reject expense")
async def approve_expense(
    expense_id: UUID,
    body: ExpenseApproval,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    if ctx.role not in ("OWNER", "PARTNER", "PROPERTY_MANAGER"):
        raise HTTPException(403, "Only managers and owners can approve expenses")

    if not body.approved and not body.rejection_reason:
        raise HTTPException(400, "Rejection reason is required when rejecting")

    new_status = "APPROVED" if body.approved else "REJECTED"
    await db.execute(
        text("""
            UPDATE expenses
            SET approval_status = CAST(:status AS expense_approval_enum),
                approved_by = :approver,
                approved_at = CASE WHEN :status = 'APPROVED' THEN NOW() ELSE NULL END,
                rejection_reason = :reason,
                updated_at = NOW()
            WHERE id = :id AND org_id = :org_id
        """),
        {
            "status": new_status, "approver": str(ctx.user_id),
            "reason": body.rejection_reason, "id": str(expense_id),
            "org_id": str(ctx.org_id),
        },
    )
    await db.commit()
    return {"message": f"Expense {new_status.lower()}", "status": new_status}


@router.post("/expenses/upload-url", summary="Get S3 presigned URL for bill photo")
async def get_upload_url(
    property_id: UUID = Query(...),
    filename: str = Query(default="bill.jpg"),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    upload_info = await generate_presigned_upload_url(
        org_id=ctx.org_id,
        property_id=property_id,
        resource_type="expenses",
        filename=filename,
    )
    return upload_info


@router.get("/expense-categories", summary="List expense categories for a property")
async def list_categories(
    property_id: UUID = Query(...),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT id, name, icon_name, is_default, sort_order FROM expense_categories WHERE property_id = :pid AND is_active = true ORDER BY sort_order"),
        {"pid": str(property_id)},
    )
    rows = result.mappings().fetchall()
    return {"items": [dict(r) for r in rows]}
