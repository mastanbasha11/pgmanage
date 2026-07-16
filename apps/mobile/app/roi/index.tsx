/**
 * ROI — payback plan view + edit (per-year hike ladder supported).
 *
 * OWNER/PARTNER only. Shows:
 *   - 4 summary tiles (investment, target months, monthly target Y1, grace)
 *   - Progress card (actual so far vs expected by now + tracking label)
 *   - Per-year rent + monthly target ladder
 *   - Monthly breakdown table with actuals (recent 12 rows)
 *   - Edit button → PlanSheet (investment / horizon / grace / start date /
 *     lease years / hike % ladder)
 */
import { useEffect, useState } from 'react';
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
  Chip,
  StatusPill,
  ConfirmDialog,
  Divider,
  IconButton,
  rupees,
} from '../../components/ui';
import { useAppStore } from '../../lib/store';
import {
  usePaybackPlan,
  useSavePaybackPlan,
  type PaybackPlan,
} from '../../lib/hooks/dashboard';
import { getApiError } from '../../lib/api';
import { colors, radius, space, type as fontSize } from '../../lib/theme';

export default function RoiPage() {
  const router = useRouter();
  const { selectedPropertyId, canAccessFinancials } = useAppStore();
  const [editOpen, setEditOpen] = useState(false);

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
      </View>

      {plan.isLoading ? (
        <Loading />
      ) : !p?.plan ? (
        <Empty
          title="No payback plan set"
          hint="Tap edit ✎ to set investment, horizon and hikes."
          iconName="analytics-outline"
          action={<Button label="Set up plan" onPress={() => setEditOpen(true)} style={{ marginTop: space.md }} />}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
          refreshControl={<RefreshControl refreshing={plan.isRefetching} onRefresh={plan.refetch} tintColor={colors.accent} />}
        >
          {/* Summary tiles */}
          <Row gap={space.sm} style={{ marginBottom: space.md }}>
            <SumBox label="Investment" value={rupees(p.plan.investment_paise)} tone="neutral" />
            <SumBox label="Target" value={`${p.plan.target_months}mo`} tone="info" />
          </Row>
          <Row gap={space.sm} style={{ marginBottom: space.md }}>
            <SumBox label="Grace target" value={rupees(p.grace_target_paise)} tone="warn" />
            <SumBox label="Y1 monthly" value={rupees(p.year1_regular_target_paise)} tone="success" />
          </Row>

          {/* Progress */}
          <Section title="Progress">
            <Card>
              <Row justify="space-between">
                <Text style={styles.label}>Actual so far</Text>
                <Text style={styles.value}>{rupees(p.progress.actual_so_far_paise)}</Text>
              </Row>
              <Row justify="space-between" style={{ marginTop: 6 }}>
                <Text style={styles.label}>Expected by now</Text>
                <Text style={styles.value}>{rupees(p.progress.expected_by_now_paise)}</Text>
              </Row>
              <View style={{ marginTop: space.md }}>
                <StatusPill
                  label={p.progress.tracking_label}
                  tone={
                    /ahead/i.test(p.progress.tracking_label)
                      ? 'success'
                      : /behind/i.test(p.progress.tracking_label)
                      ? 'warn'
                      : 'info'
                  }
                />
              </View>
            </Card>
          </Section>

          {/* Yearly summary */}
          {p.yearly_summary.length > 0 && (
            <Section title="Per-year plan">
              <Card>
                <Row justify="space-between" style={styles.headerRow}>
                  <Text style={styles.th}>Year</Text>
                  <Text style={styles.th}>Rent</Text>
                  <Text style={styles.th}>Monthly target</Text>
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
                  <Text style={styles.th}>Month</Text>
                  <Text style={styles.th}>Expected</Text>
                  <Text style={styles.th}>Actual</Text>
                  <Text style={styles.th}>Δ</Text>
                </Row>
                <Divider />
                {p.monthly_breakdown.slice(-12).map((r, i) => (
                  <Row key={`${r.year}-${r.month}-${i}`} justify="space-between" style={styles.tr}>
                    <Text style={[styles.td, { flex: 1 }]}>
                      {r.month}/{r.year % 100}
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>{rupees(r.expected_paise)}</Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>
                      {r.actual_paise != null ? rupees(r.actual_paise) : '—'}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        {
                          flex: 1,
                          textAlign: 'right',
                          color:
                            r.delta_paise == null
                              ? colors.textDim
                              : r.delta_paise >= 0
                              ? colors.success
                              : colors.danger,
                          fontWeight: '700',
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

function SumBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'info' | 'warn' | 'success';
}) {
  const toneMap = {
    neutral: { bg: colors.surface, fg: colors.text, border: colors.border },
    info: { bg: colors.infoBg, fg: colors.info, border: colors.info },
    warn: { bg: colors.warnBg, fg: colors.warn, border: colors.warn },
    success: { bg: colors.successBg, fg: colors.success, border: colors.success },
  }[tone];
  return (
    <View style={[styles.sum, { backgroundColor: toneMap.bg, borderColor: toneMap.border }]}>
      <Text style={[styles.sumValue, { color: toneMap.fg }]}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
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
  const [startDate, setStartDate] = useState<string | null>(initial?.start_date ?? new Date().toISOString().slice(0, 10));
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
        <Field label="Target (months)" required value={target} onChangeText={setTarget} keyboardType="number-pad" style={{ flex: 1 }} />
        <Field label="Grace (months)" value={grace} onChangeText={setGrace} keyboardType="number-pad" style={{ flex: 1 }} />
      </Row>
      <MoneyField label="Monthly lessor rent" required valuePaise={rent} onChangeAmount={setRent} />
      <DateField label="Start date" value={startDate} onChange={setStartDate} required />
      <Row gap={space.sm}>
        <Field label="Lease years" required value={years} onChangeText={setYears} keyboardType="number-pad" style={{ flex: 1 }} />
        <Field label="Annual hike %" value={hikePct} onChangeText={setHikePct} keyboardType="decimal-pad" style={{ flex: 1 }} />
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
            <Text style={{ fontWeight: '700', color: colors.text }}>Use a different hike each year</Text>
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

      {useLadder && ladder.map((v, i) => (
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
  sum: {
    flex: 1,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 0,
  },
  sumValue: { fontSize: fontSize.h2, fontWeight: '800' },
  sumLabel: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600', marginTop: 2 },

  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: '700' },

  headerRow: { paddingVertical: 4 },
  th: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  tr: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { fontSize: fontSize.small, color: colors.text, fontWeight: '600' },
});
