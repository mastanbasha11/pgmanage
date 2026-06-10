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
