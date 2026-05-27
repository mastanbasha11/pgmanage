import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ExpenseByPerson {
  person: string;
  total_paise: number;
  count: number;
}

export interface DashboardSummary {
  expected_rent_paise: number;
  collected_rent_paise: number;
  outstanding_paise: number;
  collection_rate: number;       // 0..1 fraction
  total_expenses_paise: number;
  advance_received_paise?: number;
  bookings_revenue_paise?: number;
  refunds_given_paise?: number;
  net_income_paise: number;
  expenses_by_person?: ExpenseByPerson[];
  cash_in_by_person?: ExpenseByPerson[];
  occupancy_rate: number;        // 0..1 fraction
  total_tenants: number;
  overdue_tenants: number;
  vacant_beds: number;
  total_beds?: number;
  // Legacy aliases (older deployments)
  rent_collected_paise?: number;
  gross_rent_expected_paise?: number;
  active_tenants?: number;
  month?: number;
  year?: number;
}

export interface CashflowPoint {
  month: string;
  income_paise: number;
  expenses_paise: number;
}

export interface OccupancyPoint {
  month: string;
  rate: number;
}

export function useDashboardSummary(
  propertyId?: string,
  month?: number,
  year?: number,
) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', propertyId, month, year],
    queryFn: () =>
      api
        .get('/dashboard/summary', {
          params: {
            property_id: propertyId,
            month: month || undefined,
            year: year || undefined,
          },
        })
        .then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useCashflow(propertyId?: string) {
  return useQuery<{ items: CashflowPoint[] }>({
    queryKey: ['dashboard', 'cashflow', propertyId],
    queryFn: () =>
      api
        .get('/dashboard/cashflow', { params: { property_id: propertyId } })
        .then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useOccupancyTrend(propertyId?: string) {
  return useQuery<{ items: OccupancyPoint[] }>({
    queryKey: ['dashboard', 'occupancy-trend', propertyId],
    queryFn: () =>
      api
        .get('/dashboard/occupancy-trend', { params: { property_id: propertyId } })
        .then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useRecentActivity(propertyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'activity', propertyId],
    queryFn: () =>
      api
        .get('/dashboard/recent-activity', { params: { property_id: propertyId } })
        .then((r) => r.data),
    enabled: !!propertyId,
  });
}
