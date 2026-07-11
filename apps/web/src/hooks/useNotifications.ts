import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface NotificationEntry {
  id: string;
  created_at: string | null;
  sent_at: string | null;
  channel: 'WHATSAPP' | 'EMAIL' | 'PUSH' | 'SMS';
  template_name: string;
  message_body: string;
  rendered_message: string | null;
  status: 'SENT' | 'FAILED' | 'PENDING';
  delivery_status: string | null;
  delivered_at: string | null;
  external_message_id: string | null;
  error_message: string | null;
  recipient_type: 'TENANT' | 'USER';
  recipient_id: string | null;
  recipient_phone: string | null;
  property_id: string | null;
  property_name: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
}

export interface NotificationFilters {
  channel?: string;
  status?: string;
  property_id?: string;
  template_name?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

interface NotificationPage {
  items: NotificationEntry[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

/** Strip undefined / empty values so we don't send blank query params. */
function cleanParams(filters: NotificationFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v as string | number;
  }
  return out;
}

export function useNotifications(filters: NotificationFilters) {
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: async () => {
      const res = await api.get<NotificationPage>('/notifications', {
        params: cleanParams(filters),
      });
      return res.data;
    },
    placeholderData: keepPreviousData,
  });
}
