"""
Canonical event-type and category constants for the activity-log (audit feed).

Use these constants everywhere instead of raw strings so a typo becomes an
import error rather than a silently mis-categorised feed entry.

NOTE: this powers the high-level *semantic* activity feed stored in the
org-scoped `activity_log` table. It is unrelated to the lower-level
`audit_log` table (INSERT/UPDATE/DELETE row diffs) used by some writes.
"""
from __future__ import annotations


class Category:
    """event_category values — coarse grouping used for filters + colour coding."""

    AUTH = "auth"
    TENANT = "tenant"
    PAYMENT = "payment"
    EXPENSE = "expense"
    LEAD = "lead"
    BOOKING = "booking"
    PROPERTY = "property"
    ANNOUNCEMENT = "announcement"
    COMPLAINT = "complaint"


class Event:
    """event_type values — the specific action that happened."""

    # ── Auth & user ──────────────────────────────────────────────────────────
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    PASSWORD_CHANGED = "password_changed"
    PASSWORD_RESET = "password_reset"

    # ── Tenant lifecycle ─────────────────────────────────────────────────────
    TENANT_CHECKIN = "tenant_checkin"
    TENANT_CHECKOUT = "tenant_checkout"
    TENANT_PROFILE_UPDATED = "tenant_profile_updated"
    TENANT_ID_UPLOADED = "tenant_id_uploaded"

    # ── Payments ─────────────────────────────────────────────────────────────
    PAYMENT_RECORDED = "payment_recorded"
    PAYMENT_DELETED = "payment_deleted"
    ADVANCE_RECORDED = "advance_recorded"
    REFUND_ISSUED = "refund_issued"

    # ── Expenses ─────────────────────────────────────────────────────────────
    EXPENSE_CREATED = "expense_created"
    EXPENSE_UPDATED = "expense_updated"
    EXPENSE_DELETED = "expense_deleted"

    # ── Leads ────────────────────────────────────────────────────────────────
    LEAD_CREATED = "lead_created"
    LEAD_STATUS_CHANGED = "lead_status_changed"
    LEAD_CONVERTED = "lead_converted"

    # ── Bookings ─────────────────────────────────────────────────────────────
    BOOKING_CREATED = "booking_created"
    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_CANCELLED = "booking_cancelled"

    # ── Properties / rooms ───────────────────────────────────────────────────
    ROOM_STATUS_CHANGED = "room_status_changed"
    BED_ASSIGNED = "bed_assigned"
    BED_VACATED = "bed_vacated"

    # ── Announcements & complaints ───────────────────────────────────────────
    ANNOUNCEMENT_POSTED = "announcement_posted"
    COMPLAINT_UPDATED = "complaint_updated"


# Maps each event_type → its event_category. Lets callers pass only the event
# type if they want; the service can derive the category. Also used by tests to
# assert every event has a category.
EVENT_CATEGORY: dict[str, str] = {
    Event.USER_LOGIN: Category.AUTH,
    Event.USER_LOGOUT: Category.AUTH,
    Event.PASSWORD_CHANGED: Category.AUTH,
    Event.PASSWORD_RESET: Category.AUTH,
    Event.TENANT_CHECKIN: Category.TENANT,
    Event.TENANT_CHECKOUT: Category.TENANT,
    Event.TENANT_PROFILE_UPDATED: Category.TENANT,
    Event.TENANT_ID_UPLOADED: Category.TENANT,
    Event.PAYMENT_RECORDED: Category.PAYMENT,
    Event.PAYMENT_DELETED: Category.PAYMENT,
    Event.ADVANCE_RECORDED: Category.PAYMENT,
    Event.REFUND_ISSUED: Category.PAYMENT,
    Event.EXPENSE_CREATED: Category.EXPENSE,
    Event.EXPENSE_UPDATED: Category.EXPENSE,
    Event.EXPENSE_DELETED: Category.EXPENSE,
    Event.LEAD_CREATED: Category.LEAD,
    Event.LEAD_STATUS_CHANGED: Category.LEAD,
    Event.LEAD_CONVERTED: Category.LEAD,
    Event.BOOKING_CREATED: Category.BOOKING,
    Event.BOOKING_CONFIRMED: Category.BOOKING,
    Event.BOOKING_CANCELLED: Category.BOOKING,
    Event.ROOM_STATUS_CHANGED: Category.PROPERTY,
    Event.BED_ASSIGNED: Category.PROPERTY,
    Event.BED_VACATED: Category.PROPERTY,
    Event.ANNOUNCEMENT_POSTED: Category.ANNOUNCEMENT,
    Event.COMPLAINT_UPDATED: Category.COMPLAINT,
}


def category_for(event_type: str) -> str:
    """Return the category for an event type, or 'auth' fallback if unknown."""
    return EVENT_CATEGORY.get(event_type, Category.AUTH)
