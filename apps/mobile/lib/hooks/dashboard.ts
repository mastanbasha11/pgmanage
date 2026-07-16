/**
 * Dashboard summary + cashflow + ROI + payback plan + recent activity.
 * Endpoint shapes match apps/backend/app/api/v1/dashboard.py.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export interface DashboardSummary {
  property_id: string;
  month: number;
  year: number;
  // Money-in
  rent_collected_paise: number;
  advance_received_paise: number;
  daily_stays_paise: number;
  power_paise: number;
  opening_balance_paise: number;
  // Money-out
  expenses_paise: number;
  refunds_paise: number;
  // Rent state
  expected_paise: number;
  outstanding_paise: number;
  discount_paise: number;
  // Occupancy
  occupied_beds: number;
  reserved_beds: number;
  vacant_beds: number;
  total_beds: number;
  occupancy_rate: number;
  // Movement
  checkins_this_month?: number;
  checkouts_this_month?: number;
  notices_active?: number;
  // Attribution
  cash_in_by_person?: Record<string, number>;
  expenses_by_person?: Record<string, number>;
  owner_split?: Array<{ name: string; share_pct: number; amount_paise: number }>;
  recurring_alerts?: Array<{ label: string; delta_pct: number; amount_paise: number }>;
}

export function useDashboardSummary(params: { property_id?: string; month: number; year: number }) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', params],
    queryFn: () => api.get('/dashboard/summary', { params }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

export function useCashflow(params: { property_id?: string; months?: number }) {
  return useQuery({
    queryKey: ['dashboard', 'cashflow', params],
    queryFn: () => api.get('/dashboard/cashflow', { params }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

export function useRoiByRoom(params: { property_id?: string; window?: 3 | 6 | 12 }) {
  return useQuery({
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
