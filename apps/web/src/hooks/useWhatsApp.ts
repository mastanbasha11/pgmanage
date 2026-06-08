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

/**
 * One placeholder mapping inside a WhatsApp template body. The list, in
 * order, fills `{{1}}, {{2}}, …` at send time.
 *  - `variable` → value resolved from the per-template variable catalogue
 *    (tenant_name, amount_rupees, …). See useTemplateVariables.
 *  - `static`   → literal text, never substituted.
 */
export type TemplateParam =
  | { kind: 'variable'; key: string }
  | { kind: 'static'; value: string };

export interface WhatsAppSettings {
  whatsapp_phone_number_id: string | null;
  whatsapp_number: string | null;
  upi_vpa: string | null;
  has_access_token: boolean;
  /** Template-override columns. NULL → use server defaults
   *  (rent_reminder/rent_overdue in en_US). */
  wa_rent_reminder_template_name: string | null;
  wa_rent_reminder_template_language: string | null;
  wa_rent_reminder_template_params: TemplateParam[] | null;
  wa_rent_overdue_template_name: string | null;
  wa_rent_overdue_template_language: string | null;
  wa_rent_overdue_template_params: TemplateParam[] | null;
}

export interface WhatsAppSettingsUpdate {
  whatsapp_phone_number_id?: string | null;
  whatsapp_number?: string | null;
  whatsapp_access_token?: string | null;
  upi_vpa?: string | null;
  wa_rent_reminder_template_name?: string | null;
  wa_rent_reminder_template_language?: string | null;
  wa_rent_reminder_template_params?: TemplateParam[] | null;
  wa_rent_overdue_template_name?: string | null;
  wa_rent_overdue_template_language?: string | null;
  wa_rent_overdue_template_params?: TemplateParam[] | null;
}

/** Variable catalogue returned by /api/v1/whatsapp/template-variables. */
export interface TemplateVariable {
  key: string;
  label: string;
  example: string;
}
export type TemplateVariableCatalogue = Record<
  'rent_reminder' | 'rent_overdue',
  { variables: TemplateVariable[] }
>;

/** Fetches the per-template variable list — drives the wizard's dropdown. */
export function useTemplateVariables() {
  return useQuery<TemplateVariableCatalogue>({
    queryKey: ['whatsapp-template-variables'],
    queryFn: () => api.get('/whatsapp/template-variables').then((r) => r.data),
    staleTime: Infinity, // catalogue is hardcoded on backend, never changes at runtime
  });
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
