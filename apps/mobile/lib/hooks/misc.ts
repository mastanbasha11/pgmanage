/**
 * Everything else — inbox, notifications, audit, jobs, menu, whatsapp,
 * website integration, team.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

// ── Inbox ────────────────────────────────────────────────────────────────────

export type InboxItemKind =
  | 'COMPLAINT'
  | 'NOTICE_TO_VACATE'
  | 'KYC_UPDATE'
  | 'FEEDBACK'
  | 'PAYMENT_QUERY';

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  title: string;
  body?: string;
  tenant_id?: string;
  tenant_name?: string;
  property_id?: string;
  read: boolean;
  created_at: string;
}

export function useInbox(params?: { property_id?: string; unread_only?: boolean }) {
  return useQuery<{ items: InboxItem[]; total: number }>({
    queryKey: ['inbox', params],
    queryFn: () => api.get('/inbox', { params }).then((r) => r.data),
  });
}

export function useInboxUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ['inbox', 'unread-count'],
    queryFn: () => api.get('/inbox/unread-count').then((r) => r.data),
    refetchInterval: 60_000,
  });
}

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/inbox/${id}/read`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useMarkAllInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/inbox/mark-all-read').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

// ── Notifications (outbound WhatsApp/SMS log) ────────────────────────────────

export function useNotifications(params?: { channel?: string; limit?: number }) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () =>
      api.get('/notifications', { params: { limit: 200, ...params } }).then((r) => r.data),
  });
}

// ── Audit logs ───────────────────────────────────────────────────────────────

/**
 * Params must match `GET /audit-logs` exactly (app/api/v1/audit_logs.py).
 * The old names (`entity`, `user_id`, `action`, `limit`) are not declared
 * there, so FastAPI dropped all four — every filter was a no-op and the page
 * size silently stayed at the default 50.
 */
export function useAuditLogs(params?: {
  event_category?: string;
  actor_user_id?: string;
  tenant_id?: string;
  property_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () =>
      api.get('/audit-logs', { params: { page_size: 200, ...params } }).then((r) => r.data),
  });
}

export function useAuditSummary() {
  return useQuery({
    queryKey: ['audit-logs', 'summary'],
    queryFn: () => api.get('/audit-logs/summary').then((r) => r.data),
  });
}

// ── Job runs ─────────────────────────────────────────────────────────────────

export function useJobRuns() {
  return useQuery({
    queryKey: ['job-runs'],
    queryFn: () => api.get('/job-runs').then((r) => r.data),
  });
}

export function useJobRunLog(id?: string) {
  return useQuery({
    queryKey: ['job-runs', id, 'logfile'],
    queryFn: () => api.get(`/job-runs/${id}/logfile`).then((r) => r.data),
    enabled: !!id,
  });
}

// ── Menu (weekly meal cards) ─────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  property_id: string;
  week_start: string;
  file_url?: string;
  mime?: string;
  uploaded_at: string;
  notes?: string;
}

export function useMenus(propertyId?: string) {
  return useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu', propertyId],
    queryFn: () => api.get('/menu', { params: { property_id: propertyId } }).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useUploadMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      propertyId,
      weekStart,
      uri,
      filename,
      mime,
    }: {
      propertyId: string;
      weekStart: string;
      uri: string;
      filename: string;
      mime: string;
    }) => {
      const fd = new FormData();
      fd.append('file', { uri, name: filename, type: mime } as unknown as Blob);
      fd.append('property_id', propertyId);
      fd.append('week_start', weekStart);
      const r = await api.post('/menu/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu'] }),
  });
}

export function useDeleteMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/menu/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu'] }),
  });
}

// ── WhatsApp templates + per-property config ─────────────────────────────────

export function useWhatsAppTemplateVars() {
  return useQuery({
    queryKey: ['whatsapp', 'template-variables'],
    queryFn: () => api.get('/whatsapp/template-variables').then((r) => r.data),
  });
}

export function usePropertyWhatsApp(propertyId?: string) {
  return useQuery({
    queryKey: ['properties', propertyId, 'whatsapp'],
    queryFn: () => api.get(`/properties/${propertyId}/whatsapp`).then((r) => r.data),
    enabled: !!propertyId,
  });
}

export function useUpdatePropertyWhatsApp(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`/properties/${propertyId}/whatsapp`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties', propertyId, 'whatsapp'] }),
  });
}

export function useSendTestWhatsApp(propertyId: string) {
  return useMutation({
    mutationFn: (data: { to: string; template_key: string }) =>
      api.post(`/properties/${propertyId}/whatsapp/test-send`, data).then((r) => r.data),
  });
}

// ── Website integration ──────────────────────────────────────────────────────

export function useWebsiteIntegration() {
  return useQuery({
    queryKey: ['website-integration'],
    queryFn: () => api.get('/website/integration').then((r) => r.data),
  });
}

export function useUpdateWebsiteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch('/website/integration', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['website-integration'] }),
  });
}

// ── Team ─────────────────────────────────────────────────────────────────────

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'PARTNER' | 'PROPERTY_MANAGER' | 'SUPERVISOR' | 'MARKETING';
  is_active: boolean;
  property_ids: string[] | null;
  created_at: string;
}

export function useTeam() {
  return useQuery<{ items: StaffUser[] }>({
    queryKey: ['team'],
    queryFn: () => api.get('/auth/staff').then((r) => r.data),
  });
}

export function useInviteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      email: string;
      password: string;
      role: StaffUser['role'];
      property_ids?: string[];
    }) => api.post('/auth/staff', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}

export function useDeactivateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/auth/staff/${id}/deactivate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}
