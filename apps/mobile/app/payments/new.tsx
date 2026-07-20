/**
 * Add Payment / Add Booking. One screen, two modes:
 *
 *   - Tenant payment  → POST /payments. Used for an existing resident:
 *       Rent / Advance / Daily / Deposit / Refund / Other.
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
 * Visual language: collector-first. Teal band → find the resident → one big
 * amount → mode → confirm. Everything optional is pushed below the fold.
 *
 * OWNER / PARTNER / PROPERTY_MANAGER only (canRecordPayments gate).
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  Avatar,
  Button,
  Card,
  Field,
  rupees,
  Screen,
} from '../../components/ui';
import { Pill } from '../../components/redesign';
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

/** 'Bank' here is the UI label; `mapPaymentModeForApi` in lib/payment-form.ts
 *  translates it to the BANK_TRANSFER enum member before the request goes out. */
const MODE_META: Array<{ value: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'UPI', label: 'UPI', icon: 'phone-portrait-outline' },
  { value: 'CASH', label: 'Cash', icon: 'cash-outline' },
  { value: 'BANK', label: 'Bank', icon: 'business-outline' },
];

interface TenantHit {
  id: string;
  name: string;
  phone: string;
  room_number?: string | null;
  bed_label?: string | null;
  outstanding_paise?: number | null;
  monthly_rent_paise?: number | null;
  rent_status?: string | null;
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
  const { selectedPropertyId, canRecordPayments, user } = useAppStore();

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
  /** Full row for the picked resident — drives the summary card + quick chips.
   *  Stays null on a deep link (?tenant_id=…), which only carries id + name. */
  const [picked, setPicked] = useState<TenantHit | null>(null);

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
  const [showMore, setShowMore] = useState(false);

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

  const amountPaise = Math.round((Number(amount) || 0) * 100);
  const outstandingPaise = picked?.outstanding_paise ?? 0;
  const monthlyRentPaise = picked?.monthly_rent_paise ?? 0;

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

  const confirmLabel = `✓ Confirm${amountPaise > 0 ? ` ${rupees(amountPaise)}` : ''} · ${
    MODE_META.find((m) => m.value === mode)?.label ?? mode
  }`;

  return (
    <Screen padded={false}>
      {/* Teal band — identity of the screen, and the mode switch lives in it
          so the very first decision is made before anything else renders. */}
      <View style={styles.band}>
        <View style={styles.bandTop}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={styles.bandBack}
          >
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.bandTitle} numberOfLines={1}>
              {entryMode === 'TENANT' ? t('res.record_payment') : 'Add booking'}
            </Text>
            <Text style={styles.bandSub} numberOfLines={1}>
              {entryMode === 'TENANT'
                ? tenantName || 'For an existing resident'
                : 'For a new guest'}
            </Text>
          </View>
        </View>

        <View style={styles.bandSwitch}>
          <BandTab
            label="Existing resident"
            icon="person-outline"
            active={entryMode === 'TENANT'}
            onPress={() => setEntryMode('TENANT')}
          />
          <BandTab
            label="New guest"
            icon="bed-outline"
            active={entryMode === 'GUEST'}
            onPress={() => setEntryMode('GUEST')}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        {entryMode === 'TENANT' ? (
          tenantId ? (
            <>
              {/* Picked resident — tinted so the eye lands here first. */}
              <View style={styles.tenantCard}>
                <Avatar name={tenantName || 'Resident'} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.tenantName} numberOfLines={1}>
                    {tenantName || tenantId}
                  </Text>
                  <View style={styles.tenantMetaRow}>
                    {!!picked?.room_number && (
                      <Text style={styles.tenantMeta} numberOfLines={1}>
                        {picked.room_number}
                        {picked.bed_label ? `·${picked.bed_label}` : ''}
                      </Text>
                    )}
                    {outstandingPaise > 0 ? (
                      <Pill label={`${rupees(outstandingPaise)} due`} tone="r" dot />
                    ) : picked ? (
                      <Pill label="No dues" tone="g" dot />
                    ) : null}
                  </View>
                </View>
                <Pressable
                  onPress={() => {
                    setTenantId('');
                    setTenantName('');
                    setPicked(null);
                  }}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.changeLink}>Change</Text>
                </Pressable>
              </View>

              {/* The amount. Deliberately the largest thing on the screen. */}
              <View style={styles.amountBlock}>
                <Text style={styles.amountCurrency}>₹</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textDim}
                  style={styles.amountInput}
                  accessibilityLabel="Amount in rupees"
                />
              </View>

              <View style={styles.quickRow}>
                {outstandingPaise > 0 && (
                  <QuickChip
                    label={`Full ${rupees(outstandingPaise)}`}
                    onPress={() => setAmount(String(Math.round(outstandingPaise / 100)))}
                  />
                )}
                {monthlyRentPaise > 0 && (
                  <QuickChip
                    label={`Rent ${rupees(monthlyRentPaise)}`}
                    onPress={() => setAmount(String(Math.round(monthlyRentPaise / 100)))}
                  />
                )}
                {!!amount && <QuickChip label="Clear" onPress={() => setAmount('')} />}
              </View>

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
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                            {PAYMENT_TYPE_LABEL[opt]}
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </View>

                {(showDays || showMonthYear) && (
                  <View style={{ marginTop: space.md }}>
                    {showDays && (
                      <Field
                        label="Days"
                        value={forDays}
                        onChangeText={setForDays}
                        keyboardType="numeric"
                      />
                    )}
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
                  </View>
                )}
              </Card>
            </>
          ) : (
            /* Nothing matters until a resident is chosen — so this is the
               only thing on screen when none is. */
            <Card>
              <Text style={styles.sectionLabel}>Who is paying?</Text>
              <Field
                label=""
                value={tenantQuery}
                onChangeText={setTenantQuery}
                placeholder="Search by name / phone / room…"
                autoFocus
                style={{ marginBottom: space.sm }}
              />
              {(tenantHits?.items ?? []).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setTenantId(item.id);
                    setTenantName(item.name);
                    setPicked(item);
                  }}
                  style={styles.hitRow}
                  android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                >
                  <Avatar name={item.name} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.hitName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.hitMeta} numberOfLines={1}>
                      {item.phone}
                      {item.room_number ? ` · ${item.room_number}` : ''}
                      {item.bed_label ? `·${item.bed_label}` : ''}
                    </Text>
                  </View>
                  {(item.outstanding_paise ?? 0) > 0 && (
                    <Pill label={rupees(item.outstanding_paise ?? 0)} tone="r" dot />
                  )}
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                </Pressable>
              ))}
              {!!tenantQuery && (tenantHits?.items ?? []).length === 0 && (
                <Text style={styles.hitEmpty}>No matches</Text>
              )}
            </Card>
          )
        ) : (
          <>
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
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
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

            <View style={styles.amountBlock}>
              <Text style={styles.amountCurrency}>₹</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textDim}
                style={styles.amountInput}
                accessibilityLabel="Amount in rupees"
              />
            </View>
          </>
        )}

        {/* Mode — three across, the only thing between amount and confirm. */}
        {(entryMode === 'GUEST' || !!tenantId) && (
          <>
            <View style={styles.modeRow}>
              {MODE_META.map((m) => {
                const active = mode === m.value;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => setMode(m.value)}
                    style={[styles.modeChip, active && styles.modeChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={m.icon}
                      size={18}
                      color={active ? colors.white : colors.textMuted}
                    />
                    <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Who is taking the money. Display-only — `paid_to` below is the
                field that actually rides along on the request. */}
            <View style={styles.collectedBy}>
              <Ionicons name="person-circle-outline" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.collectedByLabel}>Collected by</Text>
                <Text style={styles.collectedByName} numberOfLines={1}>
                  {user?.name ?? 'You'}
                </Text>
              </View>
              <Text style={styles.collectedByDate}>{collectedOn}</Text>
            </View>

            <Pressable
              onPress={() => setShowMore((v) => !v)}
              style={styles.moreToggle}
              accessibilityRole="button"
            >
              <Text style={styles.moreToggleText}>
                {showMore ? 'Hide details' : 'Reference, notes, date…'}
              </Text>
              <Ionicons
                name={showMore ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.accent}
              />
            </Pressable>

            {showMore && (
              <Card>
                <Field
                  label="Collected on"
                  value={collectedOn}
                  onChangeText={setCollectedOn}
                  placeholder="YYYY-MM-DD"
                />
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
            )}

            <Button
              variant="primary"
              label={confirmLabel}
              onPress={submit}
              loading={isPending}
              block
            />

            <Text style={styles.footnote}>
              Recorded against this property and written to the Audit log. You&apos;ll be offered a
              WhatsApp receipt to share once it saves.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function BandTab({
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
      style={[styles.bandTab, active && styles.bandTabActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon} size={16} color={active ? colors.accent : 'rgba(255,255,255,0.85)'} />
      <Text style={[styles.bandTabText, active && styles.bandTabTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.quickChip} accessibilityRole="button">
      <Text style={styles.quickChipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: colors.accent,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  bandTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bandBack: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.xs,
  },
  bandTitle: { fontSize: fontSize.h2, fontWeight: '800', color: colors.white },
  bandSub: { fontSize: fontSize.small, color: 'rgba(255,255,255,0.82)', marginTop: 1 },

  bandSwitch: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.md,
    padding: 3,
  },
  bandTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
  },
  bandTabActive: { backgroundColor: colors.white },
  bandTabText: { fontSize: fontSize.small, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  bandTabTextActive: { color: colors.accent },

  tenantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.accentBg,
    borderWidth: 1,
    borderColor: colors.accentDim,
    borderRadius: radius.lg,
    padding: space.md,
  },
  tenantName: { fontSize: fontSize.bodyLg, fontWeight: '800', color: colors.text },
  tenantMetaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 3 },
  tenantMeta: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' },
  changeLink: { color: colors.accentSoft, fontWeight: '800', fontSize: fontSize.small },

  amountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
  amountCurrency: { fontSize: 26, fontWeight: '800', color: colors.textMuted },
  amountInput: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
    minWidth: 120,
    maxWidth: '75%',
    textAlign: 'center',
    paddingVertical: 0,
  },

  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
  },
  quickChip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipText: { fontSize: fontSize.small, fontWeight: '700', color: colors.text },

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

  modeRow: { flexDirection: 'row', gap: space.sm },
  modeChip: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  modeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeChipText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textMuted },
  modeChipTextActive: { color: colors.white },

  collectedBy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  collectedByLabel: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
  collectedByName: { fontSize: fontSize.body, color: colors.text, fontWeight: '700' },
  collectedByDate: { fontSize: fontSize.caption, color: colors.textDim, fontWeight: '600' },

  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.sm,
  },
  moreToggleText: { fontSize: fontSize.small, fontWeight: '700', color: colors.accent },

  footnote: {
    fontSize: fontSize.caption,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 16,
  },

  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
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
