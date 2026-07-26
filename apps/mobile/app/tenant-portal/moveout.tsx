/**
 * Move out — 30-day notice. Shows the deposit/advance refund estimate live
 * (advance stays refundable only with ≥30 days' notice), then submits the
 * notice. Dates are presets so there's no native date-picker dependency.
 */
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { colors, radius, space } from '../../lib/theme';
import {
  useTenantDues,
  useTenantDepositInfo,
  useTenantGiveNotice,
} from '../../lib/tenant/hooks';
import { TScreen, TAppBar, TCard, TButton, Cap, rupees } from '../../components/tenant-ui';

/** End-of-month date, `offset` months from now, as a local YYYY-MM-DD. */
function monthEnd(offset: number): { iso: string; label: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0); // day 0 = last day prev month
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return { iso, label };
}

function daysBetween(iso: string): number {
  const target = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export default function TenantMoveOut() {
  const router = useRouter();
  const dues = useTenantDues();
  const deposit = useTenantDepositInfo();
  const giveNotice = useTenantGiveNotice();

  const options = useMemo(() => [monthEnd(0), monthEnd(1), monthEnd(2)], []);
  const [choice, setChoice] = useState(0);
  const selected = options[choice];

  const days = daysBetween(selected.iso);
  const advanceRefundable = days >= 30;

  const depositHeld = deposit.data?.securityDepositPaise ?? 0;
  const advanceHeld = deposit.data?.advancePaidPaise ?? 0;
  const pendingDues =
    dues.data && dues.data.status !== 'paid' ? dues.data.totalPaise : 0;
  const refundAdvance = advanceRefundable ? advanceHeld : 0;
  const estimatedRefund = Math.max(0, depositHeld + refundAdvance - pendingDues);

  function submit() {
    giveNotice.mutate(
      { move_out_date: selected.iso },
      {
        onSuccess: (res) => {
          Alert.alert(
            'Notice submitted',
            `Move-out set for ${selected.label}.\n${res.days_notice} days' notice — advance is ${
              res.advance_refundable ? 'refundable' : 'non-refundable'
            }. Nothing is final until inspection.`,
            [{ text: 'OK', onPress: () => router.back() }],
          );
        },
        onError: () => Alert.alert('Could not submit', 'Please try again in a moment.'),
      },
    );
  }

  return (
    <TScreen>
      <TAppBar title="Move out" sub="30-day notice" onBack={() => router.back()} />

      <TCard variant="tint" style={{ marginTop: space.xs }}>
        <Text style={styles.note}>
          Give at least <Text style={styles.b}>30 days' notice</Text> to keep your advance
          refundable. You can talk to the manager first — nothing is final until you submit and
          the room is inspected.
        </Text>
      </TCard>

      <Cap>MOVE-OUT DATE</Cap>
      <View style={{ gap: space.sm }}>
        {options.map((o, i) => {
          const on = i === choice;
          const d = daysBetween(o.iso);
          return (
            <TouchableOpacity
              key={o.iso}
              style={[styles.opt, on && styles.optOn]}
              activeOpacity={0.8}
              onPress={() => setChoice(i)}
            >
              <View>
                <Text style={[styles.optLabel, on && { color: colors.forest }]}>{o.label}</Text>
                <Text style={styles.optSub}>{d} days from today</Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>
                {on && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Cap>DEPOSIT ESTIMATE</Cap>
      <TCard>
        {[
          ['Deposit held', depositHeld],
          ['Advance held', advanceHeld],
          ...(pendingDues > 0 ? [['Pending dues', -pendingDues] as [string, number]] : []),
          ...(!advanceRefundable && advanceHeld > 0
            ? [['Advance forfeited (<30d notice)', -advanceHeld] as [string, number]]
            : []),
        ].map(([label, amt]) => (
          <View key={label as string} style={styles.estRow}>
            <Text style={styles.estLabel}>{label}</Text>
            <Text style={[styles.estAmt, (amt as number) < 0 && { color: colors.danger }]}>
              {(amt as number) < 0 ? '−' : ''}
              {rupees(Math.abs(amt as number))}
            </Text>
          </View>
        ))}
        <View style={styles.estTotal}>
          <Text style={styles.estTotalLabel}>Estimated refund</Text>
          <Text style={styles.estTotalAmt}>{rupees(estimatedRefund)}</Text>
        </View>
        <Text style={styles.fine}>Final after room inspection · paid within 7 days of exit.</Text>
      </TCard>

      <TButton
        label={giveNotice.isPending ? 'Submitting…' : 'Submit notice'}
        variant="dark"
        style={{ marginTop: space.lg }}
        disabled={giveNotice.isPending}
        onPress={submit}
      />
      <Text style={styles.footer}>
        You can talk to the manager first — nothing is final until you submit.
      </Text>
    </TScreen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12.5, color: colors.textMuted, lineHeight: 19 },
  b: { fontWeight: '800', color: colors.text },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optOn: { borderColor: colors.forest, backgroundColor: colors.sage2 },
  optLabel: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  optSub: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.forest },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.forest },
  estRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  estLabel: { fontSize: 12.5, color: colors.textMuted },
  estAmt: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  estTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 11 },
  estTotalLabel: { fontSize: 13, fontWeight: '800', color: colors.text },
  estTotalAmt: { fontSize: 20, fontWeight: '800', color: colors.money, letterSpacing: -0.4 },
  fine: { fontSize: 11, color: colors.textDim, marginTop: 8 },
  footer: { fontSize: 11, color: colors.textDim, textAlign: 'center', marginTop: space.sm, lineHeight: 17 },
});
