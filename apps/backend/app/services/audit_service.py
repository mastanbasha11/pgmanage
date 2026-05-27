"""
Activity-log service — the write side of the unified audit feed.

`log_event` is fire-and-forget: callers `await log_event(...)` inside an existing
request handler without changing return types, and a logging failure can NEVER
break the surrounding business operation.

How it stays non-breaking:
- The INSERT runs inside a SAVEPOINT (`begin_nested`). If it fails, only the
  savepoint rolls back; the caller's outer transaction stays usable and its
  final `db.commit()` still succeeds.
- Any exception is swallowed and logged at WARNING.

The row participates in the request's transaction, so an audit entry is only
persisted if the surrounding operation also commits (no orphan log lines for
actions that were rolled back).
"""
from __future__ import annotations

import json
import logging
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.audit_constants import category_for

logger = logging.getLogger("pgmanage.audit")

_INSERT = text(
    """
    INSERT INTO activity_log (
        actor_user_id, actor_role, actor_name, actor_ip,
        event_type, event_category, description,
        entity_type, entity_id, entity_name,
        property_id, property_name, tenant_id, metadata
    ) VALUES (
        :actor_user_id, :actor_role, :actor_name, :actor_ip,
        :event_type, :event_category, :description,
        :entity_type, :entity_id, :entity_name,
        :property_id, :property_name, :tenant_id, CAST(:metadata AS JSONB)
    )
    """
)


def _s(value: UUID | str | None) -> str | None:
    """Normalise UUIDs to str for the asyncpg text() binding; pass None through."""
    if value is None:
        return None
    return str(value)


def _jsonable(v):
    """Coerce a DB value to something JSON-serialisable (dates/UUIDs/Decimals → str)."""
    if v is None or isinstance(v, str | int | float | bool):
        return v
    return str(v)


def diff_changes(old: dict, new: dict) -> dict:
    """
    Build a before/after map ``{field: {"old": ..., "new": ...}}`` for every
    field in ``new`` whose value differs from ``old``.

    Used by update endpoints so the audit feed records exactly what changed,
    attribute by attribute. ``old`` is the row's current values; ``new`` is the
    set of incoming changes.
    """
    changes: dict[str, dict] = {}
    for field, new_val in new.items():
        old_val = old.get(field)
        if old_val != new_val:
            changes[field] = {"old": _jsonable(old_val), "new": _jsonable(new_val)}
    return changes


async def log_event(
    db: AsyncSession,
    event_type: str,
    event_category: str | None = None,
    description: str = "",
    *,
    actor_user_id: UUID | str | None = None,
    actor_role: str | None = None,
    actor_name: str | None = None,
    actor_ip: str | None = None,
    entity_type: str | None = None,
    entity_id: UUID | str | None = None,
    entity_name: str | None = None,
    property_id: UUID | str | None = None,
    property_name: str | None = None,
    tenant_id: UUID | str | None = None,
    metadata: dict | None = None,
) -> None:
    """
    Insert one activity-feed entry into the current org schema's `activity_log`.

    Relies on the request session's search_path (set by `get_org_context`), so
    no org_id is needed. Never raises.

    `event_category` is optional — if omitted it's derived from `event_type`.
    """
    try:
        params = {
            "actor_user_id": _s(actor_user_id),
            "actor_role": actor_role,
            "actor_name": actor_name,
            "actor_ip": actor_ip,
            "event_type": event_type,
            "event_category": event_category or category_for(event_type),
            "description": description,
            "entity_type": entity_type,
            "entity_id": _s(entity_id),
            "entity_name": entity_name,
            "property_id": _s(property_id),
            "property_name": property_name,
            "tenant_id": _s(tenant_id),
            "metadata": json.dumps(metadata or {}, default=str),
        }
        # SAVEPOINT so a logging failure can't poison the caller's transaction.
        async with db.begin_nested():
            await db.execute(_INSERT, params)
    except Exception:  # noqa: BLE001 — audit must never break the main op
        logger.warning("activity log_event failed for event_type=%s", event_type, exc_info=True)
