/**
 * Web-side tenant-portal data hooks.
 *
 * Mirror of apps/mobile-tenant/lib/data/hooks.ts — same endpoints, same
 * adapters, same React-Query keys — but uses the web's `tenantApi`
 * axios instance (auth token from localStorage 'tenant_access_token',
 * not SecureStore).
 *
 * If you're touching this file, also touch the mobile copy and keep
 * the contracts in sync until we move both to packages/shared.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';

import {
  adaptComplaintAsTicket,
  adaptDues,
  adaptLedgerEntry,
  adaptNotice,
  adaptPayment,
  adaptProfile,
  type ApiComplaint,
  type ApiDuesSummary,
  type ApiLedgerEntry,
  type ApiNotice,
  type ApiPayment,
  type ApiProfile,
} from './adapters';
import type {
  AppNotification,
  DuesSummary,
  Event,
  KycUpdate,
  LedgerEntry,
  MealServing,
  Notice,
  PartnerOffer,
  Payment,
  Profile,
  Referral,
  ReferralSummary,
  Resident,
  Ticket,
  Visitor,
} from './types';

const k = {
  profile: ['tenant-profile'] as const,
  dues: ['tenant-dues', 'current'] as const,
  ledger: ['tenant-ledger'] as const,
  payments: ['tenant-payments'] as const,
  meals: ['tenant-meals', 'week'] as const,
  tickets: ['tenant-tickets'] as const,
  visitors: ['tenant-visitors'] as const,
  notices: ['tenant-notices'] as const,
  referrals: ['tenant-referrals'] as const,
  referralSummary: ['tenant-referrals', 'summary'] as const,
  events: ['tenant-events'] as const,
  residents: ['tenant-residents'] as const,
  partners: ['tenant-partners'] as const,
  notifications: ['tenant-notifications'] as const,
  menu: ['tenant-menu', 'current'] as const,
};

async function getOrNull<T, U>(url: string, map: (raw: U) => T): Promise<T | null> {
  try {
    const r = await tenantApi.get<U>(url);
    return map(r.data);
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
    throw err;
  }
}

async function getItems<T, U>(url: string, map: (raw: U) => T): Promise<T[]> {
  try {
    const r = await tenantApi.get<{ items: U[] }>(url);
    return (r.data.items ?? []).map(map);
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return [];
    throw err;
  }
}

// ── Profile ─────────────────────────────────────────────────────────────────

export function useTenantProfile(): UseQueryResult<Profile> {
  return useQuery({
    queryKey: k.profile,
    queryFn: async () => {
      const r = await tenantApi.get<ApiProfile>('/me');
      return adaptProfile(r.data);
    },
  });
}

// ── Dues / Payments / Ledger ───────────────────────────────────────────────

export function useTenantDues(): UseQueryResult<DuesSummary> {
  return useQuery({
    queryKey: k.dues,
    queryFn: async () => {
      const r = await tenantApi.get<ApiDuesSummary>('/me/dues/current');
      return adaptDues(r.data);
    },
  });
}

export function useTenantPayments(): UseQueryResult<Payment[]> {
  return useQuery({
    queryKey: k.payments,
    queryFn: () => getItems<Payment, ApiPayment>('/me/payments', adaptPayment),
  });
}

export function useTenantLedger(): UseQueryResult<LedgerEntry[]> {
  return useQuery({
    queryKey: k.ledger,
    queryFn: async () => {
      const r = await tenantApi.get<{ entries: ApiLedgerEntry[] }>('/ledger');
      return (r.data.entries ?? []).map(adaptLedgerEntry);
    },
  });
}

// ── Tickets ────────────────────────────────────────────────────────────────

export function useTenantTickets(): UseQueryResult<Ticket[]> {
  return useQuery({
    queryKey: k.tickets,
    queryFn: async () => {
      const r = await tenantApi.get<{ items: ApiComplaint[] }>('/complaints');
      return (r.data.items ?? []).map(adaptComplaintAsTicket);
    },
  });
}

// ── Notices ────────────────────────────────────────────────────────────────

export function useTenantNotices(): UseQueryResult<Notice[]> {
  return useQuery({
    queryKey: k.notices,
    queryFn: () => getItems<Notice, ApiNotice>('/announcements', adaptNotice),
  });
}

// ── Stubs (empty-shape endpoints) ─────────────────────────────────────────

export function useTenantMealsThisWeek(): UseQueryResult<MealServing[]> {
  return useQuery({
    queryKey: k.meals,
    queryFn: () => getItems<MealServing, MealServing>('/me/meals/week', (m) => m),
  });
}

export function useTenantVisitors(): UseQueryResult<Visitor[]> {
  return useQuery({
    queryKey: k.visitors,
    queryFn: () => getItems<Visitor, Visitor>('/me/visitors', (v) => v),
  });
}

export function useTenantReferrals(): UseQueryResult<Referral[]> {
  return useQuery({
    queryKey: k.referrals,
    queryFn: () => getItems<Referral, Referral>('/me/referrals', (r) => r),
  });
}

export function useTenantReferralSummary(): UseQueryResult<ReferralSummary | null> {
  return useQuery({
    queryKey: k.referralSummary,
    queryFn: () =>
      getOrNull<ReferralSummary, {
        code: string;
        share_url: string;
        bonus_per_signup_paise: number;
        bonus_per_move_in_paise: number;
        total_earned_paise: number;
        pending_paise: number;
        credited_to_wallet_paise: number;
      }>('/me/referrals/summary', (raw) => ({
        code: raw.code,
        shareUrl: raw.share_url,
        bonusPerSignupPaise: raw.bonus_per_signup_paise,
        bonusPerMoveInPaise: raw.bonus_per_move_in_paise,
        totalEarnedPaise: raw.total_earned_paise,
        pendingPaise: raw.pending_paise,
        creditedToWalletPaise: raw.credited_to_wallet_paise,
      })),
  });
}

export function useTenantEvents(): UseQueryResult<Event[]> {
  return useQuery({
    queryKey: k.events,
    queryFn: () => getItems<Event, Event>('/me/events', (e) => e),
  });
}

export function useTenantResidentDirectory(): UseQueryResult<Resident[]> {
  return useQuery({
    queryKey: k.residents,
    queryFn: () => getItems<Resident, Resident>('/me/residents', (r) => r),
  });
}

export function useTenantPartnerOffers(): UseQueryResult<PartnerOffer[]> {
  return useQuery({
    queryKey: k.partners,
    queryFn: () => getItems<PartnerOffer, PartnerOffer>('/me/partners', (p) => p),
  });
}

export function useTenantNotifications(): UseQueryResult<AppNotification[]> {
  return useQuery({
    queryKey: k.notifications,
    queryFn: () =>
      getItems<AppNotification, AppNotification>('/me/notifications', (n) => n),
  });
}

// ── Menu ───────────────────────────────────────────────────────────────────

export interface CurrentMenuResponse {
  id: string;
  week_start_date: string;
  s3_key: string;
  content_type: string;
  title?: string | null;
  url: string;
  is_current_week: boolean;
  uploaded_at: string;
}

export function useTenantCurrentMenu(): UseQueryResult<CurrentMenuResponse | null> {
  return useQuery({
    queryKey: k.menu,
    queryFn: async () => {
      try {
        const r = await tenantApi.get<CurrentMenuResponse>('/menu/current');
        return r.data; // Relative URL — browser resolves against current origin.
      } catch (err) {
        if ((err as { response?: { status?: number } })?.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useTenantUpdateKyc(): UseMutationResult<void, unknown, KycUpdate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (update: KycUpdate) => {
      await tenantApi.patch('/me/kyc', {
        name: update.name,
        emergency_contact_name: update.emergencyContactName,
        emergency_contact_phone: update.emergencyContactPhone,
        emergency_contact_relation: update.emergencyContactRelation,
        vehicle_type: update.vehicleType,
        vehicle_registration: update.vehicleRegistration,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k.profile });
    },
  });
}

export function useTenantGiveNotice(): UseMutationResult<
  { advance_refundable: boolean; days_notice: number; move_out_date: string },
  unknown,
  { move_out_date: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const r = await tenantApi.post('/me/notice', body);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k.profile });
    },
  });
}
