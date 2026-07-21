/**
 * Dashboard — landing tab. Mirrors the web Admin/Partner dashboard:
 *
 *   Header:            greeting + property switcher + month picker
 *   Hero:              net profit for the period, with received/spent/margin
 *   Occupancy/Collect: two headline KPI tiles
 *   Today's tasks:     actionable items only, each deep-linking somewhere
 *   Operating metrics: the six web tiles, each with the formula spelled out
 *   Money in vs out:   6-month sparkline + attribution
 *   Quick actions:     Take payment · Booking · Check-in · Leads · Inbox
 *
 * Deliberately ABSENT: the "N tenants have overdue rent from previous months"
 * banner. Rent chasing lives only in Rent & Payments — the web app removed the
 * same banner, and duplicating it here just splits the workflow. Overdue is
 * still surfaced, as a metric tile that deep-links into Rent.
 *
 * Money endpoints are owner-only on the backend — skip the query when the user
 * can't access financials to avoid a 403 spinner. Non-financial roles see just
 * occupancy + quick actions.
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
  Loading,
  Row,
  Section,
  Sheet,
  rupees,
} from '../../components/ui';
import { KpiTile, Pill, RankBars, Sparkline, Track } from '../../components/redesign';
import {
  occupiedBeds,
  useCashflow,
  useDashboardSummary,
  useOverdueBanner,
  type DashboardSummary,
} from '../../lib/hooks/dashboard';
import { useDueTodayLeads } from '../../lib/hooks/leads';
import { useProperties } from '../../lib/hooks/properties';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function todayMY() {
  const d = new Date();
  return { m: d.getMonth() + 1, y: d.getFullYear() };
}

/** Compact rupee display for the hero line — "₹4.47L" reads better than the
 *  full figure at 32px on a 5-inch screen. */
function lakh(paise: number): string {
  const rupeeVal = paise / 100;
  if (Math.abs(rupeeVal) >= 100000) return `₹${(rupeeVal / 100000).toFixed(2)}L`;
  return rupees(paise);
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
  const [{ m: month, y: year }, setMY] = useState(todayMY);
  const [propPickerOpen, setPropPickerOpen] = useState(false);

  const properties = useProperties();
  const selectedProp = properties.data?.items.find((p) => p.id === selectedPropertyId);

  const summary = useDashboardSummary({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
  });
  const cashflow = useCashflow({
    property_id: hasFinancials ? selectedPropertyId ?? undefined : undefined,
    months: 6,
  });
  const overdue = useOverdueBanner(hasFinancials ? selectedPropertyId ?? undefined : undefined);
  const followups = useDueTodayLeads();

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.dashboard'));
  }, [voiceGuidance]);

  const data = summary.data;
  const occupied = data ? occupiedBeds(data) : 0;
  const reservedCount = data?.reserved_beds ?? 0;
  const totalBeds = data?.total_beds ?? 0;
  const occPct = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;
  const collectionPct = Math.round((data?.collection_rate ?? 0) * 100);

  const received = data?.total_received_paise ?? 0;
  const spent = data?.total_given_paise ?? 0;
  const net = data?.net_income_paise ?? 0;
  const marginPct = received > 0 ? Math.round((net / received) * 100) : 0;

  const trend = useMemo(
    () => (cashflow.data?.items ?? []).map((p) => p.income_paise / 100),
    [cashflow.data],
  );

  /** Only actionable rows appear — an empty task card is noise. */
  const tasks = useMemo(() => {
    const out: { text: string; action: string; tone: 'r' | 'a' | 'b'; go: () => void }[] = [];
    if (hasFinancials && overdue.data?.count) {
      out.push({
        text: `${overdue.data.count} tenants overdue · ${rupees(overdue.data.amount_paise)}`,
        action: 'Chase',
        tone: 'r',
        go: () => router.push('/tabs/rent'),
      });
    }
    if (followups.data?.count) {
      out.push({
        text: `${followups.data.count} leads due for follow-up`,
        action: 'Open',
        tone: 'b',
        go: () => router.push('/tabs/leads'),
      });
    }
    if (data?.vacant_beds) {
      out.push({
        text: `${data.vacant_beds} beds free to fill`,
        action: 'Fill',
        tone: 'a',
        go: () => router.push('/tabs/rooms'),
      });
    }
    return out;
  }, [hasFinancials, overdue.data, followups.data, data?.vacant_beds, router]);

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
              cashflow.refetch();
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

        {/* Hero — the one number an owner opens the app for. */}
        {hasFinancials && data && (
          <LinearGradient
            colors={['#0e9384', '#0b6f64']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>
                NET PROFIT · {MONTHS[month - 1].toUpperCase()}
              </Text>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>
                  {marginPct >= 0 ? '▲' : '▼'} {Math.abs(marginPct)}%
                </Text>
              </View>
            </View>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {rupees(net)}
            </Text>
            <View style={styles.heroFoot}>
              <Text style={styles.heroFootText}>
                Received <Text style={styles.heroFootBold}>{lakh(received)}</Text>
              </Text>
              <Text style={styles.heroFootDot}>·</Text>
              <Text style={styles.heroFootText}>
                Spent <Text style={styles.heroFootBold}>{lakh(spent)}</Text>
              </Text>
              <Text style={styles.heroFootDot}>·</Text>
              <Text style={styles.heroFootText}>
                Margin <Text style={styles.heroFootBold}>{marginPct}%</Text>
              </Text>
            </View>
          </LinearGradient>
        )}

        {/* Headline KPIs — shown to every role. */}
        {summary.isLoading ? (
          <Loading />
        ) : (
          <Row gap={space.sm} style={{ marginBottom: space.md }}>
            <KpiTile
              label="Occupancy"
              value={`${occPct}%`}
              foot={`${occupied}/${totalBeds} beds${
                reservedCount ? ` · ${reservedCount} reserved` : ''
              } · ${data?.vacant_beds ?? 0} free`}
            >
              <View style={{ marginTop: 6 }}>
                <Track pct={occPct} color={colors.accent} />
              </View>
            </KpiTile>
            {hasFinancials ? (
              <KpiTile
                label="Collection"
                value={`${collectionPct}%`}
                foot={`${rupees(data?.collected_rent_paise ?? 0)} of ${rupees(
                  data?.expected_rent_paise ?? 0,
                )} billed`}
              >
                <View style={{ marginTop: 6 }}>
                  <Track
                    pct={collectionPct}
                    color={collectionPct >= 90 ? colors.success : colors.warn}
                  />
                </View>
              </KpiTile>
            ) : (
              <KpiTile
                label="Vacant beds"
                value={data?.vacant_beds ?? 0}
                foot="tap Rooms to fill"
              />
            )}
          </Row>
        )}

        {/* Today's tasks */}
        {tasks.length > 0 && (
          <Card style={styles.taskCard}>
            <View style={styles.taskHead}>
              <Text style={styles.taskTitle}>⚡ Today's tasks</Text>
              <Pill label={String(tasks.length)} tone="a" dot />
            </View>
            {tasks.map((task, i) => (
              <View
                key={task.text}
                style={{
                  ...styles.taskRow,
                  borderBottomWidth: i === tasks.length - 1 ? 0 : 1,
                }}
              >
                <View
                  style={{
                    ...styles.taskDot,
                    backgroundColor:
                      task.tone === 'r'
                        ? colors.danger
                        : task.tone === 'a'
                          ? colors.warn
                          : colors.info,
                  }}
                />
                <Text style={styles.taskText}>{task.text}</Text>
                <Button variant="secondary" size="sm" label={task.action} onPress={task.go} />
              </View>
            ))}
          </Card>
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
          <>
            <OperatingMetrics
              data={data}
              received={received}
              spent={spent}
              totalBeds={totalBeds}
              collectionPct={collectionPct}
              marginPct={marginPct}
              onOverdue={() => router.push('/tabs/rent')}
            />

            {trend.length > 1 && (
              <Section title="Money in · 6 months">
                <Card>
                  <Row justify="space-between" style={{ alignItems: 'flex-end' }}>
                    <Sparkline data={trend} color={colors.accent} width={140} height={44} />
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.trendLabel}>this period</Text>
                      <Text style={styles.trendValue}>{rupees(received)}</Text>
                    </View>
                  </Row>
                </Card>
              </Section>
            )}

            <Attribution data={data} />
          </>
        )}

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

// ── Operating metrics ───────────────────────────────────────────────────────

/**
 * The same six metrics as the web dashboard, in the same order. Each carries
 * its formula in the foot line — these are the numbers owners asked to have
 * spelled out rather than left as jargon.
 */
function OperatingMetrics({
  data,
  received,
  spent,
  totalBeds,
  collectionPct,
  marginPct,
  onOverdue,
}: {
  data: DashboardSummary;
  received: number;
  spent: number;
  totalBeds: number;
  collectionPct: number;
  marginPct: number;
  onOverdue: () => void;
}) {
  const tenants = data.total_tenants ?? 0;
  const avgRent = tenants > 0 ? Math.round((data.expected_rent_paise ?? 0) / tenants) : 0;
  const revPerBed = totalBeds > 0 ? Math.round(received / totalBeds) : 0;
  const expenseRatio = received > 0 ? Math.round((spent / received) * 100) : 0;

  const tiles: { label: string; value: string; foot: string; tone?: 'danger' }[] = [
    {
      label: 'Avg rent / tenant',
      value: tenants > 0 ? rupees(avgRent) : '—',
      foot: `billed ÷ ${tenants} tenants`,
    },
    {
      label: 'Revenue / bed',
      value: totalBeds > 0 ? rupees(revPerBed) : '—',
      foot: `all money in ÷ ${totalBeds} beds`,
    },
    {
      label: 'Collection rate',
      value: `${collectionPct}%`,
      foot: 'collected ÷ billed rent',
    },
    {
      label: 'Profit margin',
      value: `${marginPct}%`,
      foot: 'profit ÷ received',
    },
    {
      label: 'Expense ratio',
      value: received > 0 ? `${expenseRatio}%` : '—',
      foot: 'spent ÷ received · lower is better',
    },
    {
      label: 'Overdue tenants',
      value: String(data.overdue_tenants ?? 0),
      foot: data.overdue_tenants > 0 ? 'tap to follow up →' : 'all clear',
      tone: data.overdue_tenants > 0 ? 'danger' : undefined,
    },
  ];

  return (
    <Section title="Operating metrics">
      <View style={{ gap: space.sm }}>
        {[0, 2, 4].map((start) => (
          <Row key={start} gap={space.sm}>
            {tiles.slice(start, start + 2).map((tile) => (
              <KpiTile
                key={tile.label}
                label={tile.label}
                value={tile.value}
                foot={tile.foot}
                tone={tile.tone}
              />
            ))}
          </Row>
        ))}
      </View>
      {data.overdue_tenants > 0 && (
        <Button
          variant="ghost"
          size="sm"
          label="Open Rent & Payments"
          iconName="arrow-forward"
          onPress={onOverdue}
          style={{ marginTop: space.sm }}
        />
      )}
    </Section>
  );
}

// ── Attribution ─────────────────────────────────────────────────────────────

function Attribution({ data }: { data: DashboardSummary }) {
  // These are arrays of {person, total_paise, count} — NOT name→amount maps.
  const cashInBy = [...(data.cash_in_by_person ?? [])].sort(
    (a, b) => b.total_paise - a.total_paise,
  );
  const spentBy = [...(data.expenses_by_person ?? [])].sort(
    (a, b) => b.total_paise - a.total_paise,
  );
  const owners = data.owner_profits ?? [];
  if (!cashInBy.length && !spentBy.length && !owners.length) return null;

  const toRows = (
    entries: { person: string; total_paise: number; count: number }[],
    color: string,
  ) => {
    const max = Math.max(...entries.map((e) => e.total_paise), 1);
    return entries.map((e) => ({
      label: e.person,
      sub: `${e.count} ${e.count === 1 ? 'txn' : 'txns'}`,
      value: rupees(e.total_paise),
      pct: (e.total_paise / max) * 100,
      color,
    }));
  };

  return (
    <>
      {cashInBy.length > 0 && (
        <Section title="Cash-in by person">
          <Card>
            <RankBars rows={toRows(cashInBy, colors.success)} />
          </Card>
        </Section>
      )}
      {spentBy.length > 0 && (
        <Section title="Spend by person">
          <Card>
            <RankBars rows={toRows(spentBy, colors.warn)} />
          </Card>
        </Section>
      )}
      {owners.length > 0 && (
        <Section title="Owner profit split">
          <Card>
            <RankBars
              rows={owners.map((o) => ({
                label: o.name,
                sub: `${o.share_pct}%`,
                value: rupees(o.share_paise),
                pct: o.share_pct,
                color: colors.info,
              }))}
            />
          </Card>
        </Section>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 18,
    padding: 14,
    marginBottom: space.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { color: '#ffffff', opacity: 0.9, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  heroChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  heroChipText: { color: '#ffffff', fontSize: 10.5, fontWeight: '800' },
  heroValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 4,
  },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' },
  heroFootText: { color: '#ffffff', opacity: 0.95, fontSize: 11 },
  heroFootBold: { fontWeight: '800' },
  heroFootDot: { color: '#ffffff', opacity: 0.55, fontSize: 11 },

  taskCard: {
    marginBottom: space.md,
    borderColor: colors.warnLine,
    backgroundColor: '#fffdf6',
  },
  taskHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  taskTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 9,
    borderBottomColor: colors.borderSoft,
  },
  taskDot: { width: 6, height: 6, borderRadius: 3 },
  taskText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.text },

  trendLabel: { fontSize: 11, color: colors.textDim, fontWeight: '600' },
  trendValue: { fontSize: 15, fontWeight: '800', color: colors.text },

  note: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
});
