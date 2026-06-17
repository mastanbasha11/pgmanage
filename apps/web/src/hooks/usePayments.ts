import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';

export type PaymentType =
  | 'RENT'
  | 'ADVANCE'
  | 'DEPOSIT'
  | 'FOOD'
  | 'OTHER_CHARGE'
  | 'REFUND'
  | 'POWER';

export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';

export interface Payment {
  id: string;
  tenant_id?: string;
  tenant_name: string;
  tenant_phone?: string;
  amount_paise: number;
  discount_paise?: number;
  for_days?: number;
  payment_type: PaymentType;
  payment_mode: PaymentMode;
  reference_number?: string;
  paid_to?: string;
  for_month?: number;
  for_year?: number;
  collected_at: string;
  collected_by_name?: string;
  notes?: string;
}

export interface RecordPaymentPayload {
  tenant_id?: string;
  property_id?: string;
  amount_paise: number;
  discount_paise?: number;
  for_days?: number;
  payment_type: PaymentType;
  payment_mode: PaymentMode;
  for_month?: number;
  for_year?: number;
  paid_to?: string;
  upi_id?: string;
  /** ISO date; defaults to server NOW() when omitted. */
  collected_at?: string;
  notes?: string;
}

export interface CollectorRow {
  collector: string;
  payments: number;
  amount_paise: number;
  rent_paise?: number;
  advance_paise?: number;
}

export interface RentLedgerStats {
  expected_paise: number;
  /** Fiscal-window cash collected (RENT payments + DAILY booking cash). */
  collected_paise: number;
  /**
   * Legacy ledger-roll-up view: SUM(rent_ledger_entries.amount_paid_paise)
   * for the (month, year). Useful when reconciling against rent ledger
   * entries vs cash flow. Optional — added in the period-attribution
   * refactor; older responses won't include it.
   */
  ledger_paid_paise?: number;
  discount_paise: number;
  settled_paise: number;
  outstanding_paise: number;
  advance_received_paise?: number;
  refunds_given_paise?: number;
  /** 0..100 percentage. */
  collection_rate: number;
}

export function usePayments(params?: {
  property_id?: string;
  tenant_id?: string;
  month?: number;
  year?: number;
  payment_type?: PaymentType;
}) {
  return useQuery<{ items: Payment[]; total: number }>({
    queryKey: ['payments', params],
    queryFn: () => api.get('/payments', { params }).then((r) => r.data),
    enabled:
      !params ||
      // either has any param or no filter — always fire when no params
      true,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentPayload) =>
      api
        .post('/payments', data, {
          headers: { 'X-Idempotency-Key': uuidv4() },
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
      qc.invalidateQueries({ queryKey: ['rent-overdue'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}

export interface UpdatePaymentPayload {
  amount_paise?: number;
  discount_paise?: number;
  payment_mode?: PaymentMode;
  reference_number?: string;
  paid_to?: string;
  notes?: string;
  collected_at?: string;
  for_month?: number;
  for_year?: number;
}

function invalidatePaymentQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['payments'] });
  qc.invalidateQueries({ queryKey: ['rent-ledger'] });
  qc.invalidateQueries({ queryKey: ['rent-overdue'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['tenants'] });
  qc.invalidateQueries({ queryKey: ['bookings'] });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePaymentPayload }) =>
      api.patch(`/payments/${id}`, data).then((r) => r.data),
    onSuccess: () => invalidatePaymentQueries(qc),
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/payments/${id}`).then((r) => r.data),
    onSuccess: () => invalidatePaymentQueries(qc),
  });
}

export function useRentLedger(params: {
  property_id?: string;
  month: number;
  year: number;
}) {
  return useQuery({
    queryKey: ['rent-ledger', params],
    queryFn: () => api.get('/rent/ledger', { params }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

export function useOverdue(propertyId?: string) {
  return useQuery({
    queryKey: ['rent-overdue', propertyId],
    queryFn: () =>
      api.get('/rent/overdue', { params: { property_id: propertyId } }).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useGenerateLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { property_id: string; month: number; year: number }) =>
      api.post('/rent/generate-ledger', null, { params }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rent-ledger'] }),
  });
}
