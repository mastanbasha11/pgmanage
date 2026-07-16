import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Property {
  id: string;
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
  is_active: boolean;
}

export interface PropertiesResponse {
  items: Property[];
  total: number;
}

export interface CreatePropertyPayload {
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
  google_maps_url?: string;
  amenities?: string[];
}

export interface Floor {
  id: string;
  floor_number: number;
  display_name: string;
}

export interface RoomType {
  id: string;
  name: string;
  capacity: number;
  monthly_base_rent_paise: number;
  description?: string;
}

export function useProperties() {
  return useQuery<PropertiesResponse>({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data),
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ['properties', id],
    queryFn: () => api.get(`/properties/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function usePropertyOccupancy(id: string) {
  return useQuery({
    queryKey: ['properties', id, 'occupancy'],
    queryFn: () => api.get(`/properties/${id}/occupancy`).then((r) => r.data),
    enabled: !!id,
  });
}

export type BedStatusUpdate = 'VACANT' | 'RESERVED' | 'MAINTENANCE';

export function useUpdateBedStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bedId, status, notes }: { bedId: string; status: BedStatusUpdate; notes?: string }) =>
      api
        .patch(`/beds/${bedId}/status`, { status, notes })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePropertyPayload) =>
      api.post('/properties', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });
}

export function useUpdateProperty(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreatePropertyPayload>) =>
      api.put(`/properties/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['properties', id] });
    },
  });
}

export function useAddFloor(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { floor_number: number; display_name: string }) =>
      api.post(`/properties/${propertyId}/floors`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId] });
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
    },
  });
}

export function useRoomTypes(propertyId: string | undefined) {
  return useQuery<{ items: RoomType[] }>({
    queryKey: ['properties', propertyId, 'room-types'],
    queryFn: () =>
      api.get(`/properties/${propertyId}/room-types`).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useCreateRoomType(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      capacity: number;
      monthly_base_rent_paise: number;
      description?: string;
    }) => api.post(`/properties/${propertyId}/room-types`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'room-types'] });
    },
  });
}

export function useAddRoom(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      floor_id: string;
      room_type_id?: string;
      room_number: string;
      display_name: string;
      capacity?: number;
      monthly_base_rent_paise?: number;
      bed_labels?: string[];
    }) => api.post(`/properties/${propertyId}/rooms`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useUpdateFloor(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { floor_id: string; floor_number: number; display_name: string }) =>
      api
        .patch(`/floors/${data.floor_id}`, {
          floor_number: data.floor_number,
          display_name: data.display_name,
        })
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] }),
  });
}

export function useDeleteFloor(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (floor_id: string) => api.delete(`/floors/${floor_id}`).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] }),
  });
}

export function useUpdateRoomType(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      room_type_id: string;
      name: string;
      capacity: number;
      monthly_base_rent_paise: number;
      description?: string;
    }) =>
      api
        .patch(`/room-types/${data.room_type_id}`, {
          name: data.name,
          capacity: data.capacity,
          monthly_base_rent_paise: data.monthly_base_rent_paise,
          description: data.description,
        })
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'room-types'] }),
  });
}

export function useDeleteRoomType(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (room_type_id: string) =>
      api.delete(`/room-types/${room_type_id}`).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'room-types'] }),
  });
}

export function useUpdateRoom(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      room_id: string;
      room_number?: string;
      display_name?: string;
      capacity?: number;
      monthly_base_rent_paise?: number;
      status?: string;
      has_ac?: boolean;
    }) => {
      const { room_id, ...rest } = data;
      return api.patch(`/rooms/${room_id}`, rest).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useDeleteRoom(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (room_id: string) => api.delete(`/rooms/${room_id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties', propertyId, 'occupancy'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}
