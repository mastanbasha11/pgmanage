/**
 * Admin Inbox hooks — tenant-initiated events feed.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type InboxKind =
  | 'COMPLAINT_NEW'
  | 'COMPLAINT_REOPENED'
  | 'NOTICE_GIVEN'
  | 'KYC_UPDATED'
  | 'FEEDBACK'
  | 'OTHER';

export interface InboxEvent {
  id: string;
  tenant_id?: string | null;
  tenant_name?: string | null;
  property_id?: string | null;
  kind: InboxKind;
  summary: string;
  payload: Record<string, unknown>;
  deep_link?: string | null;
  read_at?: string | null;
  created_at: string;
}

const POLL_MS = 30_000;

export function useInbox(status: 'unread' | 'all' = 'unread') {
  return useQuery<{ items: InboxEvent[] }>({
    queryKey: ['inbox', status],
    queryFn: () => api.get('/inbox', { params: { status } }).then((r) => r.data),
    refetchInterval: POLL_MS,
  });
}

export function useInboxUnreadCount(): number {
  const { data } = useQuery<{ count: number }>({
    queryKey: ['inbox', 'unread-count'],
    queryFn: () => api.get('/inbox/unread-count').then((r) => r.data),
    refetchInterval: POLL_MS,
  });
  return data?.count ?? 0;
}

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, string>({
    mutationFn: (eventId) => api.post(`/inbox/${eventId}/read`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useMarkAllInboxRead() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, void>({
    mutationFn: () => api.post('/inbox/mark-all-read').then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}
