import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Tenant {
  id: string;
  name: string;
  phone: string;
  email?: string;
  property_id?: string;
  property_name?: string;
  bed_id?: string;
  bed_label?: string;
  room_id?: string;
  room_number?: string;
  room_name?: string;
  room_type?: string;
  floor_id?: string;
  floor_number?: number;
  floor_name?: string;
  is_active: boolean;
  status: 'ACTIVE' | 'CHECKED_OUT' | 'RESERVED';
  move_in_date: string;
  expected_move_out_date?: string;
  monthly_rent_paise: number;
  outstanding_paise?: number;
  rent_status?: string;
}

export interface TenantsResponse {
  items: Tenant[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface VacantBed {
  id: string;
  bed_label: string;
  room_id: string;
  room_number: string;
  room_name: string;
  floor_id: string;
  floor_number: number;
  floor_name: string;
  room_type?: string;
  monthly_base_rent_paise: number;
  /** "VACANT" right now, or "UPCOMING" when an active tenant's vacate date is set. */
  status?: 'VACANT' | 'UPCOMING';
  /** ISO date — today for VACANT rows, expected_move_out_date for UPCOMING. */
  available_from?: string;
  current_tenant_id?: string | null;
  current_tenant_name?: string | null;
}

/**
 * Matches backend `TenantCreate` schema in apps/backend/app/api/v1/tenants.py.
 * Rent details must be sent as a nested `rent_plan` object.
 */
export interface CheckinPayload {
  name: string;
  phone: string;
  email?: string;
  bed_id: string;
  id_type: 'AADHAR' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER';
  id_number: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  occupation?: string;
  permanent_address?: string;
  move_in_date: string;
  expected_move_out_date?: string;
  notes?: string;
  rent_plan: {
    monthly_rent_paise: number;
    security_deposit_paise: number;
    advance_paid_paise: number;
    non_refundable_advance_paise?: number;
    food_included: boolean;
    food_charges_paise: number;
    billing_day: number;
    effective_from: string;
  };
}

export function useTenants(params?: {
  property_id?: string;
  status?: string;
  search?: string;
  limit?: number;
  sort_by?: 'room' | 'name' | 'move_in';
}) {
  return useQuery<TenantsResponse>({
    queryKey: ['tenants', params],
    queryFn: () =>
      api
        .get('/tenants', { params: { limit: 200, sort_by: 'room', ...params } })
        .then((r) => r.data),
  });
}

export interface UpdateTenantPayload {
  name?: string;
  phone?: string;
  email?: string;
  id_type?: 'AADHAR' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER';
  id_number?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  occupation?: string;
  hometown?: string;
  permanent_address?: string;
  expected_move_out_date?: string;
  notes?: string;
  /** Updates the active rent_plan, not the tenants row. */
  security_deposit_paise?: number;
  advance_paid_paise?: number;
  non_refundable_advance_paise?: number;
}

export function useUpdateTenant(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTenantPayload) =>
      api.patch(`/tenants/${tenantId}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export interface RecordRefundPayload {
  refund_amount_paise: number;
  refund_paid_by?: string;
  refund_date: string;
  notes?: string;
  payment_mode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';
  reference_number?: string;
}

export function useRecordRefund(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordRefundPayload) =>
      api.post(`/tenants/${tenantId}/refund`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: ['tenants', id],
    queryFn: () => api.get(`/tenants/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useTenantLedger(id: string) {
  return useQuery({
    queryKey: ['tenants', id, 'ledger'],
    queryFn: () => api.get(`/tenants/${id}/ledger`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useVacantBeds(
  propertyId: string | undefined,
  opts?: { includeUpcoming?: boolean; withinDays?: number },
) {
  return useQuery<{
    items: VacantBed[];
    total: number;
    vacant_count?: number;
    upcoming_count?: number;
  }>({
    queryKey: ['properties', propertyId, 'vacant-beds', opts],
    queryFn: () =>
      api
        .get(`/properties/${propertyId}/vacant-beds`, {
          params: {
            include_upcoming: opts?.includeUpcoming ?? true,
            upcoming_within_days: opts?.withinDays ?? 60,
          },
        })
        .then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CheckinPayload) => api.post('/tenants', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
    },
  });
}

export interface CheckoutPayload {
  actual_move_out_date: string;
  final_payment_amount_paise?: number;
  refund_amount_paise?: number;
  refund_paid_by?: string;
  notes?: string;
}

export function useCheckout(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CheckoutPayload) =>
      api.post(`/tenants/${tenantId}/checkout`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export interface RecheckinPayload {
  bed_id: string;
  move_in_date: string;
  expected_move_out_date?: string;
  rent_plan: CheckinPayload['rent_plan'];
}

export function useRecheckin(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecheckinPayload) =>
      api.post(`/tenants/${tenantId}/recheckin`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
    },
  });
}

export function useUploadIdProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post(`/tenants/${id}/id-proof`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', vars.id] });
    },
  });
}

export function useDeleteIdProof(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.delete(`/tenants/${tenantId}/id-proof`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
    },
  });
}
