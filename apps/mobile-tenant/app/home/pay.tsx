/**
 * Pay tab — rent due + itemized breakdown + payment history + My Stay.
 *
 * The anti-Stanza differentiator: every charge has an explanation. Tap a
 * line item to expand to its computation (e.g. "12 units × ₹20.00"
 * inside Electricity).
 */
import { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import {
  Card,
  Money,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  SkeletonLines,
  toast,
} from '../../components/ui';
import {
  useDues,
  useLedger,
  usePayments,
  useProfile,
} from '../../lib/data/hooks';
import type { DueLine, LedgerEntry, Payment } from '../../lib/data/types';
import { useTheme } from '../../lib/theme';

export default function PayScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();

  const duesQ = useDues();
  const ledgerQ = useLedger();
  const paymentsQ = usePayments();
  const profileQ = useProfile();

  const [refreshing, setRefreshing] = useState(false);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);

  const dues = duesQ.data;
  const ledger = ledgerQ.data ?? [];
  const payments = paymentsQ.data ?? [];
  const profile = profileQ.data;

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([duesQ.refetch(), ledgerQ.refetch(), paymentsQ.refetch()]);
    setRefreshing(false);
  }

  function quickPay() {
    // Real UPI intent comes in v2 (the user-side OAuth + PSP integration
    // is non-trivial). For now confirm + celebrate.
    Alert.alert('Pay now', 'UPI integration coming soon. Tap continue to simulate.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: () => toast.success('Payment recorded'),
      },
    ]);
  }

  if (duesQ.isLoading || !dues || !profile) {
    return (
      <Screen scroll>
        <View style={{ marginTop: 24 }}>
          <SkeletonLines count={8} />
        </View>
      </Screen>
    );
  }

  const paid = dues.status === 'paid';
  const payLabel = paid ? 'Pay next month' : `Pay ₹${Math.round(dues.totalPaise / 100).toLocaleString('en-IN')}`;

  return (
    <Screen scroll={false}>
      {/* Header */}
      <View
        style={{
          paddingTop: 8,
          paddingBottom: 4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View>
          <Text style={{ color: colors.text, fontSize: fontSize.h2, fontWeight: fontWeight.extrabold }}>
            Payments
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
            {dues.monthLabel}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/payment-history')}
          accessibilityLabel="Payment history"
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="receipt-outline" size={18} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: space['3xl'] }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* This month — breakdown + total + pay */}
        <Card style={{ marginTop: space.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: space.sm,
            }}
          >
            <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}>
              This month
            </Text>
            <Pill label={paid ? 'paid' : 'unpaid'} tone={paid ? 'success' : 'warning'} size="sm" />
          </View>

          {dues.lines.map((line, i) => (
            <View
              key={`${line.kind}-${i}`}
              style={{ borderTopWidth: 1, borderTopColor: colors.border }}
            >
              <LineRow
                line={line}
                isExpanded={expandedLine === line.kind}
                onToggle={() => setExpandedLine((cur) => (cur === line.kind ? null : line.kind))}
              />
            </View>
          ))}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              paddingTop: space.md,
              marginTop: 2,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}>
              Total
            </Text>
            <Money paise={dues.totalPaise} size="h2" />
          </View>

          {profile.walletBalancePaise > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                marginTop: space.md,
                padding: space.md,
                backgroundColor: colors.accentSoft,
                borderRadius: 12,
              }}
            >
              <Ionicons name="wallet-outline" size={18} color={colors.accent} />
              <Text style={{ flex: 1, color: colors.accent, fontSize: fontSize.small, fontWeight: fontWeight.bold }}>
                Wallet credit ₹{Math.round(profile.walletBalancePaise / 100).toLocaleString('en-IN')} available
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={quickPay}
            style={{
              marginTop: space.md,
              backgroundColor: colors.accent,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: space.sm,
            }}
          >
            <Ionicons name="card-outline" size={18} color={colors.onAccent} />
            <Text style={{ color: colors.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold }}>
              {payLabel}
            </Text>
          </Pressable>
          <Text style={{ color: colors.textDim, fontSize: fontSize.caption, textAlign: 'center', marginTop: space.sm }}>
            UPI · card · netbanking · instant receipt
          </Text>
        </Card>

        {/* History — payments then past months */}
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 10,
            fontWeight: '800',
            letterSpacing: 1,
            marginTop: space.xl,
            marginBottom: space.sm,
          }}
        >
          HISTORY
        </Text>
        <Card style={{ padding: 0, paddingHorizontal: space.lg }}>
          {payments.slice(0, 5).map((p, i) => (
            <View
              key={p.id}
              style={{
                borderBottomWidth: i < payments.slice(0, 5).length - 1 || ledger.length > 0 ? 1 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <PaymentRow payment={p} />
            </View>
          ))}
          {ledger.map((entry, i) => (
            <View
              key={entry.id}
              style={{
                borderBottomWidth: i < ledger.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <LedgerRow entry={entry} />
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function LineRow({
  line,
  isExpanded,
  onToggle,
}: {
  line: DueLine;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  const expandable = line.expandable && line.items && line.items.length > 0;
  return (
    <Pressable onPress={expandable ? onToggle : undefined} pressScale={expandable ? 0.99 : 1}>
      <View style={{ paddingVertical: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.body,
                  fontWeight: fontWeight.semibold,
                }}
              >
                {line.label}
              </Text>
              {expandable ? (
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.textDim}
                />
              ) : null}
            </View>
            {line.explanation ? (
              <Text
                style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
              >
                {line.explanation}
              </Text>
            ) : null}
          </View>
          <Money paise={line.amountPaise} size="body" />
        </View>
        {isExpanded && line.items ? (
          <View style={{ marginTop: space.md, gap: space.xs }}>
            {line.items.map((item, i) => (
              <View
                key={i}
                style={{ flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>
                  · {item.label}
                </Text>
                <Money
                  paise={item.amountPaise}
                  size="small"
                  color={colors.textMuted}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function StayRow({ label, value }: { label: string; value: React.ReactNode }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: space.xs,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: fontSize.small, fontWeight: fontWeight.semibold }}>
        {typeof value === 'string' ? value : null}
      </Text>
      {typeof value !== 'string' ? value : null}
    </View>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: space.md,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="wallet-outline" size={17} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold }}
        >
          {payment.mode.toUpperCase()} · {format(parseISO(payment.date), 'd MMM yyyy')}
        </Text>
        <Text
          style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
          numberOfLines={1}
        >
          {payment.reference ?? 'Recorded payment'}
        </Text>
      </View>
      <Money paise={payment.amountPaise} size="body" weight="bold" />
    </View>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  const outstanding = entry.totalPaise - entry.paidPaise;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: space.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold }}
        >
          {monthName(entry.month)} {entry.year}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
          {entry.status === 'paid' && entry.paidOn
            ? `Paid on ${format(parseISO(entry.paidOn), 'd MMM')}`
            : `Outstanding ${outstanding > 0 ? '·' : ''}`}
        </Text>
      </View>
      {entry.status === 'paid' ? (
        <Pill label="Paid" tone="success" size="sm" />
      ) : (
        <Money paise={outstanding} size="body" />
      )}
    </View>
  );
}

function monthName(m: number): string {
  return [
    'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
  ][m - 1] ?? '';
}
