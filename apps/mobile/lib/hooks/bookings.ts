/**
 * Bookings — daily stays + advance bookings for the property.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withIdempotency } from '../api';

export type BookingKind = 'DAILY' | 'ADVANCE';

export interface Booking {
  id: string;
  property_id: string;
  guest_name: string;
  guest_phone?: string;
  room_label?: string;
  kind: BookingKind;
  amount_paise: number;
  check_in?: string;
  check_out?: string;
  payment_mode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';
  reference_number?: string;
  collected_at?: string;
  paid_to?: string;
  notes?: string;
  created_at: string;
}

/** Mirrors the backend response in app/api/v1/bookings.py — there is no
 *  `total` or `totals` key; the aggregates are top-level and already in paise. */
export interface BookingsResponse {
  items: Booking[];
  total_paise: number;
  daily_paise: number;
  advance_paise: number;
  count: number;
}

export function useBookings(params: {
  property_id?: string;
  month?: number;
  year?: number;
  kind?: BookingKind;
  q?: string;
}) {
  return useQuery<BookingsResponse>({
    queryKey: ['bookings', params],
    queryFn: () => api.get('/bookings', { params }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

export interface CreateBookingPayload {
  property_id: string;
  guest_name: string;
  guest_phone?: string;
  room_label?: string;
  kind: BookingKind;
  amount_paise: number;
  check_in?: string;
  check_out?: string;
  payment_mode?: Booking['payment_mode'];
  reference_number?: string;
  collected_at?: string;
  paid_to?: string;
  notes?: string;
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookingPayload) =>
      api.post('/bookings', data, withIdempotency()).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<CreateBookingPayload>) =>
      api.patch(`/bookings/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useDeleteBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/bookings/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useBillingPeriod(propertyId?: string, year?: number, month?: number) {
  return useQuery({
    queryKey: ['billing-period', propertyId, year, month],
    queryFn: () =>
      api.get(`/properties/${propertyId}/billing-period/${year}/${month}`).then((r) => r.data),
    enabled: !!propertyId && !!year && !!month,
  });
}
