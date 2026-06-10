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
