import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TeamRole = 'OWNER' | 'MANAGER' | 'COLLECTOR';

export interface TeamMember {
  id: string;
  name: string;
  phone?: string | null;
  role: TeamRole;
  share_pct?: number | null;
  sort_order: number;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export function useTeam(propertyId?: string, opts?: { includeInactive?: boolean }) {
  return useQuery<{ items: TeamMember[]; total: number }>({
    queryKey: ['property-team', propertyId, opts?.includeInactive],
    queryFn: () =>
      api
        .get(`/properties/${propertyId}/team`, {
          params: opts?.includeInactive ? { include_inactive: true } : undefined,
        })
        .then((r) => r.data),
    enabled: !!propertyId,
  });
}

export interface TeamMemberInput {
  name: string;
  phone?: string;
  role: TeamRole;
  share_pct?: number;
  sort_order?: number;
  notes?: string;
}

export function useCreateTeamMember(propertyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TeamMemberInput) =>
      api.post(`/properties/${propertyId}/team`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['property-team'] }),
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TeamMemberInput> & { is_active?: boolean } }) =>
      api.patch(`/team/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['property-team'] }),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/team/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['property-team'] }),
  });
}
