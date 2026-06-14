/**
 * Home — the command center.
 *
 * Stacked sections, top-down by importance:
 *   1. Greeting header with referral promo pill
 *   2. (conditional) KYC profile-completion nudge
 *   3. (conditional) Resolved-ticket prompt — "Was it fixed?"
 *   4. (conditional) Notice-given status card
 *   5. Hero rent card (or "All paid" state)
 *   6. Today's meals strip
 *   7. Quick actions
 *   8. Open tickets summary
 *   9. Latest notice banner
 *
 * Everything is mock-backed via lib/data/hooks for v1; replacing the
 * mock side with real endpoints is a single switch (USE_MOCK off).
 */
import { useMemo, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';

import {
  Avatar,
  Card,
  Money,
  Pill,
  Pressable,
  Screen,
  SkeletonLines,
  toast,
} from '../../components/ui';
import {
  useDues,
  useMealsThisWeek,
  useNotices,
  useProfile,
  useReferralSummary,
  useTickets,
} from '../../lib/data/hooks';
import type { MealServing, Ticket } from '../../lib/data/types';
import { useTheme } from '../../lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();

  const profileQ = useProfile();
  const duesQ = useDues();
  const ticketsQ = useTickets();
  const noticesQ = useNotices();
  const mealsQ = useMealsThisWeek();
  const referralQ = useReferralSummary();

  const [refreshing, setRefreshing] = useState(false);
  const [kycDismissed, setKycDismissed] = useState(false);
  const [resolvedTicketDismissed, setResolvedTicketDismissed] = useState<
    Record<string, boolean>
  >({});

  const profile = profileQ.data;
  const dues = duesQ.data;
  const tickets = ticketsQ.data ?? [];
  const notices = noticesQ.data ?? [];
  const meals = mealsQ.data ?? [];

  const openTickets = tickets.filter(
    (t) => t.status !== 'resolved' && t.status !== 'reopened',
  );

  // Resolved-but-not-rated tickets from the last 48h get the "Was it
  // fixed?" prompt — matches the Stanza screenshot you sent.
  const promptableResolvedTicket = useMemo(() => {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return tickets.find(
      (t) =>
        t.status === 'resolved' &&
        !t.rating &&
        t.resolvedAt &&
        Date.parse(t.resolvedAt) >= cutoff &&
        !resolvedTicketDismissed[t.id],
    );
  }, [tickets, resolvedTicketDismissed]);

  const todayMeals = useMemo(() => filterTodayMeals(meals), [meals]);
  const pinnedNotice = notices.find((n) => n.pinned) ?? notices[0];

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      profileQ.refetch(),
      duesQ.refetch(),
      ticketsQ.refetch(),
      noticesQ.refetch(),
      mealsQ.refetch(),
      referralQ.refetch(),
    ]);
    setRefreshing(false);
  }

  if (profileQ.isLoading || !profile) {
    return (
      <Screen scroll>
        <View style={{ marginTop: 24 }}>
          <SkeletonLines count={8} />
        </View>
      </Screen>
    );
  }

  const showKycNudge = !profile.kycComplete && !kycDismissed;

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space['3xl'] }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Header row: avatar + greeting + referral pill */}
        <View style={styles.headerRow}>
          <Avatar name={profile.name} size={44} />
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text
              style={{
                color: colors.text,
                fontSize: fontSize.h2,
                fontWeight: fontWeight.extrabold,
              }}
            >
              Hi, {profile.name.split(' ')[0]}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
              {profile.property.name}
            </Text>
          </View>
          {referralQ.data ? (
            <Pressable
              onPress={() => router.push('/referral')}
              accessibilityLabel="Refer & earn"
              accessibilityRole="button"
              style={{
                backgroundColor: colors.celebrationBg,
                borderColor: colors.celebrationFg,
                borderWidth: 1,
                borderRadius: radius.pill,
                paddingHorizontal: space.md,
                paddingVertical: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="gift" size={14} color={colors.celebrationFg} />
              <Text
                style={{
                  color: colors.celebrationFg,
                  fontSize: fontSize.caption,
                  fontWeight: fontWeight.bold,
                }}
              >
                Earn ₹{Math.round(referralQ.data.bonusPerMoveInPaise / 100).toLocaleString('en-IN')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* KYC nudge */}
        {showKycNudge ? (
          <Card
            variant="hero"
            style={{ marginBottom: space.lg }}
            onPress={() => router.push('/profile/edit')}
          >
            <KycNudgeContent
              onSkip={() => {
                setKycDismissed(true);
                toast.info("We'll remind you later");
              }}
            />
          </Card>
        ) : null}

        {/* Resolved-ticket prompt */}
        {promptableResolvedTicket ? (
          <Card style={{ marginBottom: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.successBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color={colors.successFg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: fontSize.body,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  Has it been fixed?
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: fontSize.small,
                    marginTop: 2,
                  }}
                >
                  Your ticket "{promptableResolvedTicket.title}" was marked resolved.
                </Text>
                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                  <Pressable
                    onPress={() => {
                      router.push(`/tickets/${promptableResolvedTicket.id}`);
                    }}
                    style={{
                      backgroundColor: colors.successFg,
                      borderRadius: radius.pill,
                      paddingHorizontal: space.lg,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: fontSize.small,
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      Yes, rate it
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      router.push(`/tickets/${promptableResolvedTicket.id}`);
                    }}
                    style={{
                      borderColor: colors.borderStrong,
                      borderWidth: 1,
                      borderRadius: radius.pill,
                      paddingHorizontal: space.lg,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: fontSize.small,
                        fontWeight: fontWeight.semibold,
                      }}
                    >
                      No, reopen
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setResolvedTicketDismissed((m) => ({
                        ...m,
                        [promptableResolvedTicket.id]: true,
                      }))
                    }
                    hitSlop={8}
                  >
                    <View style={{ paddingHorizontal: space.sm, paddingVertical: 6 }}>
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: fontSize.small,
                          fontWeight: fontWeight.semibold,
                        }}
                      >
                        Dismiss
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Hero rent card */}
        <RentHeroCard
          dues={dues}
          loading={duesQ.isLoading}
          onPay={() => router.push('/home/pay')}
        />

        {/* Today's meals */}
        <View style={{ marginTop: space['3xl'] }}>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h3,
              fontWeight: fontWeight.bold,
              marginBottom: space.md,
            }}
          >
            Today's meals
          </Text>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {(['breakfast', 'lunch', 'dinner'] as const).map((slot) => {
              const serving = todayMeals[slot];
              return (
                <Pressable
                  key={slot}
                  onPress={() => router.push('/home/food')}
                  accessibilityLabel={`${slot} menu`}
                  accessibilityRole="button"
                  style={{ flex: 1 }}
                >
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: space.md,
                      minHeight: 96,
                    }}
                  >
                    <Ionicons
                      name={
                        slot === 'breakfast'
                          ? 'cafe'
                          : slot === 'lunch'
                            ? 'fast-food'
                            : 'restaurant'
                      }
                      size={18}
                      color={colors.accent}
                    />
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: fontSize.small,
                        fontWeight: fontWeight.bold,
                        marginTop: space.xs,
                        textTransform: 'capitalize',
                      }}
                    >
                      {slot}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{
                        color: colors.textMuted,
                        fontSize: fontSize.caption,
                        marginTop: 2,
                      }}
                    >
                      {serving
                        ? serving.items
                            .map((i) => i.name)
                            .slice(0, 2)
                            .join(', ')
                        : '—'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Quick actions */}
        <View style={{ marginTop: space['3xl'] }}>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h3,
              fontWeight: fontWeight.bold,
              marginBottom: space.md,
            }}
          >
            Quick actions
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <QuickAction
              label="Raise issue"
              iconName="construct"
              onPress={() => router.push('/home/services')}
            />
            <QuickAction
              label="Invite guest"
              iconName="people"
              onPress={() => router.push('/visitors')}
            />
            <QuickAction
              label="View menu"
              iconName="restaurant"
              onPress={() => router.push('/home/food')}
            />
            <QuickAction
              label="Give notice"
              iconName="exit"
              onPress={() => router.push('/notice')}
            />
          </View>
        </View>

        {/* Open tickets */}
        {openTickets.length > 0 ? (
          <View style={{ marginTop: space['3xl'] }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                marginBottom: space.md,
              }}
            >
              <Text
                style={{ color: colors.text, fontSize: fontSize.h3, fontWeight: fontWeight.bold }}
              >
                Open tickets
              </Text>
              <Pressable onPress={() => router.push('/home/services')} hitSlop={8}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: fontSize.small,
                    fontWeight: fontWeight.semibold,
                  }}
                >
                  See all
                </Text>
              </Pressable>
            </View>
            <Card style={{ padding: 0 }}>
              {openTickets.slice(0, 2).map((t, i) => (
                <View key={t.id}>
                  <OpenTicketRow
                    ticket={t}
                    onPress={() => router.push(`/tickets/${t.id}`)}
                  />
                  {i < Math.min(openTickets.length, 2) - 1 ? (
                    <View
                      style={{
                        height: 1,
                        backgroundColor: colors.border,
                        marginHorizontal: space.lg,
                      }}
                    />
                  ) : null}
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {/* Notice banner */}
        {pinnedNotice ? (
          <View style={{ marginTop: space['3xl'] }}>
            <Card
              style={{
                backgroundColor: colors.warningBg,
                borderColor: colors.warningBorder,
              }}
              onPress={() => router.push('/notices')}
              accessibilityLabel={`Notice: ${pinnedNotice.title}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
                <Ionicons name="megaphone" size={20} color={colors.warningFg} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    {pinnedNotice.pinned ? (
                      <Pill label="Pinned" tone="warning" size="sm" />
                    ) : null}
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: fontSize.body,
                        fontWeight: fontWeight.bold,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {pinnedNotice.title}
                    </Text>
                  </View>
                  <Text
                    style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
                    numberOfLines={2}
                  >
                    {pinnedNotice.body}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/* ── Subcomponents ────────────────────────────────────────────────────────── */

function KycNudgeContent({ onSkip }: { onSkip: () => void }) {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="person-circle" size={24} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.text, fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold }}
        >
          Complete your profile
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.small,
            lineHeight: lineHeight.small,
            marginTop: space.xs,
          }}
        >
          Add an emergency contact and your vehicle so gate security recognises you. Under a minute.
        </Text>
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}>
          <View
            style={{
              backgroundColor: colors.accent,
              borderRadius: radius.pill,
              paddingHorizontal: space.lg,
              paddingVertical: 8,
            }}
          >
            <Text
              style={{
                color: colors.onAccent,
                fontSize: fontSize.small,
                fontWeight: fontWeight.bold,
              }}
            >
              Complete now
            </Text>
          </View>
          <Pressable onPress={onSkip} hitSlop={8}>
            <View style={{ paddingHorizontal: space.md, paddingVertical: 8 }}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: fontSize.small,
                  fontWeight: fontWeight.semibold,
                }}
              >
                Maybe later
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function RentHeroCard({
  dues,
  loading,
  onPay,
}: {
  dues: ReturnType<typeof useDues>['data'];
  loading: boolean;
  onPay: () => void;
}) {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  if (loading || !dues) {
    return (
      <Card variant="hero" style={{ marginTop: space.lg }}>
        <SkeletonLines count={3} />
      </Card>
    );
  }
  const paid = dues.status === 'paid';
  return (
    <Card variant="hero" style={{ marginTop: space.lg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space.sm,
        }}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.small,
            fontWeight: fontWeight.semibold,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {dues.monthLabel} rent
        </Text>
        <Pill
          label={paid ? 'Paid' : dues.daysUntilDue < 0 ? 'Overdue' : 'Due'}
          tone={paid ? 'success' : dues.daysUntilDue < 0 ? 'danger' : 'warning'}
          size="sm"
        />
      </View>

      {paid ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingVertical: space.md,
          }}
        >
          <Ionicons name="checkmark-circle" size={32} color={colors.successFg} />
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h2,
              fontWeight: fontWeight.extrabold,
            }}
          >
            All paid for this month
          </Text>
        </View>
      ) : (
        <>
          <Money paise={dues.totalPaise} size="hero" />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              marginTop: space.xs,
            }}
          >
            <Ionicons name="calendar" size={14} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>
              Due {format(parseISO(dues.dueDate), 'd MMM yyyy')}
              {' · '}
              {dues.daysUntilDue >= 0
                ? `${dues.daysUntilDue} day${dues.daysUntilDue === 1 ? '' : 's'} left`
                : `${Math.abs(dues.daysUntilDue)} day${Math.abs(dues.daysUntilDue) === 1 ? '' : 's'} overdue`}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: space.md,
              marginTop: space.lg,
            }}
          >
            <Pressable
              onPress={onPay}
              style={{
                flex: 1,
                backgroundColor: colors.accent,
                borderRadius: radius.md,
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: space.sm,
              }}
            >
              <Ionicons name="card" size={18} color={colors.onAccent} />
              <Text
                style={{
                  color: colors.onAccent,
                  fontSize: fontSize.body,
                  fontWeight: fontWeight.bold,
                }}
              >
                Quick Pay
              </Text>
            </Pressable>
            <Pressable
              onPress={onPay}
              style={{
                paddingVertical: 14,
                paddingHorizontal: space.lg,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderStrong,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.body,
                  fontWeight: fontWeight.semibold,
                }}
              >
                View details
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </Card>
  );
}

function QuickAction({
  label,
  iconName,
  onPress,
}: {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.md,
        flexBasis: '47%',
        flexGrow: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={iconName} size={20} color={colors.accent} />
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: fontSize.body,
          fontWeight: fontWeight.semibold,
          flex: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function OpenTicketRow({ ticket, onPress }: { ticket: Ticket; onPress: () => void }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  const tone =
    ticket.status === 'in_progress'
      ? 'info'
      : ticket.status === 'assigned'
        ? 'info'
        : 'warning';
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: space.lg,
        gap: space.md,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="ticket" size={18} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold }}
          numberOfLines={1}
        >
          {ticket.title}
        </Text>
        <Text
          style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
          numberOfLines={1}
        >
          {ticket.category.replace(/_/g, ' ')} · raised{' '}
          {format(parseISO(ticket.createdAt), 'd MMM')}
        </Text>
      </View>
      <Pill
        label={ticket.status.replace(/_/g, ' ')}
        tone={tone}
        size="sm"
      />
    </Pressable>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function filterTodayMeals(meals: MealServing[]): Record<'breakfast' | 'lunch' | 'dinner', MealServing | undefined> {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  return {
    breakfast: meals.find((m) => m.slot === 'breakfast' && m.date.startsWith(todayStr)),
    lunch: meals.find((m) => m.slot === 'lunch' && m.date.startsWith(todayStr)),
    dinner: meals.find((m) => m.slot === 'dinner' && m.date.startsWith(todayStr)),
  };
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
});
