/**
 * Settlement-aware default month for the financial dashboards.
 *
 * Dashboards (main / rent / bookings / expenses) used to default to the
 * calendar month. But once a property's fiscal month has closed (past its
 * settlement day), the books are shut and the natural default is the *next*
 * month. This hook seeds month/year from the backend's fiscal-aware default
 * (GET /billing/current-period) while still letting the user pick any month —
 * once they change it, we stop overriding.
 *
 * Drop-in for the old pattern:
 *   const cmy = currentMonthYear();
 *   const [month, setMonth] = useState(cmy.month);
 *   const [year, setYear]  = useState(cmy.year);
 * becomes:
 *   const { month, year, setMonth, setYear } = useFiscalMonthState(propertyId);
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { currentMonthYear } from '@/lib/utils';

interface CurrentPeriod {
  month: number;
  year: number;
  rolled: boolean;
}

export function useCurrentFiscalPeriod(propertyId?: string) {
  return useQuery<CurrentPeriod>({
    queryKey: ['current-fiscal-period', propertyId ?? 'all'],
    queryFn: () =>
      api
        .get('/billing/current-period', {
          params: propertyId ? { property_id: propertyId } : {},
        })
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFiscalMonthState(propertyId?: string) {
  // Calendar month is the synchronous fallback until the fiscal default loads.
  const cmy = currentMonthYear();
  const [month, setMonthState] = useState(cmy.month);
  const [year, setYearState] = useState(cmy.year);
  // Once the user manually changes the month, never auto-override it.
  const touched = useRef(false);

  const { data } = useCurrentFiscalPeriod(propertyId);

  useEffect(() => {
    if (data && !touched.current) {
      setMonthState(data.month);
      setYearState(data.year);
    }
  }, [data]);

  const setMonth = useCallback((m: number) => {
    touched.current = true;
    setMonthState(m);
  }, []);
  const setYear = useCallback((y: number) => {
    touched.current = true;
    setYearState(y);
  }, []);

  return { month, year, setMonth, setYear, rolled: data?.rolled ?? false };
}
