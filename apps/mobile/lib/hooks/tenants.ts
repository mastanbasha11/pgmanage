/**
 * Tenants + check-in / check-out / notice / refund / re-checkin / ID proof.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

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
  notice_given_date?: string;
  monthly_rent_paise: number;
  outstanding_paise?: number;
  rent_status?: string;
  id_type?: 'AADHAR' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER';
  id_number?: string;
  occupation?: string;
  hometown?: string;
  permanent_address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  vehicle_type?: 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER';
  vehicle_registration?: string;
  security_deposit_paise?: number;
  advance_paid_paise?: number;
  non_refundable_advance_paise?: number;
  id_proof_url?: string;
  id_proof_mime?: string;
}

export interface TenantsResponse {
  items: Tenant[];
  total: number;
}

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
  vehicle_type?: 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER';
  vehicle_registration?: string;
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
  vehicle_type?: 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER';
  vehicle_registration?: string;
  security_deposit_paise?: number;
  advance_paid_paise?: number;
  non_refundable_advance_paise?: number;
}

export function useTenants(params?: {
  property_id?: string;
  status?: string;
  search?: string;
  has_notice?: boolean;
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

export function useTenant(id?: string) {
  return useQuery<Tenant>({
    queryKey: ['tenants', id],
    queryFn: () => api.get(`/tenants/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useTenantLedger(id?: string) {
  return useQuery({
    queryKey: ['tenants', id, 'ledger'],
    queryFn: () => api.get(`/tenants/${id}/ledger`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useTenantTimeline(id?: string) {
  return useQuery({
    queryKey: ['tenants', id, 'timeline'],
    queryFn: () => api.get(`/audit-logs/tenant/${id}`).then((r) => r.data),
    enabled: !!id,
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

export function useUpdateTenant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTenantPayload) =>
      api.patch(`/tenants/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
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

export interface NoticePayload {
  expected_move_out_date: string | null;
  notice_given_date?: string;
  notes?: string;
}

export function useGiveNotice(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NoticePayload) =>
      api.post(`/tenants/${tenantId}/notice`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
      qc.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export interface RefundPayload {
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
    mutationFn: (data: RefundPayload) =>
      api.post(`/tenants/${tenantId}/refund`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
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
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
    },
  });
}

export function useUploadIdProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, uri, filename, mime }: { id: string; uri: string; filename: string; mime: string }) => {
      const fd = new FormData();
      // React Native FormData accepts { uri, name, type }.
      fd.append('file', { uri, name: filename, type: mime } as unknown as Blob);
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
    mutationFn: () => api.delete(`/tenants/${tenantId}/id-proof`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
    },
  });
}
