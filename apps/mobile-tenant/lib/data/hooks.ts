/**
 * Domain data hooks — LIVE (no mock fallback).
 *
 * Every hook calls the real backend. Empty arrays are returned by the
 * backend for features that aren't fully implemented yet (visitors,
 * referrals, community, notifications, meals) — the UI handles those
 * via the `Empty` component.
 *
 * Why we dropped the mock layer entirely: the user explicitly called
 * out that the resident app was showing dummy "Aditya" data instead of
 * their real tenant info. The right fix is to point the app at the
 * real backend everywhere; the seed data in mock/db.ts is now only
 * used by tests.
 *
 * Mutations (useUpdateKyc) still write through the real API.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../api';

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
  profile: ['profile'] as const,
  dues: ['dues', 'current'] as const,
  ledger: ['ledger'] as const,
  payments: ['payments'] as const,
  meals: ['meals', 'week'] as const,
  tickets: ['tickets'] as const,
  visitors: ['visitors'] as const,
  notices: ['notices'] as const,
  referrals: ['referrals'] as const,
  referralSummary: ['referrals', 'summary'] as const,
  events: ['events'] as const,
  residents: ['residents'] as const,
  partners: ['partners'] as const,
  notifications: ['notifications'] as const,
};

// Generic helper: GET a URL that returns either { items: T[] } or a
// direct T, run through an adapter. Treats 404 as null so callers can
// render an Empty state without an error banner.
async function getOrNull<T, U>(url: string, map: (raw: U) => T): Promise<T | null> {
  try {
    const r = await api.get<U>(url);
    return map(r.data);
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

async function getItems<T, U>(url: string, map: (raw: U) => T): Promise<T[]> {
  try {
    const r = await api.get<{ items: U[] }>(url);
    return (r.data.items ?? []).map(map);
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) {
      return [];
    }
    throw err;
  }
}

// ── Profile ─────────────────────────────────────────────────────────────────

export function useProfile(): UseQueryResult<Profile> {
  return useQuery({
    queryKey: k.profile,
    queryFn: async () => {
      const r = await api.get<ApiProfile>('/tenant/me');
      return adaptProfile(r.data);
    },
  });
}

// ── Dues + Payments + Ledger ────────────────────────────────────────────────

export function useDues(): UseQueryResult<DuesSummary> {
  return useQuery({
    queryKey: k.dues,
    queryFn: async () => {
      const r = await api.get<ApiDuesSummary>('/tenant/me/dues/current');
      return adaptDues(r.data);
    },
  });
}

export function usePayments(): UseQueryResult<Payment[]> {
  return useQuery({
    queryKey: k.payments,
    queryFn: () => getItems<Payment, ApiPayment>('/tenant/me/payments', adaptPayment),
  });
}

export function useLedger(): UseQueryResult<LedgerEntry[]> {
  return useQuery({
    queryKey: k.ledger,
    queryFn: async () => {
      const r = await api.get<{ entries: ApiLedgerEntry[] }>('/tenant/ledger');
      return (r.data.entries ?? []).map(adaptLedgerEntry);
    },
  });
}

// ── Tickets (mapped from /tenant/complaints) ──────────────────────────────

interface ApiTenantComplaints {
  items: ApiComplaint[];
}

export function useTickets(): UseQueryResult<Ticket[]> {
  return useQuery({
    queryKey: k.tickets,
    queryFn: async () => {
      const r = await api.get<ApiTenantComplaints>('/tenant/complaints');
      return (r.data.items ?? []).map(adaptComplaintAsTicket);
    },
  });
}

// ── Notices ────────────────────────────────────────────────────────────────

export function useNotices(): UseQueryResult<Notice[]> {
  return useQuery({
    queryKey: k.notices,
    queryFn: () => getItems<Notice, ApiNotice>('/tenant/announcements', adaptNotice),
  });
}

// ── Empty-array stubs ──────────────────────────────────────────────────────
// These hooks hit endpoints that return `{ items: [] }` until each
// feature lands. The resident UI renders the `Empty` component for an
// empty list — no dummy data anywhere.

export function useMealsThisWeek(): UseQueryResult<MealServing[]> {
  return useQuery({
    queryKey: k.meals,
    queryFn: () => getItems<MealServing, MealServing>('/tenant/me/meals/week', (m) => m),
  });
}

export function useVisitors(): UseQueryResult<Visitor[]> {
  return useQuery({
    queryKey: k.visitors,
    queryFn: () => getItems<Visitor, Visitor>('/tenant/me/visitors', (v) => v),
  });
}

export function useReferrals(): UseQueryResult<Referral[]> {
  return useQuery({
    queryKey: k.referrals,
    queryFn: () => getItems<Referral, Referral>('/tenant/me/referrals', (r) => r),
  });
}

export function useReferralSummary(): UseQueryResult<ReferralSummary | null> {
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
      }>('/tenant/me/referrals/summary', (raw) => ({
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

export function useEvents(): UseQueryResult<Event[]> {
  return useQuery({
    queryKey: k.events,
    queryFn: () => getItems<Event, Event>('/tenant/me/events', (e) => e),
  });
}

export function useResidentDirectory(): UseQueryResult<Resident[]> {
  return useQuery({
    queryKey: k.residents,
    queryFn: () => getItems<Resident, Resident>('/tenant/me/residents', (r) => r),
  });
}

export function usePartnerOffers(): UseQueryResult<PartnerOffer[]> {
  return useQuery({
    queryKey: k.partners,
    queryFn: () => getItems<PartnerOffer, PartnerOffer>('/tenant/me/partners', (p) => p),
  });
}

export function useNotifications(): UseQueryResult<AppNotification[]> {
  return useQuery({
    queryKey: k.notifications,
    queryFn: () =>
      getItems<AppNotification, AppNotification>('/tenant/me/notifications', (n) => n),
  });
}

// ── Menu (filesystem-backed; see backend/app/api/v1/menu.py) ───────────────

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

export function useCurrentMenu(): UseQueryResult<CurrentMenuResponse | null> {
  return useQuery({
    queryKey: ['menu', 'current'],
    queryFn: async () => {
      try {
        const r = await api.get<CurrentMenuResponse>('/tenant/menu/current');
        // Backend returns a relative URL; prepend the API origin so the
        // mobile RN Linking.openURL gets a full https:// URL.
        const base = (
          process.env.EXPO_PUBLIC_API_URL ?? 'https://pgmanage.in/api/v1'
        ).replace(/\/api\/v1\/?$/, '');
        return { ...r.data, url: `${base}${r.data.url}` };
      } catch (err) {
        if (
          (err as { response?: { status?: number } })?.response?.status === 404
        ) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

/**
 * useUpdateKyc — PATCH /tenant/me/kyc.
 */
export function useUpdateKyc(): UseMutationResult<void, unknown, KycUpdate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (update: KycUpdate) => {
      await api.patch('/tenant/me/kyc', {
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
