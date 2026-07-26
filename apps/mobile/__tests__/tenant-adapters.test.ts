import {
  adaptDues,
  adaptDueLine,
  adaptLedgerEntry,
  adaptPayment,
} from '../lib/tenant/adapters';

/**
 * These pin the "no NaN / no undefined leaks to the UI" contract — the exact
 * class of bug that showed ₹NaN earlier. Every numeric field must coerce to a
 * finite number even when the backend omits it.
 */
describe('tenant adapters — NaN-proofing', () => {
  it('adaptDues coerces missing numerics to 0 and defaults the label', () => {
    const d = adaptDues({ lines: [] } as never);
    expect(d.totalPaise).toBe(0);
    expect(d.daysUntilDue).toBe(0);
    expect(d.walletAppliedPaise).toBe(0);
    expect(Number.isNaN(d.totalPaise)).toBe(false);
    expect(d.monthLabel).toBe('This month');
    expect(d.lines).toEqual([]);
  });

  it('adaptDues passes real values through', () => {
    const d = adaptDues({
      month_label: 'June 2026',
      total_paise: 900000,
      due_date: '2026-06-10',
      days_until_due: 5,
      status: 'due',
      lines: [{ kind: 'rent', label: 'Room rent', amount_paise: 900000 }],
      wallet_applied_paise: 0,
    } as never);
    expect(d.totalPaise).toBe(900000);
    expect(d.daysUntilDue).toBe(5);
    expect(d.lines[0].amountPaise).toBe(900000);
    expect(d.status).toBe('due');
  });

  it('adaptDueLine coerces bad amounts and defaults the label', () => {
    const l = adaptDueLine({ kind: 'rent', label: '', amount_paise: undefined } as never);
    expect(l.amountPaise).toBe(0);
    expect(l.label).toBe('Charge');
  });

  it('adaptPayment maps mode aliases and coerces the amount', () => {
    expect(adaptPayment({ id: '1', mode: 'BANK_TRANSFER', amount_paise: undefined } as never).amountPaise).toBe(0);
    expect(adaptPayment({ id: '1', mode: 'BANK_TRANSFER', amount_paise: 1000 } as never).mode).toBe('bank');
    expect(adaptPayment({ id: '1', mode: 'UPI', amount_paise: 1000 } as never).mode).toBe('upi');
    expect(adaptPayment({ id: '1', mode: 'CARD', amount_paise: 1000 } as never).mode).toBe('cash');
  });

  it('adaptLedgerEntry coerces numerics and lowercases status', () => {
    const e = adaptLedgerEntry({ id: '1', status: 'PAID' } as never);
    expect(e.totalPaise).toBe(0);
    expect(e.paidPaise).toBe(0);
    expect(e.month).toBe(0);
    expect(e.status).toBe('paid');
    const e2 = adaptLedgerEntry({ id: '2', status: 'weird' } as never);
    expect(e2.status).toBe('due');
  });
});
