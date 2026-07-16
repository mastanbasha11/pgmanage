/**
 * Rent ledger + payments (CRUD) + overdue list + generate-ledger.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withIdempotency } from '../api';

export interface RentLedgerRow {
  tenant_id: string;
  tenant_name: string;
  bed_label?: string;
  room_number?: string;
  room_name?: string;
  floor_number?: number;
  monthly_rent_paise: number;
  expected_paise: number;
  paid_paise: number;
  discount_paise?: number;
  outstanding_paise: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'ADVANCE';
  month: number;
  year: number;
  entry_id?: string;
  billing_period_days?: number;
}

export interface RentLedger {
  items: RentLedgerRow[];
  totals: {
    expected_paise: number;
    collected_paise: number;
    outstanding_paise: number;
    discount_paise: number;
    advance_paise: number;
    daily_stays_paise: number;
    power_paise: number;
    refunds_paise: number;
    opening_balance_paise: number;
  };
  collected_by?: Record<string, number>;
  month: number;
  year: number;
}

export function useRentLedger(params: {
  property_id?: string;
  month: number;
  year: number;
  status?: string;
  collector?: string;
}) {
  return useQuery<RentLedger>({
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
    mutationFn: (data: { property_id: string; month: number; year: number }) =>
      api.post('/rent/generate-ledger', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rent-ledger'] }),
  });
}

// ── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  tenant_id?: string;
  tenant_name?: string;
  property_id: string;
  amount_paise: number;
  payment_type: 'RENT' | 'ADVANCE' | 'DEPOSIT' | 'REFUND' | 'DAILY' | 'POWER' | 'OTHER';
  payment_mode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';
  paid_to?: string;
  paid_by?: string;
  reference_number?: string;
  notes?: string;
  month?: number;
  year?: number;
  collected_at: string;
  discount_paise?: number;
}

export function usePayments(params?: {
  property_id?: string;
  tenant_id?: string;
  payment_type?: string;
  month?: number;
  year?: number;
  limit?: number;
}) {
  return useQuery<{ items: Payment[]; total: number }>({
    queryKey: ['payments', params],
    queryFn: () => api.get('/payments', { params: { limit: 100, ...params } }).then((r) => r.data),
  });
}

export interface RecordPaymentPayload {
  tenant_id?: string;
  property_id: string;
  amount_paise: number;
  payment_type: Payment['payment_type'];
  payment_mode: Payment['payment_mode'];
  paid_to?: string;
  paid_by?: string;
  reference_number?: string;
  notes?: string;
  month?: number;
  year?: number;
  collected_at?: string;
  discount_paise?: number;
  days?: number;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentPayload) =>
      api.post('/payments', data, withIdempotency()).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<RecordPaymentPayload>) =>
      api.patch(`/payments/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/payments/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
