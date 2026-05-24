import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AuditLogEntry {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_role: string | null;
  actor_name: string | null;
  actor_ip: string | null;
  event_type: string;
  event_category: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  property_id: string | null;
  property_name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  metadata: Record<string, unknown>;
}

/** Shape of a single before/after change recorded in metadata.changes. */
export interface FieldChange {
  old: unknown;
  new: unknown;
}

export interface AuditLogFilters {
  actor_user_id?: string;
  event_category?: string;
  tenant_id?: string;
  property_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page_size?: number;
}

interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

export interface StaffSummary {
  user_id: string;
  user_name: string;
  role: string;
  event_count: number;
  last_active: string | null;
}

/** Strip undefined / empty values so we don't send blank query params. */
function cleanParams(filters: AuditLogFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v as string | number;
  }
  return out;
}

/** Global activity feed — infinite scroll / load more. */
export function useAuditLogs(filters: AuditLogFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['audit-logs', filters],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<AuditLogPage>('/audit-logs', {
        params: { ...cleanParams(filters), page: pageParam, page_size: filters.page_size ?? 50 },
      });
      return res.data;
    },
    getNextPageParam: (lastPage) => (lastPage.has_next ? lastPage.page + 1 : undefined),
  });
}

/** Full chronological timeline for one tenant (newest first, no pagination). */
export function useTenantTimeline(tenantId: string) {
  return useQuery({
    queryKey: ['audit-logs', 'tenant', tenantId],
    queryFn: async () => {
      const res = await api.get<{ items: AuditLogEntry[] }>(`/audit-logs/tenant/${tenantId}`);
      return res.data.items;
    },
    enabled: !!tenantId,
  });
}

/** Per-staff activity counts for the last 30 days. */
export function useAuditSummary() {
  return useQuery({
    queryKey: ['audit-logs', 'summary'],
    queryFn: async () => {
      const res = await api.get<StaffSummary[]>('/audit-logs/summary');
      return res.data;
    },
  });
}
