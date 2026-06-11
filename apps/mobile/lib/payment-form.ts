/**
 * Pure helpers extracted from app/payments/new.tsx so the form-state logic
 * (which fields show when, how the body maps to the backend) is unit-testable
 * without rendering the screen.
 *
 * Keep this file dependency-free — no react, no expo, no axios. Anything
 * that needs side effects stays in the screen.
 */

export type PaymentType =
  | 'RENT'
  | 'ADVANCE'
  | 'DAILY'
  | 'DEPOSIT'
  | 'REFUND'
  | 'FOOD'
  | 'OTHER_CHARGE';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK';

/** Month + Year fields only matter for periodic charges. */
export function showMonthYear(type: PaymentType): boolean {
  return type === 'RENT' || type === 'FOOD' || type === 'OTHER_CHARGE';
}

/** Days field only matters for daily-stay bookings. */
export function showDays(type: PaymentType): boolean {
  return type === 'DAILY';
}

/** Reference # is meaningless for cash; shown for UPI/Bank. */
export function showReference(mode: PaymentMode): boolean {
  return mode !== 'CASH';
}

/**
 * The UI offers a 'DAILY' option but the backend's payment_type_enum only has
 * RENT/ADVANCE/DEPOSIT/REFUND/FOOD/OTHER_CHARGE. DAILY is modelled as a RENT
 * row with `for_days` set. This mapper centralises that rewrite so screens
 * and tests stay consistent.
 */
export function mapPaymentTypeForApi(uiType: PaymentType): Exclude<PaymentType, 'DAILY'> {
  return uiType === 'DAILY' ? 'RENT' : uiType;
}

/**
 * Tenant-less revenue capture. The web app has a separate /bookings UI for
 * this; on mobile we expose it on the same Add Payment screen via a
 * mode picker so an owner sitting at the counter can record any inbound
 * money in one place.
 *
 * - DAILY    → short-stay rent for a walk-in guest who isn't (yet) a tenant.
 *              guest_name + room + check-in/out dates required.
 * - ADVANCE  → someone reserved a future spot; converts to a tenant on
 *              actual check-in.
 */
export type BookingKind = 'DAILY' | 'ADVANCE';

export interface BuildBookingBodyInput {
  propertyId: string;
  guestName: string;
  guestPhone?: string;
  roomLabel: string;
  kind: BookingKind;
  amountRupees: number;
  mode: PaymentMode;
  paidTo?: string;
  referenceNumber?: string;
  checkInDate: string;        // ISO YYYY-MM-DD
  checkOutDate?: string;      // optional for ADVANCE; usually set for DAILY
  collectedOn: string;        // ISO YYYY-MM-DD
  notes?: string;
}

/**
 * Builds the request body POSTed to /api/v1/bookings. Field shape matches
 * BookingCreate on the backend.
 */
export function buildBookingBody(input: BuildBookingBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    property_id: input.propertyId,
    guest_name: input.guestName,
    room_label: input.roomLabel,
    kind: input.kind,
    amount_paise: Math.round(input.amountRupees * 100),
    payment_mode: input.mode,
    check_in_date: input.checkInDate,
    collected_at: input.collectedOn,
  };
  if (input.guestPhone) body.guest_phone = input.guestPhone;
  if (input.checkOutDate) body.check_out_date = input.checkOutDate;
  if (showReference(input.mode) && input.referenceNumber) {
    body.reference_number = input.referenceNumber;
  }
  if (input.paidTo) body.paid_to = input.paidTo;
  if (input.notes) body.notes = input.notes;
  return body;
}

export interface BuildPaymentBodyInput {
  tenantId: string;
  amountRupees: number;
  type: PaymentType;
  mode: PaymentMode;
  paidTo?: string;
  referenceNumber?: string;
  forMonth?: number;
  forYear?: number;
  forDays?: number;
  collectedOn?: string;
  notes?: string;
}

/**
 * Builds the request body POSTed to /api/v1/payments. Omits fields that the
 * type/mode combination doesn't apply to, so the backend doesn't see stale
 * data from the form (e.g. a Year value sticking around when switching to
 * DEPOSIT). Returns plain JSON — no headers; the idempotency key is wrapped
 * separately via lib/api.withIdempotency().
 */
export function buildPaymentBody(input: BuildPaymentBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    tenant_id: input.tenantId,
    amount_paise: Math.round(input.amountRupees * 100),
    payment_type: mapPaymentTypeForApi(input.type),
    payment_mode: input.mode,
  };
  if (input.paidTo) body.paid_to = input.paidTo;
  if (showReference(input.mode) && input.referenceNumber) {
    body.reference_number = input.referenceNumber;
  }
  if (showMonthYear(input.type)) {
    if (input.forMonth) body.for_month = input.forMonth;
    if (input.forYear) body.for_year = input.forYear;
  }
  if (showDays(input.type) && input.forDays) {
    body.for_days = input.forDays;
  }
  if (input.collectedOn) body.collected_at = input.collectedOn;
  if (input.notes) body.notes = input.notes;
  return body;
}
