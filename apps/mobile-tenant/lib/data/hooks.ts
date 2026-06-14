/**
 * Domain data hooks.
 *
 * Each hook returns a TanStack Query result so screens get
 * `data | isLoading | error | refetch` for free. The hook bodies are
 * thin: they dispatch to either the mock fetcher (default) or a real
 * axios call. Replacing the mock side with real endpoints is what
 * happens in the post-mock-everything phase.
 *
 * Naming convention:
 *   useThingQuery   → fetches one thing
 *   useThingMutation → writes a thing (Phase 4+)
 */
import {
  useMutation,
  useQueryClient,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../api';

import { useMockEnabled } from './client';
import { fakeLatency } from './mock/latency';
import {
  mockDues,
  mockEvents,
  mockLedger,
  mockMealsThisWeek,
  mockNotices,
  mockNotifications,
  mockPartners,
  mockPayments,
  mockProfile,
  mockReferrals,
  mockReferralSummary,
  mockResidents,
  mockTickets,
  mockVisitors,
} from './mock/db';
import type {
  AppNotification,
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

// Helper to make a hook that returns mock OR live data depending on flag.
function makeHook<T>(
  key: readonly unknown[],
  mock: T,
  liveUrl: string,
): () => UseQueryResult<T> {
  return () =>
    useQuery({
      queryKey: key,
      queryFn: async () => {
        if (useMockEnabled()) {
          await fakeLatency();
          return mock;
        }
        const r = await api.get<T>(liveUrl);
        return r.data;
      },
    });
}

export const useProfile = makeHook<Profile>(k.profile, mockProfile, '/tenant/me');
export const useDues = makeHook(k.dues, mockDues, '/tenant/dues/current');
export const useLedger = makeHook<LedgerEntry[]>(k.ledger, mockLedger, '/tenant/ledger');
export const usePayments = makeHook<Payment[]>(k.payments, mockPayments, '/tenant/payments');
export const useMealsThisWeek = makeHook<MealServing[]>(k.meals, mockMealsThisWeek, '/tenant/meals/week');
export const useTickets = makeHook<Ticket[]>(k.tickets, mockTickets, '/tenant/tickets');
export const useVisitors = makeHook<Visitor[]>(k.visitors, mockVisitors, '/tenant/visitors');
export const useNotices = makeHook<Notice[]>(k.notices, mockNotices, '/tenant/announcements');
export const useReferrals = makeHook<Referral[]>(k.referrals, mockReferrals, '/tenant/referrals');
export const useReferralSummary = makeHook<ReferralSummary>(
  k.referralSummary,
  mockReferralSummary,
  '/tenant/referrals/summary',
);
export const useEvents = makeHook<Event[]>(k.events, mockEvents, '/tenant/events');
export const useResidentDirectory = makeHook<Resident[]>(k.residents, mockResidents, '/tenant/residents');
export const usePartnerOffers = makeHook<PartnerOffer[]>(k.partners, mockPartners, '/tenant/partners');
export const useNotifications = makeHook<AppNotification[]>(
  k.notifications,
  mockNotifications,
  '/tenant/notifications',
);

// ── Menu (live-only — even in mock mode, hits the real backend) ─────────────
//
// The menu domain is special: the *whole point* is to see what the owner
// just uploaded in the admin webapp. Mock data would defeat that. So
// useCurrentMenu always hits /tenant/menu/current. 404 = no menu yet,
// rendered as a friendly empty state in the UI.

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
        return r.data;
      } catch (err) {
        // 404 = no menu uploaded yet. UI renders a friendly empty state.
        if (
          (err as { response?: { status?: number } })?.response?.status === 404
        ) {
          return null;
        }
        throw err;
      }
    },
    // Menus change at most weekly — be lenient about caching.
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

/**
 * useUpdateKyc — POSTs the resident-app onboarding answers.
 *
 * In mock mode the mutation rewrites the seed Profile in-place so the home
 * screen reflects the new state after the round-trip. In live mode it hits
 * PATCH /tenant/me/kyc. Either way the cached `useProfile` query is
 * invalidated so a Home pull-to-refresh would pick up the change too.
 */
export function useUpdateKyc(): UseMutationResult<Profile, unknown, KycUpdate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (update: KycUpdate) => {
      if (useMockEnabled()) {
        await fakeLatency();
        // Apply to the in-memory seed so subsequent useProfile() returns
        // the patched record.
        if (update.name) mockProfile.name = update.name;
        if (
          update.emergencyContactName ||
          update.emergencyContactPhone ||
          update.emergencyContactRelation
        ) {
          mockProfile.emergency = {
            name: update.emergencyContactName ?? mockProfile.emergency?.name ?? '',
            phone: update.emergencyContactPhone ?? mockProfile.emergency?.phone ?? '',
            relation:
              update.emergencyContactRelation ?? mockProfile.emergency?.relation ?? '',
          };
        }
        if (update.vehicleType) {
          mockProfile.vehicle = {
            type: update.vehicleType,
            registration:
              update.vehicleType === 'NONE'
                ? null
                : update.vehicleRegistration ?? mockProfile.vehicle.registration ?? null,
          };
        }
        // Derived flag — matches backend tenant_me logic.
        mockProfile.kycComplete = Boolean(
          mockProfile.name &&
            mockProfile.emergency?.name &&
            mockProfile.emergency?.phone &&
            mockProfile.vehicle.type,
        );
        return mockProfile;
      }
      // Live: backend expects snake_case fields.
      await api.patch('/tenant/me/kyc', {
        name: update.name,
        emergency_contact_name: update.emergencyContactName,
        emergency_contact_phone: update.emergencyContactPhone,
        emergency_contact_relation: update.emergencyContactRelation,
        vehicle_type: update.vehicleType,
        vehicle_registration: update.vehicleRegistration,
      });
      const r = await api.get<Profile>('/tenant/me');
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k.profile });
    },
  });
}
