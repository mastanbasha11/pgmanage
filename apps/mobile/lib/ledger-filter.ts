/**
 * Pure helpers for the Rent tab's monthly ledger view. Extracted so the
 * filter / sum / count logic can be tested without rendering a FlatList.
 */

export type LedgerStatus = 'PAID' | 'PARTIAL' | 'UNPAID';
export type LedgerFilter = 'ALL' | LedgerStatus;

export interface LedgerEntryLite {
  status: LedgerStatus;
  outstanding_paise: number;
}

/** ALL passes through; otherwise narrow by status. */
export function filterByStatus<T extends LedgerEntryLite>(
  entries: T[],
  filter: LedgerFilter,
): T[] {
  if (filter === 'ALL') return entries;
  return entries.filter((e) => e.status === filter);
}

/** Outstanding always sums over ALL entries — the filter is a view, not scope. */
export function sumOutstanding(entries: LedgerEntryLite[]): number {
  return entries.reduce((s, e) => s + (e.outstanding_paise ?? 0), 0);
}

/** Counts for the filter-chip labels — used to render 'Unpaid (3)'. */
export function countByStatus(entries: LedgerEntryLite[]): Record<LedgerFilter, number> {
  const counts: Record<LedgerFilter, number> = {
    ALL: entries.length,
    PAID: 0,
    PARTIAL: 0,
    UNPAID: 0,
  };
  for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
  return counts;
}

// ── Avg days to collect ──────────────────────────────────────────────────────

export interface AvgDaysResult {
  /** Mean days from period start to payment, or null when nothing qualifies. */
  avgDays: number | null;
  /** How many payments went into the mean — shown as the tile's footnote. */
  paidCount: number;
}

/**
 * "Avg days to collect" — the plain-language replacement for the old
 * "DSO / on-time" label.
 *
 * `paid_on` is the ledger row's most-recent payment timestamp. Gaps outside
 * [0, 90) are dropped on purpose: a negative gap means the payment was
 * back-dated before the period opened, and anything past 90 days is a
 * carried-over entry. Either would drag the mean somewhere useless.
 */
export function avgDaysToCollect(
  entries: { paid_on?: string | null }[],
  periodStartIso: string | undefined | null,
): AvgDaysResult {
  if (!periodStartIso) return { avgDays: null, paidCount: 0 };
  const start = Date.parse(periodStartIso);
  if (Number.isNaN(start)) return { avgDays: null, paidCount: 0 };

  const gaps: number[] = [];
  for (const e of entries) {
    if (!e.paid_on) continue;
    const paid = Date.parse(e.paid_on);
    if (Number.isNaN(paid)) continue;
    const gap = (paid - start) / 86_400_000;
    if (gap >= 0 && gap < 90) gaps.push(gap);
  }
  if (!gaps.length) return { avgDays: null, paidCount: 0 };
  return {
    avgDays: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    paidCount: gaps.length,
  };
}
