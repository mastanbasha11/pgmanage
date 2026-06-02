/**
 * Per-property WhatsApp + UPI settings (Meta Cloud API integration).
 *
 * - `useWhatsAppSettings(propertyId)` reads what's connected (booleans for
 *   token presence, never the token itself).
 * - `useUpdateWhatsAppSettings` PATCHes phone_number_id / access_token /
 *   display number / upi_vpa.
 * - `useTestSendWhatsApp` fires a single approved-template message so the
 *   owner can verify their setup before the monthly cron runs.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface WhatsAppSettings {
  whatsapp_phone_number_id: string | null;
  whatsapp_number: string | null;
  upi_vpa: string | null;
  has_access_token: boolean;
}

export interface WhatsAppSettingsUpdate {
  whatsapp_phone_number_id?: string | null;
  whatsapp_number?: string | null;
  whatsapp_access_token?: string | null;
  upi_vpa?: string | null;
}

export interface WhatsAppTestSendResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

export function useWhatsAppSettings(propertyId: string | undefined) {
  return useQuery<WhatsAppSettings>({
    queryKey: ['whatsapp-settings', propertyId],
    enabled: !!propertyId,
    queryFn: () => api.get(`/properties/${propertyId}/whatsapp`).then((r) => r.data),
  });
}

export function useUpdateWhatsAppSettings(propertyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WhatsAppSettingsUpdate) =>
      api.patch(`/properties/${propertyId}/whatsapp`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-settings', propertyId] }),
  });
}

export function useTestSendWhatsApp(propertyId: string | undefined) {
  return useMutation<WhatsAppTestSendResult, unknown, { to_phone: string; template_name?: string }>({
    mutationFn: (body) =>
      api.post(`/properties/${propertyId}/whatsapp/test-send`, body).then((r) => r.data),
  });
}
