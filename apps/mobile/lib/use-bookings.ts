/**
 * /api/v1/bookings hook for the mobile app. Used by the Add Payment screen
 * when the owner picks 'New guest (booking)' as the mode — the body goes
 * to /bookings instead of /payments because there's no tenant_id.
 */
import { useMutation } from '@tanstack/react-query';

import { api } from './api';

export function useCreateBooking() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/bookings', body).then((r) => r.data),
  });
}
