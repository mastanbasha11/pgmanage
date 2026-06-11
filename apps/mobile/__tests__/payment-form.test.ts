/**
 * lib/payment-form.ts — covers the form-state matrix the Take Payment
 * screen uses + the request body it produces. Catches:
 *   - regressions in which fields show for which type/mode combination
 *   - DAILY -> RENT mapping (backend enum doesn't have DAILY)
 *   - stray form state leaking into the API call when type changes
 */
import {
  buildBookingBody,
  buildPaymentBody,
  mapPaymentTypeForApi,
  showDays,
  showMonthYear,
  showReference,
} from '../lib/payment-form';

describe('showMonthYear / showDays / showReference', () => {
  test('Month + Year shown only for periodic types', () => {
    expect(showMonthYear('RENT')).toBe(true);
    expect(showMonthYear('FOOD')).toBe(true);
    expect(showMonthYear('OTHER_CHARGE')).toBe(true);
    expect(showMonthYear('ADVANCE')).toBe(false);
    expect(showMonthYear('DAILY')).toBe(false);
    expect(showMonthYear('DEPOSIT')).toBe(false);
    expect(showMonthYear('REFUND')).toBe(false);
  });

  test('Days shown only for DAILY', () => {
    expect(showDays('DAILY')).toBe(true);
    expect(showDays('RENT')).toBe(false);
  });

  test('Reference # hidden for cash, shown for UPI / Bank', () => {
    expect(showReference('CASH')).toBe(false);
    expect(showReference('UPI')).toBe(true);
    expect(showReference('BANK')).toBe(true);
  });
});

describe('mapPaymentTypeForApi', () => {
  test('DAILY collapses to RENT (backend enum does not have DAILY)', () => {
    expect(mapPaymentTypeForApi('DAILY')).toBe('RENT');
  });

  test('all other types pass through unchanged', () => {
    const passthrough = ['RENT', 'ADVANCE', 'DEPOSIT', 'REFUND', 'FOOD', 'OTHER_CHARGE'] as const;
    for (const t of passthrough) {
      expect(mapPaymentTypeForApi(t)).toBe(t);
    }
  });
});

describe('buildPaymentBody', () => {
  test('RENT body includes month/year, excludes days/reference', () => {
    const body = buildPaymentBody({
      tenantId: 't-1',
      amountRupees: 9000,
      type: 'RENT',
      mode: 'CASH',
      paidTo: 'Owner',
      forMonth: 6,
      forYear: 2026,
      forDays: 30, // stale state — must NOT make it into the body
      referenceNumber: 'abc', // stale — must NOT make it into the body
      collectedOn: '2026-06-10',
    });
    expect(body).toMatchObject({
      tenant_id: 't-1',
      amount_paise: 900_000,
      payment_type: 'RENT',
      payment_mode: 'CASH',
      paid_to: 'Owner',
      for_month: 6,
      for_year: 2026,
      collected_at: '2026-06-10',
    });
    expect(body).not.toHaveProperty('for_days');
    expect(body).not.toHaveProperty('reference_number');
  });

  test('DAILY body remaps to payment_type=RENT and includes for_days', () => {
    const body = buildPaymentBody({
      tenantId: 't-1',
      amountRupees: 1500,
      type: 'DAILY',
      mode: 'UPI',
      forDays: 5,
      referenceNumber: 'upi-ref-1',
    });
    expect(body.payment_type).toBe('RENT');
    expect(body.for_days).toBe(5);
    expect(body.reference_number).toBe('upi-ref-1');
    // No month/year for DAILY.
    expect(body).not.toHaveProperty('for_month');
    expect(body).not.toHaveProperty('for_year');
  });

  test('ADVANCE body omits month/year/days/reference', () => {
    const body = buildPaymentBody({
      tenantId: 't-1',
      amountRupees: 5000,
      type: 'ADVANCE',
      mode: 'CASH',
    });
    expect(body.payment_type).toBe('ADVANCE');
    expect(body).not.toHaveProperty('for_month');
    expect(body).not.toHaveProperty('for_year');
    expect(body).not.toHaveProperty('for_days');
    expect(body).not.toHaveProperty('reference_number');
  });

  test('REFUND with bank mode keeps reference; never has month or days', () => {
    const body = buildPaymentBody({
      tenantId: 't-1',
      amountRupees: 4500,
      type: 'REFUND',
      mode: 'BANK',
      referenceNumber: 'NEFT-1',
    });
    expect(body.payment_type).toBe('REFUND');
    expect(body.reference_number).toBe('NEFT-1');
    expect(body).not.toHaveProperty('for_month');
    expect(body).not.toHaveProperty('for_days');
  });

  test('rounds rupees to paise correctly', () => {
    expect(buildPaymentBody({
      tenantId: 't-1', amountRupees: 9.99, type: 'RENT', mode: 'CASH',
    }).amount_paise).toBe(999);
  });
});

describe('buildBookingBody (tenant-less guest revenue)', () => {
  test('DAILY booking with all required fields', () => {
    const body = buildBookingBody({
      propertyId: 'prop-1',
      guestName: 'Walk-in Guest',
      guestPhone: '+919999900000',
      roomLabel: '101-A',
      kind: 'DAILY',
      amountRupees: 1500,
      mode: 'UPI',
      referenceNumber: 'upi-1',
      paidTo: 'Owner',
      checkInDate: '2026-06-11',
      checkOutDate: '2026-06-13',
      collectedOn: '2026-06-11',
      notes: 'Short stay 2 nights',
    });
    expect(body).toMatchObject({
      property_id: 'prop-1',
      guest_name: 'Walk-in Guest',
      guest_phone: '+919999900000',
      room_label: '101-A',
      kind: 'DAILY',
      amount_paise: 150_000,
      payment_mode: 'UPI',
      reference_number: 'upi-1',
      paid_to: 'Owner',
      check_in_date: '2026-06-11',
      check_out_date: '2026-06-13',
      collected_at: '2026-06-11',
      notes: 'Short stay 2 nights',
    });
  });

  test('ADVANCE booking omits check_out_date when not set', () => {
    const body = buildBookingBody({
      propertyId: 'prop-1',
      guestName: 'Future Tenant',
      roomLabel: '202-A',
      kind: 'ADVANCE',
      amountRupees: 5000,
      mode: 'CASH',
      checkInDate: '2026-07-01',
      collectedOn: '2026-06-11',
    });
    expect(body.kind).toBe('ADVANCE');
    expect(body.check_in_date).toBe('2026-07-01');
    expect(body).not.toHaveProperty('check_out_date');
    expect(body).not.toHaveProperty('guest_phone');
  });

  test('CASH booking does not include reference_number even if passed', () => {
    const body = buildBookingBody({
      propertyId: 'prop-1',
      guestName: 'Guest',
      roomLabel: '101-A',
      kind: 'DAILY',
      amountRupees: 1500,
      mode: 'CASH',
      referenceNumber: 'should-be-stripped',
      checkInDate: '2026-06-11',
      collectedOn: '2026-06-11',
    });
    expect(body).not.toHaveProperty('reference_number');
  });
});
