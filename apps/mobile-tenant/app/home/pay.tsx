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

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space['3xl'] }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Hero rent card */}
        <Card variant="hero" style={{ marginTop: space.md }}>
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
              {dues.monthLabel}
            </Text>
            <Pill
              label={dues.status === 'paid' ? 'Paid' : dues.daysUntilDue < 0 ? 'Overdue' : 'Due'}
              tone={dues.status === 'paid' ? 'success' : dues.daysUntilDue < 0 ? 'danger' : 'warning'}
              size="sm"
            />
          </View>
          <Money paise={dues.totalPaise} size="hero" />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: space.xs }}>
            Due {format(parseISO(dues.dueDate), 'd MMM yyyy')}
            {' · '}
            {dues.daysUntilDue >= 0
              ? `${dues.daysUntilDue} day${dues.daysUntilDue === 1 ? '' : 's'} left`
              : `${Math.abs(dues.daysUntilDue)} days overdue`}
          </Text>

          {/* Wallet credit */}
          {profile.walletBalancePaise > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                marginTop: space.lg,
                padding: space.md,
                backgroundColor: colors.celebrationBg,
                borderRadius: 12,
              }}
            >
              <Ionicons name="wallet" size={20} color={colors.celebrationFg} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.celebrationFg,
                    fontSize: fontSize.small,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  Wallet credit available
                </Text>
                <Money paise={profile.walletBalancePaise} size="body" color={colors.celebrationFg} />
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
            <Pressable
              onPress={quickPay}
              style={{
                flex: 1,
                backgroundColor: colors.accent,
                borderRadius: 12,
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
                Pay {dues.status === 'paid' ? 'next month' : 'now'}
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* Itemized breakdown */}
        <SectionHeader title="Breakdown" subtitle="Tap a line to see how it's computed" />
        <Card style={{ padding: 0 }}>
          {dues.lines.map((line, i) => (
            <View key={`${line.kind}-${i}`}>
              <LineRow
                line={line}
                isExpanded={expandedLine === line.kind}
                onToggle={() =>
                  setExpandedLine((cur) => (cur === line.kind ? null : line.kind))
                }
              />
              {i < dues.lines.length - 1 ? (
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
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              padding: space.lg,
              borderTopWidth: 2,
              borderTopColor: colors.borderStrong,
            }}
          >
            <Text
              style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
            >
              Total
            </Text>
            <Money paise={dues.totalPaise} size="h3" />
          </View>
        </Card>

        {/* My Stay */}
        <SectionHeader title="My stay" />
        <Card>
          <StayRow label="Property" value={profile.property.name} />
          <StayRow
            label="Room"
            value={`${profile.room.roomNumber} · Bed ${profile.room.bedLabel}`}
          />
          <StayRow
            label="Sharing"
            value={
              profile.room.sharing === 'twin'
                ? 'Twin'
                : profile.room.sharing === 'single'
                  ? 'Single'
                  : profile.room.sharing === 'triple'
                    ? 'Triple'
                    : 'Quad'
            }
          />
          <StayRow
            label="Move-in"
            value={format(parseISO(profile.lease.startDate), 'd MMM yyyy')}
          />
          <StayRow
            label="Monthly rent"
            value={<Money paise={profile.lease.monthlyRentPaise} size="small" />}
          />
          <StayRow
            label="Deposit"
            value={<Money paise={profile.lease.depositPaise} size="small" />}
          />
        </Card>

        {/* Payment history */}
        <SectionHeader
          title="Payment history"
          actionLabel="See all"
          onAction={() => router.push('/payment-history')}
        />
        <Card style={{ padding: 0 }}>
          {payments.slice(0, 5).map((p, i) => (
            <View key={p.id}>
              <PaymentRow payment={p} />
              {i < Math.min(payments.length, 5) - 1 ? (
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

        {/* Ledger (past months) */}
        <SectionHeader title="Past months" />
        <Card style={{ padding: 0 }}>
          {ledger.map((entry, i) => (
            <View key={entry.id}>
              <LedgerRow entry={entry} />
              {i < ledger.length - 1 ? (
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
      <View style={{ padding: space.lg }}>
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
        padding: space.lg,
        gap: space.md,
      }}
    >
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
        <Ionicons name="checkmark" size={18} color={colors.successFg} />
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
        padding: space.lg,
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
