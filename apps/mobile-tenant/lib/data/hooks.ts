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
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

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
