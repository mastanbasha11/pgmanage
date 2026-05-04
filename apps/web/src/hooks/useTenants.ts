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
}

export function useUpdateTenant(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTenantPayload) =>
      api.patch(`/tenants/${tenantId}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
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

export function useVacantBeds(propertyId: string | undefined) {
  return useQuery<{ items: VacantBed[]; total: number }>({
    queryKey: ['properties', propertyId, 'vacant-beds'],
    queryFn: () =>
      api.get(`/properties/${propertyId}/vacant-beds`).then((r) => r.data),
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
