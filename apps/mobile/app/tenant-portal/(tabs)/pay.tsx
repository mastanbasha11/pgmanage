/**
 * Resident Pay — this month's dues, the itemised breakdown, and payment
 * history. Online checkout (Razorpay) runs on the responsive web portal, so
 * "Pay now" opens that in the browser; everything else is native + read-only.
 */
import { useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, space } from '../../../lib/theme';
import {
  useTenantDues,
  useTenantPayments,
  useTenantPaymentConfig,
} from '../../../lib/tenant/hooks';
import {
  TScreen,
  TAppBar,
  TCard,
  TButton,
  TPill,
  Cap,
  rupees,
} from '../../../components/tenant-ui';
import type { DueLine, Payment } from '../../../lib/tenant/types';

const WEB_PORTAL = 'https://pgmanage.in/portal';

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TenantPay() {
  const dues = useTenantDues();
  const payments = useTenantPayments();
  const config = useTenantPaymentConfig();
  const [expanded, setExpanded] = useState<string | null>(null);

  const d = dues.data;
  const online = config.data?.enabled ?? false;
  const paid = d?.status === 'paid';

  const statusTone = paid ? 'money' : 'warm';
  const statusLabel = paid
    ? 'Paid'
    : d && d.daysUntilDue < 0
      ? `Overdue ${Math.abs(d.daysUntilDue)}d`
      : d
        ? `Due ${fmtDate(d.dueDate)}`
        : '—';

  return (
    <TScreen>
      <TAppBar title="Pay" sub="Rent, breakdown & history" />

      {/* Hero */}
      <TCard style={{ marginTop: space.xs }}>
        <View style={styles.between}>
          <Text style={styles.month}>{d?.monthLabel ?? 'This month'}</Text>
          <TPill label={statusLabel} tone={statusTone} />
        </View>
        <Text style={styles.bigAmt}>{rupees(d?.totalPaise)}</Text>
        {!paid && d && (
          <Text style={styles.dueSub}>
            {d.daysUntilDue >= 0
              ? `${d.daysUntilDue} days to due date`
              : `${Math.abs(d.daysUntilDue)} days overdue`}
          </Text>
        )}

        {!paid && (
          online ? (
            <TButton
              label="Pay now"
              variant="dark"
              icon="lock-closed-outline"
              style={{ marginTop: space.md }}
              onPress={() => Linking.openURL(WEB_PORTAL)}
            />
          ) : (
            <Text style={styles.offNote}>
              Online payment isn't enabled for your PG yet. Please pay at the desk.
            </Text>
          )
        )}
        {paid && <Text style={styles.paidNote}>All settled for this month. 🌿</Text>}
      </TCard>

      {/* Breakdown */}
      {!!d?.lines?.length && (
        <>
          <Cap>BREAKDOWN</Cap>
          <TCard style={{ paddingVertical: 4 }}>
            {d.lines.map((l, i) => (
              <LineRow
                key={`${l.kind}-${i}`}
                line={l}
                open={expanded === l.kind}
                onToggle={() => setExpanded((c) => (c === l.kind ? null : l.kind))}
                last={i === d.lines.length - 1}
              />
            ))}
          </TCard>
        </>
      )}

      {/* History */}
      <Cap>PAYMENT HISTORY</Cap>
      <TCard style={{ paddingVertical: 4 }}>
        {(payments.data ?? []).length === 0 ? (
          <Text style={styles.empty}>No payments yet.</Text>
        ) : (
          (payments.data ?? []).map((p, i, arr) => (
            <PayRow key={p.id} p={p} last={i === arr.length - 1} />
          ))
        )}
      </TCard>
    </TScreen>
  );
}

function LineRow({
  line,
  open,
  onToggle,
  last,
}: {
  line: DueLine;
  open: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  const canExpand = line.expandable && (line.items?.length || line.explanation);
  return (
    <View style={[styles.lineWrap, last && !open && { borderBottomWidth: 0 }]}>
      <TouchableOpacity
        style={styles.lineRow}
        activeOpacity={canExpand ? 0.7 : 1}
        onPress={canExpand ? onToggle : undefined}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.lineLabel}>{line.label}</Text>
          {!!line.explanation && !open && (
            <Text style={styles.lineExpl} numberOfLines={1}>{line.explanation}</Text>
          )}
        </View>
        <Text style={styles.lineAmt}>{rupees(line.amountPaise)}</Text>
        {canExpand ? (
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={colors.textDim}
          />
        ) : null}
      </TouchableOpacity>
      {open && (
        <View style={styles.lineDetail}>
          {!!line.explanation && <Text style={styles.lineExplOpen}>{line.explanation}</Text>}
          {(line.items ?? []).map((it, j) => (
            <View key={j} style={styles.subItem}>
              <Text style={styles.subLabel}>{it.label}</Text>
              <Text style={styles.subAmt}>{rupees(it.amountPaise)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function PayRow({ p, last }: { p: Payment; last?: boolean }) {
  const ok = p.status === 'success';
  return (
    <View style={[styles.payRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.payIcon}>
        <Ionicons
          name={ok ? 'checkmark' : 'time-outline'}
          size={15}
          color={ok ? colors.money : colors.warn}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.payMode}>{p.mode.toUpperCase()}</Text>
        <Text style={styles.paySub}>{fmtDate(p.date)}</Text>
      </View>
      <Text style={styles.payAmt}>{rupees(p.amountPaise)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  bigAmt: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6, color: colors.text, marginTop: 6 },
  dueSub: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  offNote: { fontSize: 12, color: colors.textMuted, marginTop: space.md, lineHeight: 18 },
  paidNote: { fontSize: 12, color: colors.money, marginTop: space.sm, fontWeight: '700' },
  empty: { fontSize: 12.5, color: colors.textMuted, padding: 12 },
  lineWrap: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  lineLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  lineExpl: { fontSize: 11, color: colors.textDim, marginTop: 1 },
  lineAmt: { fontSize: 13, fontWeight: '800', color: colors.text },
  lineDetail: { paddingBottom: 11, paddingLeft: 2 },
  lineExplOpen: { fontSize: 11.5, color: colors.textMuted, marginBottom: 6 },
  subItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  subLabel: { fontSize: 12, color: colors.textMuted },
  subAmt: { fontSize: 12, fontWeight: '700', color: colors.text },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  payIcon: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.sage2,
    alignItems: 'center', justifyContent: 'center',
  },
  payMode: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  paySub: { fontSize: 11, color: colors.textDim, marginTop: 1 },
  payAmt: { fontSize: 13, fontWeight: '800', color: colors.text },
});
