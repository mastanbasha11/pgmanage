/**
 * ROI — payback tracking + per-room-type earning power.
 *
 * OWNER/PARTNER only (enforced client-side here and server-side by
 * `_owner_only` on /dashboard/roi-by-room).
 *
 * Two views behind a Segmented control:
 *
 *   Payback — real data from GET /properties/{id}/payback-plan (unchanged
 *     source). Recovered / Tracking KPI tiles, an actual-vs-expected
 *     PaybackChart driven by `monthly_breakdown.cumulative_*_paise`, a
 *     catch-up pace card, and the original per-year ladder + monthly table +
 *     post-payback profit sections.
 *
 *   Rooms — GET /dashboard/roi-by-room (returns {months, rooms, room_types}).
 *     Room types ranked by revenue per bed per month, each with a
 *     fill-first / reprice verdict.
 *
 * All money is integer paise; charts convert to lakh (1L = 1e7 paise) only for
 * axis rendering.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Screen,
  Header,
  Card,
  Loading,
  Empty,
  Row,
  Section,
  Sheet,
  Field,
  MoneyField,
  DateField,
  Button,
  Segmented,
  Divider,
  IconButton,
  rupees,
} from '../../components/ui';
import {
  KpiTile,
  Legend,
  PaybackChart,
  Pill,
  RankBars,
  type PillTone,
} from '../../components/redesign';
import { useAppStore } from '../../lib/store';
import {
  usePaybackPlan,
  useRoiByRoom,
  useSavePaybackPlan,
  type PaybackPlan,
  type PaybackResult,
} from '../../lib/hooks/dashboard';
import { getApiError } from '../../lib/api';
import { colors, space, type as fontSize } from '../../lib/theme';

type View2 = 'PAYBACK' | 'ROOMS';

/** 1 lakh = ₹100,000 = 1e7 paise. */
const LAKH_PAISE = 10_000_000;
const toLakh = (paise: number) => paise / LAKH_PAISE;

interface RoomTypeRow {
  room_type: string;
  rooms: number;
  total_beds: number;
  occupied_beds: number;
  revenue_paise: number;
  capacity: number | null;
  revenue_per_bed_per_month_paise: number;
  occupancy_rate: number;
}

interface RoiByRoom {
  months: number;
  rooms: unknown[];
  room_types: RoomTypeRow[];
}

export default function RoiPage() {
  const router = useRouter();
  const { selectedPropertyId, canAccessFinancials } = useAppStore();
  const [editOpen, setEditOpen] = useState(false);
  const [view, setView] = useState<View2>('PAYBACK');

  useEffect(() => {
    if (!canAccessFinancials()) {
      Alert.alert('Not allowed', 'ROI is visible to owners only.');
      router.back();
    }
  }, [canAccessFinancials, router]);

  const plan = usePaybackPlan(selectedPropertyId ?? undefined);
  const p = plan.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header
          title="ROI"
          subtitle={p?.plan ? `${p.plan.lease_years}yr lease` : 'Payback plan'}
          onBack={() => router.back()}
          right={
            <IconButton
              name="create-outline"
              accessibilityLabel="Edit plan"
              onPress={() => setEditOpen(true)}
            />
          }
        />
        <Segmented<View2>
          value={view}
          onChange={setView}
          options={[
            { value: 'PAYBACK', label: 'Payback', iconName: 'trending-up-outline' },
            { value: 'ROOMS', label: 'Rooms', iconName: 'bed-outline' },
          ]}
        />
      </View>

      {view === 'ROOMS' ? (
        <RoomsView propertyId={selectedPropertyId ?? undefined} />
      ) : plan.isLoading ? (
        <Loading />
      ) : !p?.plan ? (
        <Empty
          title="No payback plan set"
          hint="Tap edit ✎ to set investment, horizon and hikes."
          iconName="analytics-outline"
          action={
            <Button
              label="Set up plan"
              onPress={() => setEditOpen(true)}
              style={{ marginTop: space.md }}
            />
          }
        />
      ) : (
        <PaybackView result={p} refreshing={plan.isRefetching} onRefresh={plan.refetch} />
      )}

      {editOpen && selectedPropertyId && (
        <PlanSheet
          propertyId={selectedPropertyId}
          initial={p?.plan}
          onClose={() => setEditOpen(false)}
        />
      )}
    </View>
  );
}

// ── Payback view ────────────────────────────────────────────────────────────

function PaybackView({
  result: p,
  refreshing,
  onRefresh,
}: {
  result: PaybackResult;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const plan = p.plan!;

  const chart = useMemo(() => {
    const rows = p.monthly_breakdown ?? [];
    const expected = rows.map((r) => toLakh(r.cumulative_expected_paise ?? 0));
    // Actual only runs up to the last month that has a recorded figure —
    // beyond that the green line must simply stop, not flatline at zero.
    let lastActual = -1;
    rows.forEach((r, i) => {
      if (r.actual_paise != null) lastActual = i;
    });
    const actual = rows.slice(0, lastActual + 1).map((r) => toLakh(r.cumulative_actual_paise ?? 0));
    return {
      actual,
      expected,
      todayIndex: Math.max(0, lastActual),
      monthsElapsed: lastActual + 1,
    };
  }, [p.monthly_breakdown]);

  const recovered = p.progress.actual_so_far_paise;
  const investment = plan.investment_paise;
  const recoveredPct = investment > 0 ? Math.round((recovered / investment) * 100) : 0;

  const shortfall = p.progress.expected_by_now_paise - recovered;
  const behind = shortfall > 0;

  // Catch-up pace: what's left, spread across the months still on the clock.
  const pace = useMemo(() => {
    const remaining = Math.max(0, investment - recovered);
    const monthsLeft = Math.max(1, plan.target_months - chart.monthsElapsed);
    const required = Math.round(remaining / monthsLeft);

    // Run-rate = mean of the last 3 recorded actuals, our best guess at what
    // this property currently produces in a month.
    const recent = (p.monthly_breakdown ?? [])
      .filter((r) => r.actual_paise != null)
      .slice(-3)
      .map((r) => r.actual_paise as number);
    const runRate = recent.length
      ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
      : 0;

    let verdict: { label: string; tone: PillTone };
    if (required === 0) verdict = { label: 'Already recovered', tone: 'g' };
    else if (runRate === 0) verdict = { label: 'No actuals yet', tone: 's' };
    else if (required <= runRate) verdict = { label: 'Achievable at current pace', tone: 'g' };
    else if (required <= runRate * 1.25) verdict = { label: 'Stretch — needs a push', tone: 'a' };
    else verdict = { label: 'Unlikely without a rent hike', tone: 'r' };

    return { remaining, monthsLeft, required, runRate, verdict };
  }, [investment, recovered, plan.target_months, chart.monthsElapsed, p.monthly_breakdown]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      {/* KPI tiles */}
      <Row gap={space.sm} align="stretch" style={{ marginBottom: space.md }}>
        <KpiTile
          label="Recovered"
          value={rupees(recovered)}
          foot={`of ${rupees(investment)} · ${recoveredPct}%`}
        />
        <KpiTile
          label="Tracking"
          value={behind ? `-${rupees(shortfall)}` : `+${rupees(-shortfall)}`}
          tone={behind ? 'danger' : undefined}
          foot={behind ? 'behind plan' : 'ahead of plan'}
        />
      </Row>

      <Text style={styles.trackingLabel}>{p.progress.tracking_label}</Text>

      {/* Chart */}
      <Section title="Actual vs expected">
        <Card style={styles.chartCard}>
          <PaybackChart
            actual={chart.actual}
            expected={chart.expected}
            targetLakh={toLakh(investment)}
            todayIndex={chart.todayIndex}
          />
          <Legend
            items={[
              { label: 'Actual', color: colors.success },
              { label: 'Expected', color: colors.info, dashed: true },
              { label: 'Gap', color: colors.dangerLine },
            ]}
          />
          <Text style={styles.chartFoot}>
            Cumulative recovery in lakh · target {rupees(investment)} over {plan.target_months} months
          </Text>
        </Card>
      </Section>

      {/* Catch-up pace */}
      <Section title="Catch-up pace">
        <Card>
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.paceValue}>{rupees(pace.required)}</Text>
              <Text style={styles.paceLabel}>
                per month × {pace.monthsLeft} month{pace.monthsLeft === 1 ? '' : 's'} left
              </Text>
            </View>
            <Pill label={pace.verdict.label} tone={pace.verdict.tone} dot />
          </Row>
          <View style={{ marginTop: space.md, gap: 6 }}>
            <Row justify="space-between">
              <Text style={styles.label}>Still to recover</Text>
              <Text style={styles.value}>{rupees(pace.remaining)}</Text>
            </Row>
            <Row justify="space-between">
              <Text style={styles.label}>Recent run-rate (3mo avg)</Text>
              <Text style={styles.value}>{pace.runRate ? rupees(pace.runRate) : '—'}</Text>
            </Row>
          </View>
        </Card>
      </Section>

      {/* Yearly summary */}
      {p.yearly_summary.length > 0 && (
        <Section title="Per-year plan">
          <Card>
            <Row justify="space-between" style={styles.headerRow}>
              <Text style={[styles.th, { flex: 1 }]}>Year</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Rent</Text>
              <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Monthly target</Text>
            </Row>
            <Divider />
            {p.yearly_summary.map((y) => (
              <Row key={y.year_index} justify="space-between" style={styles.tr}>
                <Text style={[styles.td, { flex: 1 }]}>{y.year_label}</Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>
                  {rupees(y.rent_paise)}
                </Text>
                <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '800' }]}>
                  {rupees(y.monthly_target_paise)}
                </Text>
              </Row>
            ))}
          </Card>
        </Section>
      )}

      {/* Monthly breakdown — last 12 for compactness */}
      {p.monthly_breakdown.length > 0 && (
        <Section title="Monthly breakdown (last 12)">
          <Card>
            <Row justify="space-between" style={styles.headerRow}>
              <Text style={[styles.th, { flex: 1 }]}>Month</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Expected</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Actual</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Δ</Text>
            </Row>
            <Divider />
            {p.monthly_breakdown.slice(-12).map((r, i) => (
              <Row key={`${r.year}-${r.month}-${i}`} justify="space-between" style={styles.tr}>
                <Text style={[styles.td, { flex: 1 }]}>
                  {r.month}/{r.year % 100}
                </Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>
                  {rupees(r.expected_paise)}
                </Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>
                  {r.actual_paise != null ? rupees(r.actual_paise) : '—'}
                </Text>
                <Text
                  style={[
                    styles.td,
                    {
                      flex: 1,
                      textAlign: 'right',
                      fontWeight: '700',
                      color:
                        r.delta_paise == null
                          ? colors.textDim
                          : r.delta_paise >= 0
                            ? colors.success
                            : colors.danger,
                    },
                  ]}
                >
                  {r.delta_paise != null ? rupees(r.delta_paise) : '—'}
                </Text>
              </Row>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Post-payback">
        <Card>
          <Row justify="space-between">
            <Text style={styles.label}>Monthly profit after payback</Text>
            <Text style={[styles.value, { color: colors.success, fontSize: fontSize.h3 }]}>
              {rupees(p.post_payback_monthly_profit_paise)}
            </Text>
          </Row>
        </Card>
      </Section>
    </ScrollView>
  );
}

// ── Rooms view ──────────────────────────────────────────────────────────────

/** Fill-first vs reprice: low occupancy is a demand problem, high occupancy on
 *  below-average yield is a pricing problem. */
function verdictFor(t: RoomTypeRow, avgYield: number): { label: string; tone: PillTone } {
  if (t.total_beds === 0) return { label: 'No beds', tone: 's' };
  if (t.occupancy_rate < 0.75) return { label: 'Fill first', tone: 'a' };
  if (t.revenue_per_bed_per_month_paise < avgYield * 0.9)
    return { label: 'Reprice up', tone: 'b' };
  return { label: 'Performing', tone: 'g' };
}

function RoomsView({ propertyId }: { propertyId?: string }) {
  const roi = useRoiByRoom({ property_id: propertyId });
  const data = roi.data as RoiByRoom | undefined;
  const types = useMemo(() => data?.room_types ?? [], [data]);

  const avgYield = useMemo(() => {
    if (!types.length) return 0;
    return Math.round(
      types.reduce((a, t) => a + (t.revenue_per_bed_per_month_paise || 0), 0) / types.length,
    );
  }, [types]);

  const max = useMemo(
    () => Math.max(1, ...types.map((t) => t.revenue_per_bed_per_month_paise || 0)),
    [types],
  );

  if (roi.isLoading) return <Loading />;
  if (!types.length) {
    return (
      <Empty
        title="No room revenue yet"
        hint="Once rent is collected against rooms, earning power per room type shows here."
        iconName="bed-outline"
      />
    );
  }

  const rows = types.map((t) => ({
    label: t.room_type,
    sub: `${t.total_beds} beds · ${Math.round((t.occupancy_rate ?? 0) * 100)}% full`,
    value: rupees(t.revenue_per_bed_per_month_paise),
    pct: ((t.revenue_per_bed_per_month_paise || 0) / max) * 100,
  }));

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={roi.isRefetching}
          onRefresh={roi.refetch}
          tintColor={colors.accent}
        />
      }
    >
      <Section title={`Revenue per bed / month · last ${data?.months ?? 6}mo`}>
        <Card>
          <RankBars rows={rows} labelWidth={104} />
        </Card>
      </Section>

      <Section title="What to do about it">
        <Card style={{ padding: 0 }}>
          {types.map((t, i) => {
            const v = verdictFor(t, avgYield);
            return (
              <View
                key={t.room_type}
                style={[styles.typeRow, i === types.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.typeName} numberOfLines={1}>
                    {t.room_type}
                  </Text>
                  <Text style={styles.typeMeta} numberOfLines={1}>
                    {t.rooms} room{t.rooms === 1 ? '' : 's'} · {t.occupied_beds}/{t.total_beds} beds
                    · {rupees(t.revenue_paise)} earned
                  </Text>
                </View>
                <Pill label={v.label} tone={v.tone} dot />
              </View>
            );
          })}
        </Card>
      </Section>
    </ScrollView>
  );
}

// ── Plan edit sheet ─────────────────────────────────────────────────────────

function PlanSheet({
  propertyId,
  initial,
  onClose,
}: {
  propertyId: string;
  initial?: PaybackPlan;
  onClose: () => void;
}) {
  const save = useSavePaybackPlan(propertyId);
  const [invest, setInvest] = useState(initial?.investment_paise ?? 0);
  const [target, setTarget] = useState(String(initial?.target_months ?? 24));
  const [grace, setGrace] = useState(String(initial?.grace_months ?? 3));
  const [rent, setRent] = useState(initial?.monthly_lessor_rent_paise ?? 0);
  const [startDate, setStartDate] = useState<string | null>(
    initial?.start_date ?? new Date().toISOString().slice(0, 10),
  );
  const [years, setYears] = useState(String(initial?.lease_years ?? 3));
  const [hikePct, setHikePct] = useState(String(initial?.annual_hike_pct ?? 5));
  const [useLadder, setUseLadder] = useState(!!(initial?.annual_hikes && initial.annual_hikes.length));
  const [ladder, setLadder] = useState<string[]>(() => {
    if (initial?.annual_hikes?.length) return initial.annual_hikes.map((n) => String(n));
    const n = Math.max(0, (initial?.lease_years ?? 3) - 1);
    return Array.from({ length: n }, () => String(initial?.annual_hike_pct ?? 5));
  });

  // Rebuild ladder when years changes and ladder is enabled.
  useEffect(() => {
    if (!useLadder) return;
    const n = Math.max(0, Number(years) - 1);
    setLadder((prev) => {
      const out = [...prev];
      while (out.length < n) out.push(hikePct);
      out.length = n;
      return out;
    });
  }, [years, hikePct, useLadder]);

  const submit = async () => {
    if (!invest || !rent) {
      Alert.alert('Missing', 'Investment and monthly rent are required.');
      return;
    }
    try {
      await save.mutateAsync({
        investment_paise: invest,
        target_months: Number(target) || 24,
        grace_months: Number(grace) || 0,
        monthly_lessor_rent_paise: rent,
        start_date: startDate ?? new Date().toISOString().slice(0, 10),
        lease_years: Number(years) || 3,
        annual_hike_pct: Number(hikePct) || 0,
        annual_hikes: useLadder ? ladder.map((v) => Number(v) || 0) : undefined,
      });
      onClose();
    } catch (e) {
      Alert.alert('Save failed', getApiError(e));
    }
  };

  return (
    <Sheet open onClose={onClose} title="Payback plan">
      <MoneyField label="Total investment" required valuePaise={invest} onChangeAmount={setInvest} />
      <Row gap={space.sm}>
        <Field
          label="Target (months)"
          required
          value={target}
          onChangeText={setTarget}
          keyboardType="number-pad"
          style={{ flex: 1 }}
        />
        <Field
          label="Grace (months)"
          value={grace}
          onChangeText={setGrace}
          keyboardType="number-pad"
          style={{ flex: 1 }}
        />
      </Row>
      <MoneyField label="Monthly lessor rent" required valuePaise={rent} onChangeAmount={setRent} />
      <DateField label="Start date" value={startDate} onChange={setStartDate} required />
      <Row gap={space.sm}>
        <Field
          label="Lease years"
          required
          value={years}
          onChangeText={setYears}
          keyboardType="number-pad"
          style={{ flex: 1 }}
        />
        <Field
          label="Annual hike %"
          value={hikePct}
          onChangeText={setHikePct}
          keyboardType="decimal-pad"
          style={{ flex: 1 }}
        />
      </Row>

      <Card
        onPress={() => setUseLadder(!useLadder)}
        style={{
          marginBottom: space.md,
          borderColor: useLadder ? colors.accent : colors.border,
          backgroundColor: useLadder ? colors.accentBg : colors.surface,
        }}
      >
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>
              Use a different hike each year
            </Text>
            <Text style={{ fontSize: fontSize.small, color: colors.textMuted }}>
              e.g. 5%, 5%, 6% across a 3-year lease
            </Text>
          </View>
          <Ionicons
            name={useLadder ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={useLadder ? colors.accent : colors.textDim}
          />
        </Row>
      </Card>

      {useLadder &&
        ladder.map((v, i) => (
          <Field
            key={i}
            label={`Year ${i + 2} hike %`}
            value={v}
            onChangeText={(t) => {
              const next = [...ladder];
              next[i] = t;
              setLadder(next);
            }}
            keyboardType="decimal-pad"
          />
        ))}

      <Button label="Save plan" onPress={submit} loading={save.isPending} block />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  trackingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: space.md,
  },

  chartCard: { padding: 13 },
  chartFoot: { fontSize: 10, color: colors.textDim, fontWeight: '600', marginTop: 8 },

  paceValue: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  paceLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 2 },

  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  typeName: { fontSize: 13, fontWeight: '800', color: colors.text },
  typeMeta: { fontSize: 10.5, fontWeight: '600', color: colors.textDim, marginTop: 2 },

  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: '700' },

  headerRow: { paddingVertical: 4 },
  th: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tr: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { fontSize: fontSize.small, color: colors.text, fontWeight: '600' },
});
