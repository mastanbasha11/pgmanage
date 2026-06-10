/**
 * Dashboard — landing tab. KPIs from /dashboard/summary + Quick actions.
 *
 * The /dashboard/summary endpoint is owner-only (canAccessFinancials).
 * Non-financial roles see only the Quick actions card with property
 * stats they can act on, no money fields.
 *
 * KPI section switcher (chip strip at top):
 *   - Occupancy & dues (default)
 *   - Rent & Payments
 *   - Profit & Loss
 * Quick actions card stays put underneath so the most-used action
 * (Take Payment) is always one tap away.
 */
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import { Button, Card, Header, KpiCard, Loading, rupees, Screen } from '../../components/ui';

/**
 * Actual shape returned by GET /api/v1/dashboard/summary (web's authority).
 * All money is paise; rates are 0..1 fractions.
 */
interface DashSummary {
  // occupancy
  total_beds: number;
  vacant_beds: number;
  occupancy_rate: number; // 0..1
  total_tenants: number;
  overdue_tenants: number;
  // rent & payments (this fiscal month, or calendar month when no property)
  expected_rent_paise: number;
  collected_rent_paise: number;
  discount_paise: number;
  outstanding_paise: number;
  collection_rate: number; // 0..1
  advance_received_paise: number;
  bookings_revenue_paise: number;
  // P&L
  refunds_given_paise: number;
  total_expenses_paise: number;
  net_income_paise: number;
}

type Section = 'occupancy' | 'rent' | 'pnl';

export default function DashboardTab() {
  const { user, selectedPropertyId, voiceGuidance, canAccessFinancials } = useAppStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasFinancials = canAccessFinancials();
  const [section, setSection] = useState<Section>('occupancy');

  // /dashboard/summary is owner-only on the backend; skip the query entirely
  // for SUPERVISOR / PROPERTY_MANAGER to avoid a 403 spinner.
  const { data, isLoading, refetch, isRefetching } = useQuery<DashSummary>({
    queryKey: ['dash-summary', selectedPropertyId],
    queryFn: () =>
      api
        .get<DashSummary>('/dashboard/summary', { params: { property_id: selectedPropertyId } })
        .then((r) => r.data),
    enabled: !!selectedPropertyId && hasFinancials,
  });

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.dashboard'));
  }, [voiceGuidance]);

  const occupiedBeds = data ? Math.max((data.total_beds ?? 0) - (data.vacant_beds ?? 0), 0) : 0;
  const occupancyPct = data ? Math.round((data.occupancy_rate ?? 0) * 100) : 0;

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{
          padding: space.lg,
          paddingBottom: insets.bottom + space.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <Header
          title={`${t('dash.welcome')}, ${user?.name?.split(' ')[0] ?? ''}`}
          subtitle={t('tab.dashboard')}
        />

        {hasFinancials && (
          <>
            <SectionTabs value={section} onChange={setSection} />

            {isLoading || !data ? (
              <Loading />
            ) : section === 'occupancy' ? (
              <OccupancyKpis
                occupancyPct={occupancyPct}
                occupied={occupiedBeds}
                total={data.total_beds}
                vacant={data.vacant_beds}
                outstanding={data.outstanding_paise}
                totalTenants={data.total_tenants}
                overdueTenants={data.overdue_tenants}
              />
            ) : section === 'rent' ? (
              <RentKpis
                expected={data.expected_rent_paise}
                collected={data.collected_rent_paise}
                outstanding={data.outstanding_paise}
                advance={data.advance_received_paise}
                bookings={data.bookings_revenue_paise}
                rate={data.collection_rate}
              />
            ) : (
              <PnlKpis
                cashIn={
                  (data.collected_rent_paise ?? 0) + (data.advance_received_paise ?? 0)
                }
                expenses={data.total_expenses_paise}
                refunds={data.refunds_given_paise}
                netIncome={data.net_income_paise}
              />
            )}
          </>
        )}

        {!hasFinancials && (
          <Card style={{ marginBottom: space.md }}>
            <Text style={styles.note}>
              Hi {user?.name?.split(' ')[0] ?? ''}, you're signed in as {user?.role ?? '—'}.
              Money KPIs are visible to owners only. Use the actions below.
            </Text>
          </Card>
        )}

        {/* Quick actions — unchanged from previous build. Take Payment + Add
            Booking are owner/partner-only (RBAC mirror of web). */}
        <Card>
          <Text style={styles.qaTitle}>Quick actions</Text>
          <View style={{ gap: space.sm }}>
            {hasFinancials && (
              <Button
                variant="primary"
                iconName="cash-outline"
                label={t('res.record_payment')}
                onPress={() => router.push('/payments/new')}
                block
              />
            )}
            <Button
              variant="secondary"
              iconName="people-outline"
              label={t('res.title')}
              onPress={() => router.push('/tabs/tenants')}
              block
            />
            <Button
              variant="secondary"
              iconName="megaphone-outline"
              label="Leads"
              onPress={() => router.push('/tabs/leads')}
              block
            />
            <Button
              variant="secondary"
              iconName="receipt-outline"
              label="Expenses"
              onPress={() => router.push('/tabs/expenses')}
              block
            />
            <Button
              variant="secondary"
              iconName="bed-outline"
              label={t('tab.rooms')}
              onPress={() => router.push('/tabs/rooms')}
              block
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ── KPI section switcher ────────────────────────────────────────────────────

function SectionTabs({
  value,
  onChange,
}: {
  value: Section;
  onChange: (s: Section) => void;
}) {
  const opts: { key: Section; label: string }[] = [
    { key: 'occupancy', label: 'Occupancy & dues' },
    { key: 'rent', label: 'Rent & Payments' },
    { key: 'pnl', label: 'Profit & Loss' },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.xs, marginBottom: space.md }}
    >
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── KPI groups ──────────────────────────────────────────────────────────────

function OccupancyKpis({
  occupancyPct,
  occupied,
  total,
  vacant,
  outstanding,
  totalTenants,
  overdueTenants,
}: {
  occupancyPct: number;
  occupied: number;
  total: number;
  vacant: number;
  outstanding: number;
  totalTenants: number;
  overdueTenants: number;
}) {
  return (
    <>
      <Row>
        <KpiCard
          label={t('dash.occupancy')}
          value={`${occupancyPct}%`}
          hint={`${occupied}/${total}`}
          tone="info"
          iconName="pie-chart-outline"
        />
        <KpiCard
          label={t('dash.vacant_beds')}
          value={vacant}
          tone="success"
          iconName="bed-outline"
        />
      </Row>
      <Row>
        <KpiCard
          label={t('dash.outstanding')}
          value={rupees(outstanding ?? 0)}
          tone="danger"
          iconName="warning-outline"
        />
        <KpiCard
          label="Active residents"
          value={totalTenants}
          tone="neutral"
          iconName="people-outline"
        />
      </Row>
      <Row>
        <KpiCard
          label="Overdue residents"
          value={overdueTenants}
          tone={overdueTenants > 0 ? 'danger' : 'neutral'}
          iconName="alert-circle-outline"
        />
      </Row>
    </>
  );
}

function RentKpis({
  expected,
  collected,
  outstanding,
  advance,
  bookings,
  rate,
}: {
  expected: number;
  collected: number;
  outstanding: number;
  advance: number;
  bookings: number;
  rate: number;
}) {
  return (
    <>
      <Row>
        <KpiCard
          label="Collected (month)"
          value={rupees(collected ?? 0)}
          hint={`${Math.round((rate ?? 0) * 100)}% of expected`}
          tone="success"
          iconName="cash-outline"
        />
        <KpiCard
          label="Expected (month)"
          value={rupees(expected ?? 0)}
          tone="neutral"
          iconName="document-text-outline"
        />
      </Row>
      <Row>
        <KpiCard
          label={t('dash.outstanding')}
          value={rupees(outstanding ?? 0)}
          tone="danger"
          iconName="warning-outline"
        />
        <KpiCard
          label="Advance received"
          value={rupees(advance ?? 0)}
          tone="info"
          iconName="wallet-outline"
        />
      </Row>
      <Row>
        <KpiCard
          label="Bookings revenue"
          value={rupees(bookings ?? 0)}
          tone="neutral"
          iconName="calendar-outline"
        />
      </Row>
    </>
  );
}

function PnlKpis({
  cashIn,
  expenses,
  refunds,
  netIncome,
}: {
  cashIn: number;
  expenses: number;
  refunds: number;
  netIncome: number;
}) {
  return (
    <>
      <Row>
        <KpiCard
          label="Cash In"
          value={rupees(cashIn ?? 0)}
          hint="Rent + advances"
          tone="success"
          iconName="trending-up-outline"
        />
        <KpiCard
          label="Cash Out"
          value={rupees((expenses ?? 0) + (refunds ?? 0))}
          hint="Expenses + refunds"
          tone="danger"
          iconName="trending-down-outline"
        />
      </Row>
      <Row>
        <KpiCard
          label="Expenses"
          value={rupees(expenses ?? 0)}
          tone="neutral"
          iconName="receipt-outline"
        />
        <KpiCard
          label="Refunds"
          value={rupees(refunds ?? 0)}
          tone="neutral"
          iconName="return-down-back-outline"
        />
      </Row>
      <Row>
        <KpiCard
          label="Net income"
          value={rupees(netIncome ?? 0)}
          tone={netIncome >= 0 ? 'success' : 'danger'}
          iconName={netIncome >= 0 ? 'arrow-up-outline' : 'arrow-down-outline'}
        />
      </Row>
    </>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.md }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.small, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.white },
  qaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.md,
  },
  note: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    lineHeight: 20,
  },
});
