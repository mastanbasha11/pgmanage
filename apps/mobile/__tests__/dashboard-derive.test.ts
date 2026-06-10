/**
 * lib/dashboard-derive.ts — pure math for the Dashboard KPIs. The exact
 * area where v1 silently broke ('undefined/121' rendered) because the
 * mobile code asked for fields the backend never returns. Tests assert
 * the derivations against the real response shape.
 */
import {
  deriveCashIn,
  deriveCashOut,
  deriveNetIncome,
  deriveOccupied,
  derivePercent,
  type DashSummaryLike,
} from '../lib/dashboard-derive';

describe('deriveOccupied', () => {
  test('occupied = total - vacant', () => {
    expect(deriveOccupied(100, 23)).toBe(77);
    expect(deriveOccupied(50, 50)).toBe(0);
  });

  test('clamps to zero if the backend returns a weird negative diff', () => {
    expect(deriveOccupied(50, 60)).toBe(0);
  });

  test('treats nullish inputs as zero (catches the v1 undefined bug)', () => {
    expect(deriveOccupied(undefined as unknown as number, undefined as unknown as number))
      .toBe(0);
  });
});

describe('derivePercent', () => {
  test('multiplies by 100 and rounds', () => {
    expect(derivePercent(0)).toBe(0);
    expect(derivePercent(1)).toBe(100);
    expect(derivePercent(0.8)).toBe(80);
    expect(derivePercent(0.235)).toBe(24);
  });

  test('handles nullish input', () => {
    expect(derivePercent(undefined as unknown as number)).toBe(0);
  });
});

describe('P&L derivations', () => {
  const sample: DashSummaryLike = {
    total_beds: 100,
    vacant_beds: 20,
    occupancy_rate: 0.8,
    collected_rent_paise: 8_00_000_00,
    advance_received_paise: 1_00_000_00,
    total_expenses_paise: 3_00_000_00,
    refunds_given_paise: 50_000_00,
  };

  test('cashIn = collected + advances', () => {
    expect(deriveCashIn(sample)).toBe(8_00_000_00 + 1_00_000_00);
  });

  test('cashOut = expenses + refunds', () => {
    expect(deriveCashOut(sample)).toBe(3_00_000_00 + 50_000_00);
  });

  test('netIncome = cashIn - cashOut', () => {
    expect(deriveNetIncome(sample)).toBe(deriveCashIn(sample) - deriveCashOut(sample));
    expect(deriveNetIncome(sample)).toBe(5_50_000_00);
  });

  test('netIncome can be negative when expenses exceed income', () => {
    const lossy: DashSummaryLike = {
      ...sample,
      collected_rent_paise: 1_00_00,
      advance_received_paise: 0,
      total_expenses_paise: 5_00_00,
      refunds_given_paise: 0,
    };
    expect(deriveNetIncome(lossy)).toBeLessThan(0);
  });
});
