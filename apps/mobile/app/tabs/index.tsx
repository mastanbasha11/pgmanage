/**
 * Dashboard — landing tab. Matches web Admin/Partner dashboard shape:
 *
 *   Header:            greeting + month/year picker
 *   Occupancy row:     % (includes RESERVED) + vacant + reserved-beds hint
 *   Followups tile:    /leads/due-today count, deep-links into the drawer
 *   Section switcher:  Occupancy · Rent · Profit & Loss
 *   KPIs by section:   money-received / money-spent / net / attribution
 *   Overdue banner:    tap → /tabs/rent
 *   Quick actions:     Take payment · Add booking · Check-in · Add lead
 *
 * Money endpoints are owner-only on the backend — skip the query when the
 * user can't access financials to avoid a 403 spinner. Non-financial roles
 * see just occupancy + quick actions.
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import {
  Button,
  Card,
  Chip,
  ChipStrip,
  Empty,
  Header,
  KpiCard,
  Loading,
  Row,
  Section,
  Segmented,
  Sheet,
  StatusPill,
  rupees,
} from '../../components/ui';
import { useDashboardSummary, useOverdueBanner } from '../../lib/hooks/dashboard';
import { useDueTodayLeads } from '../../lib/hooks/leads';
import { useProperties } from '../../lib/hooks/properties';

type SectionKey = 'occupancy' | 'rent' | 'pnl';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function todayMY() {
  const d = new Date();
  return { m: d.getMonth() + 1, y: d.getFullYear() };
}

export default function DashboardTab() {
  const {
    user,
    selectedPropertyId,
    setSelectedProperty,
    voiceGuidance,
    canAccessFinancials,
    canRecordPayments,
  } = useAppStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasFinancials = canAccessFinancials();
  const canRecord = canRecordPayments();
  const [section, setSection] = useState<SectionKey>('occupancy');
  const [{ m: month, y: year }, setMY] = useState(todayMY);
  const [propPickerOpen, setPropPickerOpen] = useState(false);

  const properties = useProperties();
  const selectedProp = properties.data?.items.find((p) => p.id === selectedPropertyId);

  const summary = useDashboardSummary({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
  });
  const overdue = useOverdueBanner(hasFinancials ? selectedPropertyId ?? undefined : undefined);
  const followups = useDueTodayLeads();

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.dashboard'));
  }, [voiceGuidance]);

  const data = summary.data;
  const occupiedInclReserved = (data?.occupied_beds ?? 0);
  const reservedCount = data?.reserved_beds ?? 0;
  const totalBeds = data?.total_beds ?? 0;
  const occPct = totalBeds > 0 ? Math.round((occupiedInclReserved / totalBeds) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: space.lg,
          paddingTop: insets.top + space.lg,
          paddingBottom: insets.bottom + space.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={summary.isRefetching || properties.isRefetching}
            onRefresh={() => {
              summary.refetch();
              overdue.refetch();
              followups.refetch();
            }}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <Header
          title={`Hi ${user?.name?.split(' ')[0] ?? ''} 👋`}
          subtitle={
            selectedProp
              ? selectedProp.name
              : properties.isLoading
              ? 'Loading properties…'
              : 'No property selected'
          }
          right={
            properties.data?.items && properties.data.items.length > 1 ? (
              <Chip
                label="Switch"
                iconName="swap-horizontal"
                onPress={() => setPropPickerOpen(true)}
              />
            ) : undefined
          }
        />

        {/* Month/year picker */}
        <ChipStrip>
          {MONTHS.map((m, i) => (
            <Chip
              key={m}
              label={m}
              active={i + 1 === month}
              onPress={() => setMY({ m: i + 1, y: year })}
            />
          ))}
          <Chip
            label={String(year)}
            iconName="calendar-outline"
            onPress={() => setMY({ m: month, y: year - 1 })}
          />
        </ChipStrip>

        <View style={{ height: space.md }} />

        {/* Followups + Overdue banners always at top when actionable */}
        {followups.data?.count ? (
          <Card
            style={styles.banner}
            onPress={() => router.push({ pathname: '/tabs/leads' })}
          >
            <View style={styles.bannerIcon}>
              <Ionicons name="alarm-outline" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {followups.data.count} follow-up{followups.data.count > 1 ? 's' : ''} due today
              </Text>
              <Text style={styles.bannerHint}>Tap to open Leads</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
          </Card>
        ) : null}

        {hasFinancials && overdue.data?.count ? (
          <Card
            style={{ ...styles.banner, borderColor: colors.danger }}
            onPress={() => router.push('/tabs/rent')}
          >
            <View style={[styles.bannerIcon, { backgroundColor: colors.dangerBg }]}>
              <Ionicons name="warning" size={20} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: colors.danger }]}>
                {overdue.data.count} overdue · {rupees(overdue.data.amount_paise)}
              </Text>
              <Text style={styles.bannerHint}>Tap to chase in Rent</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
          </Card>
        ) : null}

        {/* Occupancy at the top — same for every role */}
        <Section title="Occupancy">
          {summary.isLoading ? (
            <Loading />
          ) : (
            <>
              <Row gap={space.md} style={{ marginBottom: space.md }}>
                <KpiCard
                  label="Occupied"
                  value={`${occPct}%`}
                  hint={`${occupiedInclReserved}/${totalBeds}${
                    reservedCount ? ` · Reserved ${reservedCount}` : ''
                  }`}
                  tone="info"
                  iconName="pie-chart-outline"
                />
                <KpiCard
                  label="Vacant beds"
                  value={data?.vacant_beds ?? 0}
                  tone={data?.vacant_beds ? 'success' : 'neutral'}
                  iconName="bed-outline"
                  onPress={() => selectedPropertyId && router.push('/tabs/rooms')}
                />
              </Row>
            </>
          )}
        </Section>

        {hasFinancials && (
          <Section title="Money">
            <Segmented<SectionKey>
              value={section}
              onChange={setSection}
              options={[
                { value: 'occupancy', label: 'Overview' },
                { value: 'rent', label: 'Rent' },
                { value: 'pnl', label: 'P&L' },
              ]}
            />
            <View style={{ height: space.md }} />
            {summary.isLoading || !data ? (
              <Loading />
            ) : section === 'occupancy' ? (
              <OverviewKpis data={data} />
            ) : section === 'rent' ? (
              <RentKpis data={data} />
            ) : (
              <PnlKpis data={data} />
            )}
          </Section>
        )}

        {!hasFinancials && (
          <Card style={{ marginBottom: space.md }}>
            <Text style={styles.note}>
              You're signed in as {user?.role ?? '—'}. Money KPIs are visible to owners only.
              Use the actions below.
            </Text>
          </Card>
        )}

        {hasFinancials && data && (
          <AttributionCards data={data} />
        )}

        {/* Quick actions */}
        <Section title="Quick actions">
          <View style={{ gap: space.sm }}>
            {canRecord && (
              <>
                <Button
                  variant="primary"
                  iconName="cash-outline"
                  label="Record payment"
                  onPress={() => router.push('/payments/new')}
                  block
                />
                <Row gap={space.sm}>
                  <Button
                    variant="secondary"
                    iconName="calendar-outline"
                    label="Booking"
                    onPress={() =>
                      router.push({ pathname: '/payments/new', params: { mode: 'GUEST' } })
                    }
                    block
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="secondary"
                    iconName="log-in-outline"
                    label="Check-in"
                    onPress={() =>
                      router.push({ pathname: '/tabs/tenants', params: { openCheckin: '1' } })
                    }
                    block
                    style={{ flex: 1 }}
                  />
                </Row>
              </>
            )}
            <Row gap={space.sm}>
              <Button
                variant="secondary"
                iconName="megaphone-outline"
                label="Leads"
                onPress={() => router.push('/tabs/leads')}
                block
                style={{ flex: 1 }}
              />
              <Button
                variant="secondary"
                iconName="mail-open-outline"
                label="Inbox"
                onPress={() => router.push('/inbox')}
                block
                style={{ flex: 1 }}
              />
            </Row>
          </View>
        </Section>
      </ScrollView>

      {/* Property picker */}
      <Sheet
        open={propPickerOpen}
        onClose={() => setPropPickerOpen(false)}
        title="Switch property"
      >
        {properties.data?.items.map((p) => {
          const active = p.id === selectedPropertyId;
          return (
            <Card
              key={p.id}
              onPress={() => {
                setSelectedProperty(p.id);
                setPropPickerOpen(false);
              }}
              style={{
                marginBottom: space.sm,
                borderColor: active ? colors.accent : colors.border,
                backgroundColor: active ? colors.accentBg : colors.surface,
              }}
            >
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text, fontSize: fontSize.bodyLg }}>
                    {p.name}
                  </Text>
                  {!!p.address && (
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>
                      {p.address}
                    </Text>
                  )}
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
              </Row>
            </Card>
          );
        })}
        {properties.data?.items?.length === 0 && (
          <Empty title="No properties" hint="Create one from the web app" />
        )}
      </Sheet>
    </View>
  );
}

// ── KPI groups ──────────────────────────────────────────────────────────────

function OverviewKpis({ data }: { data: import('../../lib/hooks/dashboard').DashboardSummary }) {
  return (
    <>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <KpiCard
          label="Collected"
          value={rupees(data.rent_collected_paise ?? 0)}
          hint={`of ${rupees(data.expected_paise ?? 0)} expected`}
          tone="success"
          iconName="checkmark-done-outline"
        />
        <KpiCard
          label="Outstanding"
          value={rupees(data.outstanding_paise ?? 0)}
          tone={data.outstanding_paise > 0 ? 'danger' : 'neutral'}
          iconName="warning-outline"
        />
      </Row>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <KpiCard
          label="Cash-in this month"
          value={rupees(cashIn(data))}
          hint="Rent + advance + daily + power"
          tone="info"
          iconName="trending-up-outline"
        />
        <KpiCard
          label="Cash-out"
          value={rupees(cashOut(data))}
          hint="Expenses + refunds"
          tone="warn"
          iconName="trending-down-outline"
        />
      </Row>
    </>
  );
}

function RentKpis({ data }: { data: import('../../lib/hooks/dashboard').DashboardSummary }) {
  const rate = data.expected_paise > 0
    ? Math.round((data.rent_collected_paise / data.expected_paise) * 100)
    : 0;
  return (
    <>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <KpiCard
          label="Expected"
          value={rupees(data.expected_paise ?? 0)}
          tone="neutral"
          iconName="document-text-outline"
        />
        <KpiCard
          label="Collected"
          value={rupees(data.rent_collected_paise ?? 0)}
          hint={`${rate}%`}
          tone="success"
          iconName="cash-outline"
        />
      </Row>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <KpiCard
          label="Discount given"
          value={rupees(data.discount_paise ?? 0)}
          tone="warn"
          iconName="pricetag-outline"
        />
        <KpiCard
          label="Advance"
          value={rupees(data.advance_received_paise ?? 0)}
          tone="info"
          iconName="wallet-outline"
        />
      </Row>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <KpiCard
          label="Daily stays"
          value={rupees(data.daily_stays_paise ?? 0)}
          tone="neutral"
          iconName="calendar-outline"
        />
        <KpiCard
          label="Power meters"
          value={rupees(data.power_paise ?? 0)}
          tone="neutral"
          iconName="flash-outline"
        />
      </Row>
    </>
  );
}

function PnlKpis({ data }: { data: import('../../lib/hooks/dashboard').DashboardSummary }) {
  const inSum = cashIn(data);
  const outSum = cashOut(data);
  const net = inSum - outSum;
  return (
    <>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <KpiCard
          label="Cash In"
          value={rupees(inSum)}
          hint="Rent + advance + daily + power"
          tone="success"
          iconName="trending-up-outline"
        />
        <KpiCard
          label="Cash Out"
          value={rupees(outSum)}
          hint="Expenses + refunds"
          tone="danger"
          iconName="trending-down-outline"
        />
      </Row>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <KpiCard
          label="Net"
          value={rupees(net)}
          tone={net >= 0 ? 'success' : 'danger'}
          iconName={net >= 0 ? 'arrow-up-outline' : 'arrow-down-outline'}
        />
        <KpiCard
          label="Expenses"
          value={rupees(data.expenses_paise ?? 0)}
          tone="neutral"
          iconName="receipt-outline"
        />
      </Row>
    </>
  );
}

function AttributionCards({
  data,
}: {
  data: import('../../lib/hooks/dashboard').DashboardSummary;
}) {
  const cashInBy = Object.entries(data.cash_in_by_person ?? {}).sort(([, a], [, b]) => b - a);
  const spentBy = Object.entries(data.expenses_by_person ?? {}).sort(([, a], [, b]) => b - a);
  if (!cashInBy.length && !spentBy.length && !data.owner_split?.length) return null;
  return (
    <>
      {cashInBy.length > 0 && (
        <Section title="Cash-in by person">
          <Card>
            {cashInBy.map(([name, amt]) => (
              <Row key={name} justify="space-between" style={styles.rowLine}>
                <Text style={styles.rowName}>{name}</Text>
                <StatusPill label={rupees(amt)} tone="success" />
              </Row>
            ))}
          </Card>
        </Section>
      )}
      {spentBy.length > 0 && (
        <Section title="Expenses by person">
          <Card>
            {spentBy.map(([name, amt]) => (
              <Row key={name} justify="space-between" style={styles.rowLine}>
                <Text style={styles.rowName}>{name}</Text>
                <StatusPill label={rupees(amt)} tone="warn" />
              </Row>
            ))}
          </Card>
        </Section>
      )}
      {!!data.owner_split?.length && (
        <Section title="Owner profit split">
          <Card>
            {data.owner_split.map((o) => (
              <Row key={o.name} justify="space-between" style={styles.rowLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{o.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                    {o.share_pct}%
                  </Text>
                </View>
                <StatusPill label={rupees(o.amount_paise)} tone="info" />
              </Row>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cashIn(d: import('../../lib/hooks/dashboard').DashboardSummary): number {
  return (
    (d.rent_collected_paise ?? 0) +
    (d.advance_received_paise ?? 0) +
    (d.daily_stays_paise ?? 0) +
    (d.power_paise ?? 0)
  );
}

function cashOut(d: import('../../lib/hooks/dashboard').DashboardSummary): number {
  return (d.expenses_paise ?? 0) + (d.refunds_paise ?? 0);
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
    padding: space.md,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  bannerHint: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },

  rowLine: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowName: { fontSize: fontSize.body, color: colors.text, fontWeight: '600' },

  note: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
});
