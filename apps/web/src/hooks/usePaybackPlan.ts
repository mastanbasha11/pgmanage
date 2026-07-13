import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PaybackPlan {
  configured: boolean;
  plan: {
    investment_paise: number | null;
    target_months: number | null;
    grace_months: number | null;
    lessor_rent_paise: number | null;
    plan_start_date: string | null;
    settlement_day?: number;
  };
  first_fiscal?: { year: number; month: number } | null;
  owners: {
    name: string;
    share_pct: number | null;
    capital_paise: number | null;
  }[];
  calc?: {
    grace_month_profit_paise: number;
    regular_month_profit_paise: number;
    grace_period_total_paise: number;
    regular_period_total_paise: number;
    error?: string;
  };
  per_owner?: {
    name: string;
    share_pct: number;
    capital_paise: number | null;
    capital_effective_paise: number;
    grace_month_share_paise: number;
    regular_month_share_paise: number;
  }[];
  months_elapsed?: number;
  actual_cumulative_paise?: number;
  expected_cumulative_paise?: number;
  monthly_breakdown?: {
    year: number;
    month: number;
    actual_paise: number;
    expected_paise: number;
    source: 'manual' | 'computed';
  }[];
  catchup?: {
    remaining_months: number;
    grace_remaining: number;
    regular_remaining: number;
    remaining_investment_paise: number;
    p_grace_catchup_paise: number;
    p_regular_catchup_paise: number;
    on_track: boolean;
  } | null;
}

export function usePaybackPlan(propertyId?: string) {
  return useQuery<PaybackPlan>({
    queryKey: ['payback-plan', propertyId],
    queryFn: () =>
      api.get(`/properties/${propertyId}/payback-plan`).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export interface PaybackPlanInput {
  investment_paise?: number;
  target_months?: number;
  grace_months?: number;
  lessor_rent_paise?: number;
  plan_start_date?: string;
}

export function useSavePaybackPlan(propertyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PaybackPlanInput) =>
      api.put(`/properties/${propertyId}/payback-plan`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payback-plan', propertyId] }),
  });
}

export function useSaveMonthlyActual(propertyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month, actual_profit_paise, notes }: {
      year: number;
      month: number;
      actual_profit_paise: number;
      notes?: string;
    }) =>
      api
        .put(`/properties/${propertyId}/payback-plan/monthly/${year}/${month}`, {
          actual_profit_paise,
          notes,
        })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payback-plan', propertyId] }),
  });
}

export function useClearMonthlyActual(propertyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      api
        .delete(`/properties/${propertyId}/payback-plan/monthly/${year}/${month}`)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payback-plan', propertyId] }),
  });
}
