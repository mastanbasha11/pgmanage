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
  };
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
    grace_month_share_paise: number;
    regular_month_share_paise: number;
  }[];
  months_elapsed?: number;
  actual_cumulative_paise?: number;
  expected_cumulative_paise?: number;
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
