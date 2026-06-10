/**
 * Pure derivations applied to the /dashboard/summary response before
 * rendering. Extracted so the math is unit-testable — also where the v1
 * bug lived (we asked for fields the backend doesn't return).
 */

export interface DashSummaryLike {
  total_beds: number;
  vacant_beds: number;
  occupancy_rate: number; // 0..1
  collected_rent_paise: number;
  advance_received_paise: number;
  total_expenses_paise: number;
  refunds_given_paise: number;
}

export function deriveOccupied(total: number, vacant: number): number {
  return Math.max((total ?? 0) - (vacant ?? 0), 0);
}

export function derivePercent(rate0to1: number): number {
  return Math.round((rate0to1 ?? 0) * 100);
}

export function deriveCashIn(s: DashSummaryLike): number {
  return (s.collected_rent_paise ?? 0) + (s.advance_received_paise ?? 0);
}

export function deriveCashOut(s: DashSummaryLike): number {
  return (s.total_expenses_paise ?? 0) + (s.refunds_given_paise ?? 0);
}

export function deriveNetIncome(s: DashSummaryLike): number {
  return deriveCashIn(s) - deriveCashOut(s);
}
