/**
 * Add Payment / Add Booking. One screen, two modes:
 *
 *   - Tenant payment  → POST /payments. Used for an existing resident:
 *       Rent / Advance / Deposit / Refund / Food / Other.
 *
 *   - New guest      → POST /bookings. Used for someone who isn't (yet)
 *       a tenant: Daily stay (walk-in) or Advance booking (future move-in).
 *       Required: guest name + room label + check-in date.
 *
 * Owners need both flows in one place because at the counter they capture
 * inbound money before deciding whether the guest will become a tenant.
 * Mirrors the split between web's AddPaymentDialog (/payments) and
 * BookingsPage (/bookings) but in one screen.
 *
 * OWNER / PARTNER / PROPERTY_MANAGER only (canRecordPayments gate).
 */
import { useEffect, useState } from 'react';
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
import {
  buildBookingBody,
  buildPaymentBody,
  showDays as helperShowDays,
  showMonthYear as helperShowMonthYear,
  showReference as helperShowReference,
  type BookingKind,
  type PaymentType,
  type PaymentMode as Mode,
} from '../../lib/payment-form';
import { useCreateBooking } from '../../lib/use-bookings';

type EntryMode = 'TENANT' | 'GUEST';

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  RENT: 'Rent',
  ADVANCE: 'Advance',
  DAILY: 'Daily stay',
  DEPOSIT: 'Deposit',
  REFUND: 'Refund',
  FOOD: 'Food',
  OTHER_CHARGE: 'Other',
};

const BOOKING_KIND_LABEL: Record<BookingKind, string> = {
  DAILY: 'Daily stay',
  ADVANCE: 'Advance booking',
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
    /** Set to "GUEST" to pre-select the booking mode from a quick action. */
    mode?: string;
  }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { selectedPropertyId, canRecordPayments } = useAppStore();

  // Owner / Partner / Property manager only.
  useEffect(() => {
    if (!canRecordPayments()) {
      Alert.alert(
        'Not allowed',
        'Only owners, partners, and property managers can record payments.',
      );
      router.back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mode pickers ──────────────────────────────────────────────────────────
  // Precedence: explicit ?mode=GUEST > pre-filled tenant_id > TENANT default.
  const [entryMode, setEntryMode] = useState<EntryMode>(
    params.mode === 'GUEST' ? 'GUEST' : 'TENANT',
  );

  // ── TENANT mode state ────────────────────────────────────────────────────
  const [type, setType] = useState<PaymentType>('RENT');
  const [tenantId, setTenantId] = useState(params.tenant_id ?? '');
  const [tenantName, setTenantName] = useState(params.name ?? '');
  const [tenantQuery, setTenantQuery] = useState('');

  // ── GUEST/booking mode state ─────────────────────────────────────────────
  const [bookingKind, setBookingKind] = useState<BookingKind>('DAILY');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [roomLabel, setRoomLabel] = useState('');
  const [checkInDate, setCheckInDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkOutDate, setCheckOutDate] = useState('');

  // ── Shared fields ────────────────────────────────────────────────────────
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<Mode>('CASH');
  const [paidTo, setPaidTo] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [forMonth, setForMonth] = useState(params.month ?? String(new Date().getMonth() + 1));
  const [forYear, setForYear] = useState(params.year ?? String(new Date().getFullYear()));
  const [forDays, setForDays] = useState('30');
  const [collectedOn, setCollectedOn] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Inline tenant search (TENANT mode only).
  const { data: tenantHits } = useQuery({
    queryKey: ['tenants-pick', selectedPropertyId, tenantQuery],
    enabled: entryMode === 'TENANT' && !tenantId && !!selectedPropertyId,
    queryFn: () =>
      api
        .get<{ items: TenantHit[] }>('/tenants', {
          params: { property_id: selectedPropertyId, search: tenantQuery || undefined, limit: 8 },
        })
        .then((r) => r.data),
  });

  const showMonthYear = helperShowMonthYear(type);
  const showDays = helperShowDays(type);
  const showReference = helperShowReference(mode);

  const payMutation = useMutation({
    mutationFn: (body: object) =>
      api.post('/payments', body, withIdempotency()).then((r) => r.data),
  });
  const bookingMutation = useCreateBooking();
  const isPending = payMutation.isPending || bookingMutation.isPending;

  async function submit() {
    const rupeesValue = Number(amount);
    if (!Number.isFinite(rupeesValue) || rupeesValue <= 0) {
      Alert.alert('Enter the amount');
      return;
    }

    try {
      if (entryMode === 'TENANT') {
        if (!tenantId) {
          Alert.alert('Pick a resident first');
          return;
        }
        const body = buildPaymentBody({
          tenantId,
          amountRupees: rupeesValue,
          type,
          mode,
          paidTo: paidTo || undefined,
          referenceNumber: referenceNumber || undefined,
          forMonth: Number(forMonth) || undefined,
          forYear: Number(forYear) || undefined,
          forDays: Number(forDays) || undefined,
          collectedOn,
          notes: notes || undefined,
        });
        await payMutation.mutateAsync(body);
      } else {
        if (!selectedPropertyId) {
          Alert.alert('Select a property first');
          return;
        }
        if (!guestName.trim()) {
          Alert.alert('Enter the guest name');
          return;
        }
        if (!roomLabel.trim()) {
          Alert.alert('Enter the room (e.g. 101-A)');
          return;
        }
        const body = buildBookingBody({
          propertyId: selectedPropertyId,
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim() || undefined,
          roomLabel: roomLabel.trim(),
          kind: bookingKind,
          amountRupees: rupeesValue,
          mode,
          paidTo: paidTo || undefined,
          referenceNumber: referenceNumber || undefined,
          checkInDate,
          checkOutDate: checkOutDate || undefined,
          collectedOn,
          notes: notes || undefined,
        });
        await bookingMutation.mutateAsync(body);
      }

      qc.invalidateQueries({ queryKey: ['rent-ledger-mobile'] });
      qc.invalidateQueries({ queryKey: ['resident-payments'] });
      qc.invalidateQueries({ queryKey: ['dash-summary'] });
      qc.invalidateQueries({ queryKey: ['bookings-mobile'] });

      const label =
        entryMode === 'TENANT' ? PAYMENT_TYPE_LABEL[type] : BOOKING_KIND_LABEL[bookingKind];
      const who = entryMode === 'TENANT' ? tenantName : guestName;

      Alert.alert(
        '✅ Recorded',
        `₹${amount} recorded as ${label} for ${who || 'guest'}.`,
        [
          { text: 'Share on WhatsApp', onPress: () => shareReceipt(who, rupeesValue, mode, label) },
          { text: 'Done', onPress: () => router.back() },
        ],
      );
    } catch (err) {
      Alert.alert('Error', getApiError(err));
    }
  }

  function shareReceipt(toName: string, amt: number, m: Mode, label: string) {
    const text = `✅ ${label} received: ₹${amt} via ${m} from ${toName}. — PGManage`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => null);
    router.back();
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <IconButton name="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
          <Header
            title={entryMode === 'TENANT' ? t('res.record_payment') : 'Add booking'}
            subtitle={
              entryMode === 'TENANT' ? tenantName || 'For an existing resident' : 'For a new guest'
            }
          />
        </View>

        {/* Mode picker — TENANT vs GUEST. The single biggest UX choice on
            this screen; everything else flows from this. */}
        <Card>
          <Text style={styles.sectionLabel}>This payment is for…</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <ModePill
              label="Existing resident"
              icon="person-outline"
              active={entryMode === 'TENANT'}
              onPress={() => setEntryMode('TENANT')}
            />
            <ModePill
              label="New guest"
              icon="bed-outline"
              active={entryMode === 'GUEST'}
              onPress={() => setEntryMode('GUEST')}
            />
          </View>
        </Card>

        {entryMode === 'TENANT' ? (
          <>
            <Card>
              <Text style={styles.sectionLabel}>Payment type</Text>
              <View style={styles.chipRow}>
                {(['RENT', 'ADVANCE', 'DAILY', 'DEPOSIT', 'REFUND', 'OTHER_CHARGE'] as const).map(
                  (opt) => {
                    const active = type === opt;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setType(opt)}
                        style={[styles.typeChip, active && styles.typeChipActive]}
                      >
                        <Text
                          style={[styles.typeChipText, active && styles.typeChipTextActive]}
                        >
                          {PAYMENT_TYPE_LABEL[opt]}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionLabel}>Resident</Text>
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
          </>
        ) : (
          <Card>
            <Text style={styles.sectionLabel}>Booking type</Text>
            <View style={styles.chipRow}>
              {(['DAILY', 'ADVANCE'] as const).map((opt) => {
                const active = bookingKind === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setBookingKind(opt)}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                  >
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                      {BOOKING_KIND_LABEL[opt]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: space.md }}>
              <Field label="Guest name" value={guestName} onChangeText={setGuestName} required />
              <Field
                label="Guest phone (optional)"
                value={guestPhone}
                onChangeText={setGuestPhone}
                keyboardType="phone-pad"
              />
              <Field
                label="Room (e.g. 101-A)"
                value={roomLabel}
                onChangeText={setRoomLabel}
                required
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={bookingKind === 'ADVANCE' ? 'Planned move-in' : 'Check-in'}
                    value={checkInDate}
                    onChangeText={setCheckInDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label={bookingKind === 'ADVANCE' ? 'Planned move-out' : 'Check-out'}
                    value={checkOutDate}
                    onChangeText={setCheckOutDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>
            </View>
          </Card>
        )}

        {/* Amount + period/days (TENANT only). */}
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
            {entryMode === 'TENANT' && showDays && (
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

          {entryMode === 'TENANT' && showMonthYear && (
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
          label={`Record${amount ? ` · ${rupees(Number(amount) * 100)}` : ''}`}
          onPress={submit}
          loading={isPending}
          block
        />
      </ScrollView>
    </Screen>
  );
}

function ModePill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modePill, active && styles.modePillActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon} size={18} color={active ? colors.white : colors.textMuted} />
      <Text style={[styles.modePillText, active && styles.modePillTextActive]}>{label}</Text>
    </Pressable>
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

  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modePillText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textMuted },
  modePillTextActive: { color: colors.white },

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
