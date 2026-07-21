/**
 * Dashboard summary + cashflow + ROI + payback plan + recent activity.
 * Endpoint shapes match apps/backend/app/api/v1/dashboard.py.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { deriveOccupied } from '../dashboard-derive';

/**
 * Mirrors the `/dashboard/summary` return in app/api/v1/dashboard.py EXACTLY.
 *
 * This previously declared invented names (`expected_paise`, `expenses_paise`,
 * `refunds_paise`, `power_paise`, `occupied_beds`, `owner_split`). None of them
 * are in the payload, so every screen reading them silently got `undefined` and
 * rendered 0 — occupancy showed 0%, and cash-out was always ₹0. Do not add a
 * field here without checking the endpoint.
 *
 * Note there is NO `occupied_beds`. Derive it as `total_beds - vacant_beds`,
 * which already includes RESERVED because the backend counts a reserved bed as
 * occupied (a held bed isn't sellable).
 */
export interface DashboardSummary {
  month: number;
  year: number;
  period_start: string | null;
  period_end: string | null;

  // Rent state
  expected_rent_paise: number;
  collected_rent_paise: number;
  rent_only_paise: number;
  ledger_paid_paise: number;
  discount_paise: number;
  outstanding_paise: number;
  /** 0..1 fraction, not a percentage. */
  collection_rate: number;

  // Money-in
  advance_received_paise: number;
  bookings_revenue_paise: number;
  daily_stays_paise: number;
  power_received_paise: number;
  opening_balance_paise: number;
  total_received_paise: number;

  // Money-out
  refunds_given_paise: number;
  total_expenses_paise: number;
  total_given_paise: number;

  net_income_paise: number;

  // Occupancy — `occupancy_rate` is a 0..1 fraction and INCLUDES reserved.
  occupancy_rate: number;
  vacant_beds: number;
  reserved_beds: number;
  total_beds: number;

  total_tenants: number;
  overdue_tenants: number;

  // Attribution — the backend emits ARRAYS of rows, not name→amount maps.
  // Treating them as objects (Object.entries) yielded index keys 0,1,2… and
  // object values that rendered ₹NaN. `owner_profits` carries `share_paise`,
  // not `amount_paise`.
  cash_in_by_person?: Array<{ person: string; total_paise: number; count: number }>;
  expenses_by_person?: Array<{ person: string; total_paise: number; count: number }>;
  owner_profits?: Array<{ name: string; share_pct: number; share_paise: number }>;
  top_recurring_spikes?: Array<{ label: string; delta_pct: number; amount_paise: number }>;

  // Back-compat aliases the backend still emits.
  gross_rent_expected_paise?: number;
  rent_collected_paise?: number;
  active_tenants?: number;
}

/**
 * Beds that are not sellable today (OCCUPIED + RESERVED).
 * Delegates to the unit-tested derivation in lib/dashboard-derive so there is
 * exactly one definition of this in the app.
 */
export function occupiedBeds(d: DashboardSummary): number {
  return deriveOccupied(d.total_beds, d.vacant_beds);
}

/** `month` is a pre-formatted label like "Jul 2026", not a number. */
export interface CashflowPoint {
  month: string;
  income_paise: number;
  expenses_paise: number;
  net_paise: number;
}

export function useDashboardSummary(params: { property_id?: string; month: number; year: number }) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', params],
    queryFn: () => api.get('/dashboard/summary', { params }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

export function useCashflow(params: { property_id?: string; months?: number }) {
  return useQuery<{ items: CashflowPoint[]; months: number }>({
    queryKey: ['dashboard', 'cashflow', params],
    queryFn: () => api.get('/dashboard/cashflow', { params }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

export interface RoiRoom {
  room_id: string;
  room_number: string;
  room_type: string | null;
  capacity: number | null;
  monthly_base_rent_paise: number | null;
  revenue_paise: number;
  rent_txns: number;
  occupied_beds: number;
  vacant_beds: number;
  reserved_beds: number;
  total_beds: number;
  revenue_per_bed_paise: number;
  revenue_per_bed_per_month_paise: number;
  expected_monthly_paise: number;
}

export interface RoiRoomType {
  room_type: string;
  rooms: number;
  total_beds: number;
  occupied_beds: number;
  revenue_paise: number;
  capacity: number | null;
  revenue_per_bed_per_month_paise: number;
  /** 0..1 fraction. */
  occupancy_rate: number;
}

/** The endpoint's param is `months`, not `window`. */
export function useRoiByRoom(params: { property_id?: string; months?: number }) {
  return useQuery<{ months: number; rooms: RoiRoom[]; room_types: RoiRoomType[] }>({
    queryKey: ['dashboard', 'roi', params],
    queryFn: () => api.get('/dashboard/roi-by-room', { params }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

// ── Payback plan ─────────────────────────────────────────────────────────────

export interface PaybackPlan {
  property_id: string;
  investment_paise: number;
  target_months: number;
  grace_months: number;
  monthly_lessor_rent_paise: number;
  start_date: string;
  lease_years: number;
  annual_hike_pct: number;
  annual_hikes?: number[];
  owners?: Array<{ name: string; share_pct: number }>;
  monthly_actuals?: Record<string, number>;
}

export interface PaybackResult {
  plan?: PaybackPlan;
  grace_target_paise: number;
  year1_regular_target_paise: number;
  post_payback_monthly_profit_paise: number;
  progress: {
    actual_so_far_paise: number;
    expected_by_now_paise: number;
    tracking_label: string;
  };
  monthly_breakdown: Array<{
    year: number;
    month: number;
    expected_paise: number;
    required_paise: number;
    actual_paise: number | null;
    delta_paise: number | null;
    cumulative_actual_paise: number;
    cumulative_expected_paise: number;
  }>;
  yearly_summary: Array<{
    year_index: number;
    year_label: string;
    total_expected_paise: number;
    monthly_target_paise: number;
    rent_paise: number;
  }>;
}

export function usePaybackPlan(propertyId?: string) {
  return useQuery<PaybackResult>({
    queryKey: ['payback-plan', propertyId],
    queryFn: () => api.get(`/properties/${propertyId}/payback-plan`).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useSavePaybackPlan(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PaybackPlan>) =>
      api.put(`/properties/${propertyId}/payback-plan`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payback-plan', propertyId] }),
  });
}

export function useSaveMonthlyActual(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year: number; month: number; actual_paise: number }) =>
      api
        .put(`/properties/${propertyId}/payback-plan/actual`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payback-plan', propertyId] }),
  });
}

export function useClearMonthlyActual(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year: number; month: number }) =>
      api
        .delete(`/properties/${propertyId}/payback-plan/actual`, { data })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payback-plan', propertyId] }),
  });
}

export function useOverdueBanner(propertyId?: string) {
  return useQuery<{ count: number; amount_paise: number }>({
    queryKey: ['rent-overdue-banner', propertyId],
    queryFn: () =>
      api
        .get('/rent/overdue', { params: { property_id: propertyId } })
        .then((r) => {
          const items = (r.data?.items ?? []) as Array<{ outstanding_paise?: number }>;
          const sum = items.reduce((a, x) => a + (x.outstanding_paise ?? 0), 0);
          return { count: items.length, amount_paise: sum };
        }),
    enabled: !!propertyId,
  });
}
