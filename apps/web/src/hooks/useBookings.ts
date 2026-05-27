import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type BookingKind = 'DAILY' | 'ADVANCE';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';

export interface Booking {
  id: string;
  property_id: string;
  property_name?: string;
  guest_name: string;
  guest_phone?: string | null;
  room_label: string;
  kind: BookingKind;
  amount_paise: number;
  check_in_date: string;
  check_out_date?: string | null;
  payment_mode: PaymentMode;
  reference_number?: string | null;
  collected_at: string;
  collected_by_name?: string | null;
  paid_to?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingsResponse {
  items: Booking[];
  total_paise: number;
  daily_paise: number;
  advance_paise: number;
  count: number;
}

export interface CreateBookingPayload {
  property_id: string;
  guest_name: string;
  guest_phone?: string;
  room_label: string;
  kind: BookingKind;
  amount_paise: number;
  check_in_date: string;
  check_out_date?: string;
  payment_mode?: PaymentMode;
  reference_number?: string;
  collected_at: string;
  paid_to?: string;
  notes?: string;
}

export interface UpdateBookingPayload {
  guest_name?: string;
  guest_phone?: string;
  room_label?: string;
  kind?: BookingKind;
  amount_paise?: number;
  check_in_date?: string;
  check_out_date?: string;
  payment_mode?: PaymentMode;
  reference_number?: string;
  collected_at?: string;
  paid_to?: string;
  notes?: string;
}

export function useBookings(params?: {
  property_id?: string;
  kind?: BookingKind;
  month?: number;
  year?: number;
  q?: string;
}) {
  return useQuery<BookingsResponse>({
    queryKey: ['bookings', params],
    queryFn: () =>
      api
        .get('/bookings', {
          params: Object.fromEntries(
            Object.entries(params ?? {}).filter(
              ([, v]) => v !== undefined && v !== '' && v !== null,
            ),
          ),
        })
        .then((r) => r.data),
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookingPayload) =>
      api.post('/bookings', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateBooking(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBookingPayload) =>
      api.patch(`/bookings/${bookingId}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/bookings/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
