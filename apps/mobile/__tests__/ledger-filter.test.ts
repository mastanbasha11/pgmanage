/**
 * lib/ledger-filter.ts — Rent tab's view-state math. Catches regressions in:
 *   - Outstanding total accidentally being scoped to the filtered subset
 *     (it should always sum over ALL entries — the chip is a view, not a
 *     query).
 *   - Filter chip counts drifting from what the filter actually returns.
 */
import {
  countByStatus,
  filterByStatus,
  sumOutstanding,
  type LedgerEntryLite,
  avgDaysToCollect,
} from '../lib/ledger-filter';

const SAMPLE: LedgerEntryLite[] = [
  { status: 'PAID', outstanding_paise: 0 },
  { status: 'PAID', outstanding_paise: 0 },
  { status: 'PARTIAL', outstanding_paise: 300_000 },
  { status: 'UNPAID', outstanding_paise: 900_000 },
  { status: 'UNPAID', outstanding_paise: 900_000 },
];

describe('filterByStatus', () => {
  test('ALL returns everything', () => {
    expect(filterByStatus(SAMPLE, 'ALL')).toHaveLength(5);
  });

  test('UNPAID returns only unpaid rows', () => {
    const out = filterByStatus(SAMPLE, 'UNPAID');
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.status === 'UNPAID')).toBe(true);
  });

  test('PARTIAL returns only partial rows', () => {
    expect(filterByStatus(SAMPLE, 'PARTIAL')).toHaveLength(1);
  });

  test('PAID returns only paid rows', () => {
    expect(filterByStatus(SAMPLE, 'PAID')).toHaveLength(2);
  });
});

describe('sumOutstanding', () => {
  test('sums across all rows (filter is a view, not a scope)', () => {
    // 0 + 0 + 300_000 + 900_000 + 900_000 = 2_100_000 paise = ₹21,000
    expect(sumOutstanding(SAMPLE)).toBe(2_100_000);
  });

  test('treats missing outstanding_paise as zero', () => {
    const messy = [{ status: 'UNPAID' } as unknown as LedgerEntryLite];
    expect(sumOutstanding(messy)).toBe(0);
  });
});

describe('countByStatus', () => {
  test('counts match the partition of the input', () => {
    const c = countByStatus(SAMPLE);
    expect(c.ALL).toBe(5);
    expect(c.PAID).toBe(2);
    expect(c.PARTIAL).toBe(1);
    expect(c.UNPAID).toBe(2);
  });

  test('counts sum to the total entry count', () => {
    const c = countByStatus(SAMPLE);
    expect(c.PAID + c.PARTIAL + c.UNPAID).toBe(c.ALL);
  });
});

describe('avgDaysToCollect', () => {
  const PERIOD_START = '2026-06-11T00:00:00Z';

  test('averages the gap from period start to each payment', () => {
    const rows = [
      { paid_on: '2026-06-13T00:00:00Z' }, // 2 days
      { paid_on: '2026-06-15T00:00:00Z' }, // 4 days
      { paid_on: '2026-06-17T00:00:00Z' }, // 6 days
    ];
    const { avgDays, paidCount } = avgDaysToCollect(rows, PERIOD_START);
    expect(paidCount).toBe(3);
    expect(avgDays).toBeCloseTo(4, 5);
  });

  test('ignores rows with no payment', () => {
    const rows = [{ paid_on: '2026-06-13T00:00:00Z' }, { paid_on: null }];
    const { avgDays, paidCount } = avgDaysToCollect(rows, PERIOD_START);
    expect(paidCount).toBe(1);
    expect(avgDays).toBeCloseTo(2, 5);
  });

  test('drops back-dated payments from before the period opened', () => {
    const rows = [
      { paid_on: '2026-06-01T00:00:00Z' }, // negative gap → excluded
      { paid_on: '2026-06-13T00:00:00Z' },
    ];
    const { avgDays, paidCount } = avgDaysToCollect(rows, PERIOD_START);
    expect(paidCount).toBe(1);
    expect(avgDays).toBeCloseTo(2, 5);
  });

  test('drops carried-over payments 90+ days out', () => {
    const rows = [
      { paid_on: '2026-10-01T00:00:00Z' }, // >90 days → excluded
      { paid_on: '2026-06-13T00:00:00Z' },
    ];
    expect(avgDaysToCollect(rows, PERIOD_START).paidCount).toBe(1);
  });

  test('returns null rather than NaN when nothing qualifies', () => {
    expect(avgDaysToCollect([{ paid_on: null }], PERIOD_START)).toEqual({
      avgDays: null,
      paidCount: 0,
    });
  });

  test('returns null when the period is missing or unparseable', () => {
    const rows = [{ paid_on: '2026-06-13T00:00:00Z' }];
    expect(avgDaysToCollect(rows, undefined).avgDays).toBeNull();
    expect(avgDaysToCollect(rows, 'not-a-date').avgDays).toBeNull();
  });
});
