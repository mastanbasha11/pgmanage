/**
 * Rent & Payments. Monthly ledger for the selected property; tap a row to
 * record a payment for that tenant/month/year.
 *
 * Deliberately ABSENT: the receivables-aging card. The web app removed it —
 * on a fiscal month that closes on the settlement day, buckets past ~45 days
 * are almost always empty, so the card was mostly whitespace. Overdue is
 * surfaced as a count on the Outstanding KPI instead.
 *
 * "Avg days to collect" replaces the old "DSO / on-time" label — same maths,
 * a name a PG owner can actually read.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import {
  Card,
  Empty,
  Fab,
  Header,
  Loading,
  Screen,
  Segmented,
  rupees,
  formatDateHuman,
} from '../../components/ui';
import { KpiTile, Pill, RankBars, RoomBadge, Track } from '../../components/redesign';
import {
  useRentLedger,
  type RentLedgerRow,
  type RentLedgerTransaction,
} from '../../lib/hooks/rent';
import {
  avgDaysToCollect,
  countByStatus,
  filterByStatus,
  type LedgerFilter,
} from '../../lib/ledger-filter';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type StatusFilter = LedgerFilter;
type TabKey = 'LEDGER' | 'PAYMENTS' | 'REFUNDS';

/**
 * Compose a wa.me deep-link with the overdue-reminder message pre-filled.
 * Client-side text, not a Meta template call, so the collector reviews it
 * before tapping Send.
 */
function buildOverdueWhatsappUrl(e: RentLedgerRow, monthLabel: string): string {
  const phone = (e.phone ?? '').replace(/\D/g, '');
  const rupeesFmt = Math.round(e.outstanding_paise / 100).toLocaleString('en-IN');
  const msg =
    `Hi ${e.tenant_name.trim()}, a friendly reminder that your rent for ${monthLabel} is ` +
    `still outstanding — ₹${rupeesFmt}. Please clear it at the earliest. Thanks!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export default function RentTab() {
  const { selectedPropertyId, voiceGuidance } = useAppStore();
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [tab, setTab] = useState<TabKey>('LEDGER');

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.rent'));
  }, [voiceGuidance]);

  const ledger = useRentLedger({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
  });

  const rows = ledger.data?.items ?? [];
  const stats = ledger.data?.stats;
  const period = ledger.data?.period;
  const collectors = ledger.data?.collectors ?? [];
  const transactions = ledger.data?.transactions ?? [];

  const counts = useMemo(() => countByStatus(rows), [rows]);

  const visible = filterByStatus<RentLedgerRow>(rows, filter);

  const { avgDays, paidCount } = useMemo(
    () => avgDaysToCollect(rows, period?.start),
    [rows, period?.start],
  );

  const overdueCount = counts.UNPAID + counts.PARTIAL;
  const collectionPct = Math.round(stats?.collection_rate ?? 0);

  const payments = transactions.filter((x) => x.payment_type !== 'REFUND');
  const refunds = transactions.filter((x) => x.payment_type === 'REFUND');

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header
          title="Rent & Payments"
          subtitle={
            period
              ? `${MONTHS[month - 1]} ${year} · ${formatDateHuman(period.start)} – ${formatDateHuman(
                  period.end,
                )}`
              : `${MONTHS[month - 1]} ${year}`
          }
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: space.xs, paddingVertical: space.sm }}>
            {MONTHS.map((m, i) => (
              <Pressable
                key={m}
                style={{ ...styles.chip, ...(month === i + 1 ? styles.chipActive : null) }}
                onPress={() => setMonth(i + 1)}
                accessibilityRole="button"
                accessibilityState={{ selected: month === i + 1 }}
              >
                <Text
                  style={{
                    ...styles.chipText,
                    ...(month === i + 1 ? styles.chipTextActive : null),
                  }}
                >
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {ledger.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={tab === 'LEDGER' ? visible : []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: 0 }}
          refreshControl={
            <RefreshControl
              refreshing={ledger.isRefetching}
              onRefresh={ledger.refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListHeaderComponent={
            <View>
              {/* Four headline KPIs — no aging card, by design. */}
              <View style={{ gap: space.sm, marginBottom: space.md }}>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <KpiTile
                    label="Expected"
                    value={rupees(stats?.expected_paise ?? 0)}
                    foot={`${rows.length} tenants billed`}
                  />
                  <KpiTile
                    label="Collected"
                    value={rupees(stats?.collected_in_period_paise ?? 0)}
                    foot={`${collectionPct}% of billed`}
                  >
                    <View style={{ marginTop: 6 }}>
                      <Track
                        pct={collectionPct}
                        color={collectionPct >= 90 ? colors.success : colors.warn}
                      />
                    </View>
                  </KpiTile>
                </View>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <KpiTile
                    label="Outstanding"
                    value={rupees(stats?.outstanding_paise ?? 0)}
                    foot={overdueCount > 0 ? `${overdueCount} tenants pending` : 'all clear'}
                    tone={(stats?.outstanding_paise ?? 0) > 0 ? 'danger' : undefined}
                  />
                  <KpiTile
                    label="Avg days to collect"
                    value={avgDays != null ? `${avgDays.toFixed(1)} days` : '—'}
                    foot={
                      paidCount > 0
                        ? `across ${paidCount} payments`
                        : 'no payments yet this period'
                    }
                  />
                </View>
              </View>

              {/* Also received this period */}
              <Text style={styles.sectionTitle}>Also received this period</Text>
              <Text style={styles.sectionSub}>
                Everything besides this month's rent that moved through the till.
              </Text>
              <View style={styles.alsoGrid}>
                {[
                  { label: 'Advances', value: stats?.advance_received_paise ?? 0, c: '#1baf7a' },
                  { label: 'Daily stays', value: stats?.daily_stays_paise ?? 0, c: '#eda100' },
                  { label: 'Power meters', value: stats?.power_received_paise ?? 0, c: '#eb6834' },
                  { label: 'Opening balance', value: stats?.opening_balance_paise ?? 0, c: '#98a0ad' },
                  {
                    label: 'Refunds given',
                    value: -(stats?.refunds_given_paise ?? 0),
                    c: '#dc2626',
                    neg: (stats?.refunds_given_paise ?? 0) > 0,
                  },
                  {
                    label: 'Discounts',
                    value: -(stats?.discount_paise ?? 0),
                    c: '#b45309',
                    neg: (stats?.discount_paise ?? 0) > 0,
                  },
                ].map((m) => (
                  <View key={m.label} style={styles.alsoTile}>
                    <View style={styles.alsoTop}>
                      <Text style={styles.alsoLabel} numberOfLines={1}>
                        {m.label}
                      </Text>
                      <View style={{ ...styles.alsoDot, backgroundColor: m.c }} />
                    </View>
                    <Text
                      style={{
                        ...styles.alsoValue,
                        ...(m.neg ? { color: colors.danger } : null),
                      }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {rupees(m.value)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Collected by — full width so the "N payments · adv ₹X" line fits */}
              {collectors.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>
                    💵 Collected by · {MONTHS[month - 1]} {year}
                  </Text>
                  <Card style={{ marginBottom: space.md }}>
                    <RankBars
                      labelWidth={104}
                      rows={collectors.map((c) => {
                        const max = Math.max(...collectors.map((x) => x.total_paise), 1);
                        return {
                          label: c.collector,
                          sub: `${c.payments} payments${
                            c.advance_paise > 0 ? ` · adv ${rupees(c.advance_paise)}` : ''
                          }`,
                          value: rupees(c.total_paise),
                          pct: (c.total_paise / max) * 100,
                          color: colors.accent,
                        };
                      })}
                    />
                  </Card>
                </>
              )}

              <Segmented<TabKey>
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'LEDGER', label: `Ledger (${rows.length})` },
                  { value: 'PAYMENTS', label: `Payments (${payments.length})` },
                  { value: 'REFUNDS', label: `Refunds (${refunds.length})` },
                ]}
              />
              <View style={{ height: space.md }} />

              {tab === 'LEDGER' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: space.xs, paddingBottom: space.sm }}>
                    {(['ALL', 'UNPAID', 'PARTIAL', 'PAID'] as const).map((f) => {
                      const active = filter === f;
                      return (
                        <Pressable
                          key={f}
                          onPress={() => setFilter(f)}
                          style={{
                            ...styles.statusChip,
                            ...(active ? styles.statusChipActive : null),
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text
                            style={{
                              ...styles.statusChipText,
                              ...(active ? styles.statusChipTextActive : null),
                            }}
                          >
                            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()} (
                            {counts[f]})
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {tab !== 'LEDGER' && (
                <TransactionList items={tab === 'PAYMENTS' ? payments : refunds} />
              )}
            </View>
          }
          renderItem={({ item }) => {
            const canWhatsapp = item.status !== 'PAID' && !!item.phone;
            const monthLabel = `${MONTHS[item.month - 1]} ${item.year}`;
            const tone = item.status === 'PAID' ? 'g' : item.status === 'PARTIAL' ? 'a' : 'r';
            return (
              <Card
                style={styles.entry}
                onPress={() =>
                  router.push({
                    pathname: '/payments/new',
                    params: { tenant_id: item.tenant_id, name: item.tenant_name },
                  })
                }
              >
                <RoomBadge
                  room={item.room_number || '—'}
                  sub={item.bed_label ? `·${item.bed_label}` : undefined}
                  tone={tone}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.tenantName} numberOfLines={1}>
                    {item.tenant_name}
                  </Text>
                  <Text style={styles.due} numberOfLines={1}>
                    Due {rupees(item.amount_due_paise)}
                    {item.paid_on ? ` · paid ${formatDateHuman(item.paid_on)}` : ''}
                  </Text>
                  {!!item.collected_by?.length && (
                    <Text style={styles.collectedBy} numberOfLines={1}>
                      via {item.collected_by.join(', ')}
                    </Text>
                  )}
                </View>
                {canWhatsapp && (
                  <Pressable
                    accessibilityLabel={`Message ${item.tenant_name} on WhatsApp`}
                    hitSlop={8}
                    style={styles.waButton}
                    onPress={(ev) => {
                      ev.stopPropagation();
                      Linking.openURL(buildOverdueWhatsappUrl(item, monthLabel)).catch(() => {});
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                  </Pressable>
                )}
                <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                  <Pill label={item.status} tone={tone} dot />
                  {item.status !== 'PAID' && (
                    <Text style={styles.outstanding}>{rupees(item.outstanding_paise)}</Text>
                  )}
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            tab === 'LEDGER' ? (
              <Empty
                iconName="cash-outline"
                title={t('common.empty')}
                hint="Generate the ledger from the web app for this month."
              />
            ) : null
          }
        />
      )}
      <Fab
        name="add"
        accessibilityLabel="Record payment"
        onPress={() => router.push('/payments/new')}
      />
    </Screen>
  );
}

// ── Payments / Refunds tabs ─────────────────────────────────────────────────

function TransactionList({ items }: { items: RentLedgerTransaction[] }) {
  if (!items.length) {
    return <Empty iconName="receipt-outline" title="Nothing here yet" hint="No transactions in this period." />;
  }
  return (
    <View style={{ gap: space.sm }}>
      {items.map((x) => {
        const isRefund = x.payment_type === 'REFUND';
        return (
          <Card key={x.id} style={styles.txn}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.tenantName} numberOfLines={1}>
                {x.tenant_name || 'Unattributed'}
              </Text>
              <Text style={styles.due} numberOfLines={1}>
                {formatDateHuman(x.collected_at)} · {x.payment_mode}
                {x.paid_to ? ` · to ${x.paid_to}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: space.xs }}>
              <Text
                style={{
                  ...styles.txnAmount,
                  ...(isRefund ? { color: colors.danger } : null),
                }}
              >
                {isRefund ? '−' : ''}
                {rupees(x.amount_paise)}
              </Text>
              <Pill label={x.payment_type} tone={isRefund ? 'r' : 'b'} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    minWidth: 52,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.small, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.white },

  statusChip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textMuted },
  statusChipTextActive: { color: colors.white },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 11,
    color: colors.textDim,
    marginBottom: space.sm,
  },

  alsoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  alsoTile: {
    // Two per row with an 8px gutter.
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
  },
  alsoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alsoLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, flex: 1 },
  alsoDot: { width: 10, height: 10, borderRadius: 3 },
  alsoValue: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 3 },

  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  txn: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  txnAmount: { fontSize: fontSize.body, fontWeight: '800', color: colors.text },

  waButton: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successBg,
  },
  tenantName: { fontSize: fontSize.body, fontWeight: '800', color: colors.text },
  due: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  collectedBy: { fontSize: 10.5, color: colors.textDim, marginTop: 1 },
  outstanding: { fontSize: fontSize.body, fontWeight: '800', color: colors.danger },
});
