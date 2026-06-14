"""Tenant inbox — write helpers used by every tenant-initiated endpoint.

Each public function inserts one row into the org-scoped
tenant_inbox_events table. Callers don't need to think about the
underlying schema; they pick a `kind` and supply a short summary +
optional payload + optional deep-link.

The session passed in must already be on the correct org's search_path
(set_schema'd by the request's auth dependency).
"""
from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def record_event(
    db: AsyncSession,
    *,
    org_id: UUID,
    kind: str,
    summary: str,
    tenant_id: UUID | None = None,
    property_id: UUID | None = None,
    payload: dict | None = None,
    deep_link: str | None = None,
) -> None:
    await db.execute(
        text(
            """
            INSERT INTO tenant_inbox_events (
                org_id, property_id, tenant_id, kind, summary, payload, deep_link
            ) VALUES (
                :org_id, :pid, :tid,
                CAST(:kind AS inbox_event_kind_enum),
                :summary,
                CAST(:payload AS jsonb),
                :deep_link
            )
            """
        ),
        {
            "org_id": str(org_id),
            "pid": str(property_id) if property_id else None,
            "tid": str(tenant_id) if tenant_id else None,
            "kind": kind,
            "summary": summary,
            "payload": json.dumps(payload or {}),
            "deep_link": deep_link,
        },
    )
