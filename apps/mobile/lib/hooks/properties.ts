/**
 * Properties · floors · room-types · rooms · beds · vacant-beds.
 *
 * Mirrors the web hooks in `apps/web/src/hooks/useProperties.ts` +
 * `useTenants.ts` (VacantBed) so screens can be ported 1:1.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Property {
  id: string;
  name: string;
  address?: string;
  total_beds?: number;
  occupied_beds?: number;
  vacant_beds?: number;
  reserved_beds?: number;
  occupancy_rate?: number;
  settlement_day?: number;
}

export interface Floor {
  id: string;
  property_id: string;
  floor_number: number;
  name: string;
  display_order?: number;
}

export interface RoomType {
  id: string;
  property_id: string;
  name: string;
  capacity: number;
  base_rent_paise: number;
  color?: string;
  description?: string;
}

export interface Room {
  id: string;
  property_id: string;
  floor_id: string;
  floor_number?: number;
  floor_name?: string;
  room_type_id?: string;
  room_type?: string;
  room_number: string;
  room_name?: string;
  capacity: number;
  has_ac: boolean;
  base_rent_paise: number;
  occupied?: number;
  vacant?: number;
  reserved?: number;
  maintenance?: number;
}

export interface Bed {
  id: string;
  room_id: string;
  bed_label: string;
  status: 'VACANT' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE';
  tenant_id?: string | null;
  tenant_name?: string | null;
  expected_move_out_date?: string | null;
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
  has_ac?: boolean;
  room_capacity?: number;
  monthly_base_rent_paise: number;
  status?: 'VACANT' | 'UPCOMING';
  available_from?: string;
  current_tenant_id?: string | null;
  current_tenant_name?: string | null;
}

export interface OccupancyRow {
  floor_id: string;
  floor_number: number;
  floor_name: string;
  rooms: Array<{
    id: string;
    room_number: string;
    room_name?: string;
    room_type?: string;
    has_ac?: boolean;
    capacity: number;
    base_rent_paise: number;
    beds: Bed[];
  }>;
}

// ── Properties ───────────────────────────────────────────────────────────────

export function useProperties() {
  return useQuery<{ items: Property[]; total: number }>({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data),
  });
}

export function useProperty(id?: string) {
  return useQuery<Property>({
    queryKey: ['properties', id],
    queryFn: () => api.get(`/properties/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function usePropertyOccupancy(id?: string) {
  return useQuery<{ items: OccupancyRow[] }>({
    queryKey: ['properties', id, 'occupancy'],
    queryFn: () => api.get(`/properties/${id}/occupancy`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useVacantBeds(
  propertyId?: string,
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

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; address?: string; settlement_day?: number }) =>
      api.post('/properties', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });
}

export function useUpdateProperty(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Property>) =>
      api.patch(`/properties/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['properties', id] });
    },
  });
}

export function useUpdateBedStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bedId,
      status,
    }: {
      bedId: string;
      status: 'VACANT' | 'RESERVED' | 'MAINTENANCE';
    }) => api.patch(`/beds/${bedId}`, { status }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

// ── Floors ───────────────────────────────────────────────────────────────────

export function useFloors(propertyId?: string) {
  return useQuery<{ items: Floor[] }>({
    queryKey: ['properties', propertyId, 'floors'],
    queryFn: () => api.get(`/properties/${propertyId}/floors`).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useAddFloor(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { floor_number: number; name: string }) =>
      api.post(`/properties/${propertyId}/floors`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'floors'] });
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
    },
  });
}

export function useUpdateFloor(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; floor_number?: number; name?: string }) =>
      api.patch(`/floors/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties', propertyId, 'floors'] }),
  });
}

export function useDeleteFloor(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/floors/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'floors'] });
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
    },
  });
}

// ── Room Types ───────────────────────────────────────────────────────────────

export function useRoomTypes(propertyId?: string) {
  return useQuery<{ items: RoomType[] }>({
    queryKey: ['properties', propertyId, 'room-types'],
    queryFn: () => api.get(`/properties/${propertyId}/room-types`).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useCreateRoomType(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      capacity: number;
      base_rent_paise: number;
      color?: string;
    }) => api.post(`/properties/${propertyId}/room-types`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties', propertyId, 'room-types'] }),
  });
}

export function useUpdateRoomType(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<RoomType>) =>
      api.patch(`/room-types/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties', propertyId, 'room-types'] }),
  });
}

export function useDeleteRoomType(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/room-types/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties', propertyId, 'room-types'] }),
  });
}

// ── Rooms ────────────────────────────────────────────────────────────────────

export function useRooms(propertyId?: string) {
  return useQuery<{ items: Room[] }>({
    queryKey: ['properties', propertyId, 'rooms'],
    queryFn: () => api.get(`/properties/${propertyId}/rooms`).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useAddRoom(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      floor_id: string;
      room_type_id?: string;
      room_number: string;
      room_name?: string;
      capacity: number;
      base_rent_paise: number;
      has_ac?: boolean;
    }) => api.post(`/properties/${propertyId}/rooms`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'rooms'] });
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'vacant-beds'] });
    },
  });
}

export function useUpdateRoom(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string } & Partial<
      Pick<Room, 'room_number' | 'room_name' | 'capacity' | 'base_rent_paise' | 'has_ac' | 'room_type_id'>
    >) => api.patch(`/rooms/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'rooms'] });
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'vacant-beds'] });
    },
  });
}

export function useDeleteRoom(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/rooms/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'rooms'] });
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
    },
  });
}
