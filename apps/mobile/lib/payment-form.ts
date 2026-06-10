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
