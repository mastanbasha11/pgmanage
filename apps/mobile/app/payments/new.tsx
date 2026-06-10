/**
 * Add Payment screen. Matches the web AddPaymentDialog field-for-field so
 * an owner switching between web and phone gets the same flow:
 *
 *   - Type        (Rent / Advance / Daily Stay / Deposit / Refund / Other)
 *   - Tenant      inline search; live results from /tenants?search=
 *   - Amount      paise
 *   - Month/Year  defaults to current month
 *   - Days        only for DAILY type
 *   - Collected on  date picker; defaults to today
 *   - Mode        Cash / UPI / Bank
 *   - Paid to/by  free-text
 *   - Reference   only when mode != Cash
 *   - Notes
 *
 * Owner/Partner-only (RBAC). Other roles never see the screen.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { api, getApiError, withIdempotency } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { colors, radius, space, type as fontSize, TOUCH_TARGET } from '../../lib/theme';
import {
  Button,
  Card,
  Field,
  Header,
  IconButton,
  rupees,
  Screen,
} from '../../components/ui';

type PaymentType = 'RENT' | 'ADVANCE' | 'DAILY' | 'DEPOSIT' | 'REFUND' | 'FOOD' | 'OTHER_CHARGE';
type Mode = 'CASH' | 'UPI' | 'BANK';

const TYPE_LABEL: Record<PaymentType, string> = {
  RENT: 'Rent',
  ADVANCE: 'Advance',
  DAILY: 'Daily stay',
  DEPOSIT: 'Deposit',
  REFUND: 'Refund',
  FOOD: 'Food',
  OTHER_CHARGE: 'Other',
};

interface TenantHit {
  id: string;
  name: string;
  phone: string;
  room_number?: string;
  bed_label?: string;
}

export default function AddPaymentScreen() {
  const params = useLocalSearchParams<{
    tenant_id?: string;
    name?: string;
    month?: string;
    year?: string;
  }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { selectedPropertyId, canAccessFinancials } = useAppStore();

  // Owner-only guard — non-financial roles shouldn't even be on this route.
  useEffect(() => {
    if (!canAccessFinancials()) {
      Alert.alert('Not allowed', 'Only owners and partners can record payments.');
      router.back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [type, setType] = useState<PaymentType>('RENT');
  const [tenantId, setTenantId] = useState(params.tenant_id ?? '');
  const [tenantName, setTenantName] = useState(params.name ?? '');
  const [tenantQuery, setTenantQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<Mode>('CASH');
  const [paidTo, setPaidTo] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [forMonth, setForMonth] = useState(params.month ?? String(new Date().getMonth() + 1));
  const [forYear, setForYear] = useState(params.year ?? String(new Date().getFullYear()));
  const [forDays, setForDays] = useState('30');
  const [collectedOn, setCollectedOn] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // ── Inline tenant search ───────────────────────────────────────────────────
  const { data: tenantHits } = useQuery({
    queryKey: ['tenants-pick', selectedPropertyId, tenantQuery],
    enabled: !tenantId && !!selectedPropertyId,
    queryFn: () =>
      api
        .get<{ items: TenantHit[] }>('/tenants', {
          params: { property_id: selectedPropertyId, search: tenantQuery || undefined, limit: 8 },
        })
        .then((r) => r.data),
  });

  const showMonthYear = type === 'RENT' || type === 'FOOD' || type === 'OTHER_CHARGE';
  const showDays = type === 'DAILY';
  const showReference = mode !== 'CASH';

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (body: object) =>
      api.post('/payments', body, withIdempotency()).then((r) => r.data),
  });

  async function submit() {
    if (!tenantId) {
      Alert.alert('Pick a resident first');
      return;
    }
    const rupeesValue = Number(amount);
    if (!Number.isFinite(rupeesValue) || rupeesValue <= 0) {
      Alert.alert('Enter the amount');
      return;
    }
    try {
      // For DAILY type the backend expects payment_type=RENT with for_days.
      const payment_type = type === 'DAILY' ? 'RENT' : type;
      const body: Record<string, unknown> = {
        tenant_id: tenantId,
        amount_paise: Math.round(rupeesValue * 100),
        payment_type,
        payment_mode: mode,
        paid_to: paidTo || undefined,
        reference_number: showReference ? referenceNumber || undefined : undefined,
        collected_at: collectedOn,
        notes: notes || undefined,
      };
      if (showMonthYear) {
        body.for_month = Number(forMonth) || undefined;
        body.for_year = Number(forYear) || undefined;
      }
      if (showDays) body.for_days = Number(forDays) || undefined;

      await mutateAsync(body);

      qc.invalidateQueries({ queryKey: ['rent-ledger-mobile'] });
      qc.invalidateQueries({ queryKey: ['resident-payments', tenantId] });
      qc.invalidateQueries({ queryKey: ['dash-summary'] });

      Alert.alert(
        '✅ Payment recorded',
        `₹${amount} recorded as ${TYPE_LABEL[type]} for ${tenantName || 'resident'}.`,
        [
          {
            text: 'Share on WhatsApp',
            onPress: () => shareReceipt(tenantName, rupeesValue, mode, TYPE_LABEL[type]),
          },
          { text: 'Done', onPress: () => router.back() },
        ],
      );
    } catch (err) {
      Alert.alert('Error', getApiError(err));
    }
  }

  function shareReceipt(toName: string, amt: number, m: Mode, typeLabel: string) {
    const text = `✅ ${typeLabel} received: ₹${amt} via ${m} from ${toName}. — PGManage`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => null);
    router.back();
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <IconButton name="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
          <Header
            title={t('res.record_payment')}
            subtitle={tenantName || 'New payment'}
          />
        </View>

        {/* Type chips — same options as the web AddPaymentDialog. */}
        <Card>
          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.chipRow}>
            {(['RENT', 'ADVANCE', 'DAILY', 'DEPOSIT', 'REFUND', 'OTHER_CHARGE'] as const).map((opt) => {
              const active = type === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setType(opt)}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                >
                  <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                    {TYPE_LABEL[opt]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Inline tenant picker. If we landed with tenant_id pre-filled (from
            Resident detail / Rent ledger tap), show a compact card + Change. */}
        <Card>
          <Text style={styles.sectionLabel}>Tenant</Text>
          {tenantId ? (
            <View style={styles.tenantPickedRow}>
              <Ionicons name="person-circle-outline" size={28} color={colors.accent} />
              <Text style={styles.tenantPickedName} numberOfLines={1}>
                {tenantName || tenantId}
              </Text>
              <Pressable
                onPress={() => {
                  setTenantId('');
                  setTenantName('');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.changeLink}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Field
                label=""
                value={tenantQuery}
                onChangeText={setTenantQuery}
                placeholder="Search by name / phone / room…"
                autoFocus
                style={{ marginBottom: space.sm }}
              />
              <FlatList
                data={tenantHits?.items ?? []}
                keyExtractor={(tn) => tn.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setTenantId(item.id);
                      setTenantName(item.name);
                    }}
                    style={styles.hitRow}
                    android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hitName}>{item.name}</Text>
                      <Text style={styles.hitMeta}>
                        {item.phone}
                        {item.room_number ? ` · ${item.room_number}` : ''}
                        {item.bed_label ? `·${item.bed_label}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                  </Pressable>
                )}
                ListEmptyComponent={
                  tenantQuery ? (
                    <Text style={styles.hitEmpty}>No matches</Text>
                  ) : null
                }
              />
            </>
          )}
        </Card>

        {/* Amount + conditional Days. */}
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 2 }}>
              <Field
                label="Amount (₹)"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                required
              />
            </View>
            {showDays && (
              <View style={{ flex: 1 }}>
                <Field
                  label="Days"
                  value={forDays}
                  onChangeText={setForDays}
                  keyboardType="numeric"
                />
              </View>
            )}
          </View>

          {/* Period — only for type that have one. */}
          {showMonthYear && (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Month"
                  value={forMonth}
                  onChangeText={setForMonth}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Year"
                  value={forYear}
                  onChangeText={setForYear}
                  keyboardType="numeric"
                />
              </View>
            </View>
          )}

          <Field
            label="Collected on"
            value={collectedOn}
            onChangeText={setCollectedOn}
            placeholder="YYYY-MM-DD"
          />
        </Card>

        {/* Mode + paid-to/by + reference */}
        <Card>
          <Text style={styles.sectionLabel}>Mode</Text>
          <View style={[styles.chipRow, { marginBottom: space.md }]}>
            {(['CASH', 'UPI', 'BANK'] as const).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[styles.modeChip, active && styles.modeChipActive]}
                >
                  <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                    {m}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="Paid to / by"
            value={paidTo}
            onChangeText={setPaidTo}
            placeholder="Suresh, Owner, Manager…"
          />
          {showReference && (
            <Field
              label="Reference / UPI ref #"
              value={referenceNumber}
              onChangeText={setReferenceNumber}
              placeholder="UPI ref id / txn id"
            />
          )}
          <Field
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Daily stay 5 days"
          />
        </Card>

        <Button
          variant="primary"
          iconName="checkmark-circle-outline"
          label={`Record Payment${amount ? ` · ${rupees(Number(amount) * 100)}` : ''}`}
          onPress={submit}
          loading={isPending}
          block
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: space.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  typeChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: 'center',
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: fontSize.small, fontWeight: '700', color: colors.textMuted },
  typeChipTextActive: { color: colors.white },

  modeChip: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeChipText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textMuted },
  modeChipTextActive: { color: colors.white },

  tenantPickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
  },
  tenantPickedName: {
    flex: 1,
    fontSize: fontSize.bodyLg,
    fontWeight: '700',
    color: colors.text,
  },
  changeLink: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: fontSize.small,
    padding: space.xs,
  },

  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hitName: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  hitMeta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  hitEmpty: {
    textAlign: 'center',
    color: colors.textDim,
    padding: space.md,
    fontSize: fontSize.small,
  },
});
