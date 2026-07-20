/**
 * Leads CRM · activities · followups · website leads.
 * Mirrors web pages/leads/* and hooks/useLeads.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'SITE_VISITED'
  | 'NEGOTIATING'
  | 'BOOKED'
  | 'CONVERTED'
  | 'LOST';

export type LeadSource =
  | 'META_AD'
  | 'INSTAGRAM'
  | 'REFERRAL'
  | 'WALKIN'
  | 'JUSTDIAL'
  | 'WEBSITE'
  | 'OTHER';

export const LEAD_STATUSES: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'SITE_VISITED',
  'NEGOTIATING',
  'BOOKED',
  'CONVERTED',
  'LOST',
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  SITE_VISITED: 'Site visited',
  NEGOTIATING: 'Negotiating',
  BOOKED: 'Booked',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};

/**
 * Field names mirror the SELECT in `GET /leads` (app/api/v1/leads.py).
 *
 * This used to declare `room_type`, `budget_paise`, `move_in_date` and
 * `updated_at` — none of which the list endpoint returns, so cards rendered
 * blanks and the "idle" filter silently fell back to `created_at`. The real
 * names are below; anything the list doesn't return is marked as detail-only.
 */
export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: LeadStatus;
  source: LeadSource;
  notes?: string;
  budget_min_paise?: number | null;
  budget_max_paise?: number | null;
  interested_room_type?: string | null;
  expected_move_in_date?: string | null;
  next_followup_at?: string | null;
  last_contacted_at?: string | null;
  /** Whole days since last contact; computed server-side. */
  days_since_contact?: number | null;
  created_at: string;
  assigned_to?: string | null;
  assigned_to_name?: string | null;

  // Present on the single-lead detail response only — do not expect these on
  // rows coming from the list endpoint.
  property_id?: string;
  property_name?: string;
  advance_paise?: number;
  advance_paid_at?: string | null;
  lost_reason?: string;
  source_ad_id?: string;
  source_adset_name?: string;
  created_by?: string;
  created_by_name?: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type: 'NOTE' | 'CALL' | 'VISIT' | 'STATUS_CHANGE' | 'WA_MESSAGE' | 'SYSTEM';
  content: string;
  created_at: string;
  created_by_name?: string;
}

export function useLeads(params?: {
  property_id?: string;
  status?: LeadStatus | 'all';
  source?: LeadSource | 'all';
  assigned_to?: string;
  search?: string;
  limit?: number;
}) {
  return useQuery<{ items: Lead[]; total: number }>({
    queryKey: ['leads', params],
    // 500 matches the web LeadsPage. The pipeline view loads every status in
    // one call, so a low default starves the non-NEW columns as soon as there
    // are enough due-today NEW leads to fill the page.
    queryFn: () => api.get('/leads', { params: { limit: 500, ...params } }).then((r) => r.data),
  });
}

export function useLead(id?: string) {
  return useQuery<Lead>({
    queryKey: ['leads', id],
    queryFn: () => api.get(`/leads/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useLeadActivities(id?: string) {
  return useQuery<{ items: LeadActivity[] }>({
    queryKey: ['leads', id, 'activities'],
    queryFn: () => api.get(`/leads/${id}/activities`).then((r) => r.data),
    enabled: !!id,
  });
}

export interface CreateLeadPayload {
  name: string;
  phone: string;
  email?: string;
  property_id?: string;
  source: LeadSource;
  status?: LeadStatus;
  room_type?: string;
  budget_paise?: number;
  move_in_date?: string;
  next_followup_at?: string;
  notes?: string;
  assigned_to?: string;
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeadPayload) => api.post('/leads', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export interface UpdateLeadPayload {
  name?: string;
  phone?: string;
  email?: string;
  status?: LeadStatus;
  source?: LeadSource;
  room_type?: string;
  budget_paise?: number;
  move_in_date?: string;
  next_followup_at?: string | null;
  notes?: string;
  assigned_to?: string;
  advance_paise?: number;
  advance_paid_at?: string;
  lost_reason?: string;
  property_id?: string;
}

export function useUpdateLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateLeadPayload) =>
      api.patch(`/leads/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads', id] });
    },
  });
}

export function useLogActivity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { activity_type: LeadActivity['activity_type']; content: string }) =>
      api.post(`/leads/${id}/activities`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads', id, 'activities'] });
      qc.invalidateQueries({ queryKey: ['leads', id] });
    },
  });
}

export function useDueTodayLeads() {
  return useQuery<{ items: Lead[]; count: number }>({
    queryKey: ['leads', 'due-today'],
    queryFn: () => api.get('/leads/due-today').then((r) => r.data),
  });
}

// ── Website leads ────────────────────────────────────────────────────────────

export function useWebsiteLeads(propertyId?: string) {
  return useQuery({
    queryKey: ['website-leads', propertyId],
    queryFn: () =>
      api
        .get('/leads', { params: { property_id: propertyId, source: 'WEBSITE', limit: 200 } })
        .then((r) => r.data),
  });
}

export function useNewWebsiteLeadCount() {
  return useQuery<{ count: number }>({
    queryKey: ['website-leads', 'new-count'],
    // The endpoint returns `total = len(items)` for the page it just built —
    // NOT a table count. A `limit: 1` probe therefore always answered "1".
    // Ask for the full page and count client-side.
    queryFn: () =>
      api
        .get('/leads', { params: { source: 'WEBSITE', status: 'NEW', limit: 500 } })
        .then((r) => ({ count: (r.data?.items ?? []).length })),
    refetchInterval: 5 * 60 * 1000,
  });
}
