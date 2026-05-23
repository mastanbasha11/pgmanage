import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** DB lead_status_enum values relevant to website leads. */
export type LeadStatus = 'NEW' | 'CONTACTED' | 'SITE_VISITED' | 'NEGOTIATING' | 'CONVERTED' | 'LOST';

export interface WebsiteLead {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  source: string;
  status: LeadStatus;
  interested_room_type?: string | null;
  expected_move_in_date?: string | null;
  /** The booking form's free-text message is stored in `notes`. */
  notes?: string | null;
  created_at: string;
}

export interface WebsiteIntegration {
  token: string | null;
  webhook_url: string | null;
  allowed_origins: string | null;
  snippet: string;
  rate_limit_per_hour: number;
}

const POLL_MS = 30_000; // poll cadence for "real-time" feel without websockets

/** All website leads (newest first), polled for near-real-time updates. */
export function useWebsiteLeads() {
  return useQuery<{ items: WebsiteLead[]; total: number }>({
    queryKey: ['leads', 'website'],
    queryFn: () =>
      api.get('/leads', { params: { source: 'WEBSITE', limit: 200 } }).then((r) => r.data),
    refetchInterval: POLL_MS,
  });
}

/** Count of NEW website leads — drives the sidebar notification badge. */
export function useNewWebsiteLeadCount(): number {
  const { data } = useQuery<{ items: WebsiteLead[] }>({
    queryKey: ['leads', 'website', 'new-count'],
    queryFn: () =>
      api
        .get('/leads', { params: { source: 'WEBSITE', status: 'NEW', limit: 200 } })
        .then((r) => r.data),
    refetchInterval: POLL_MS,
  });
  return data?.items?.length ?? 0;
}

/** One-click status change for a lead. */
export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      api.patch(`/leads/${id}`, { status }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

/** Owner's website-integration config (token, webhook URL, embed snippet). */
export function useWebsiteIntegration() {
  return useQuery<WebsiteIntegration>({
    queryKey: ['website-integration'],
    queryFn: () => api.get('/website/integration').then((r) => r.data),
  });
}
