/**
 * lib/payment-form.ts — covers the form-state matrix the Take Payment
 * screen uses + the request body it produces. Catches:
 *   - regressions in which fields show for which type/mode combination
 *   - DAILY -> RENT mapping (backend enum doesn't have DAILY)
 *   - stray form state leaking into the API call when type changes
 */
import {
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
