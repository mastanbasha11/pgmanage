/**
 * Owner-side Razorpay connection settings (Settings → Payments).
 * Backs GET/PATCH /api/v1/payments/gateway. Secrets are write-only — the GET
 * only reports whether each is set, never the value.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface GatewayConfig {
  key_id: string | null;
  key_secret_set: boolean;
  webhook_secret_set: boolean;
  payments_enabled: boolean;
  webhook_url: string;
}

export interface GatewayUpdate {
  razorpay_key_id?: string;
  razorpay_key_secret?: string;
  razorpay_webhook_secret?: string;
  payments_enabled?: boolean;
}

const KEY = ['payment-gateway'] as const;

export function usePaymentGateway() {
  return useQuery<GatewayConfig>({
    queryKey: KEY,
    queryFn: async () => (await api.get<GatewayConfig>('/payments/gateway')).data,
  });
}

export function useUpdatePaymentGateway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: GatewayUpdate) =>
      (await api.patch('/payments/gateway', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
