/**
 * Check-in wizard — 5 steps:
 *   1. Personal      name · phone · email · ID · occupation
 *   2. Emergency     contact name · phone · relation
 *   3. Vehicle KYC   type · registration (required when non-NONE)
 *   4. Bed & Rent    pick vacant bed · monthly rent · security · advance
 *                    · non-refundable advance · food · billing day
 *   5. Review        submit
 *
 * Mirrors web CheckinWizard. Rent-plan totals shown in Review before submit.
 *
 * Layout: a teal band carries the step name + a segment-per-step progress bar,
 * each step's fields sit in white cards, and a fixed two-button footer
 * (Back / Next · <next step>) keeps the forward path in the same place on
 * every step.
 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Screen,
  Button,
  Card,
  Field,
  MoneyField,
  DateField,
  Select,
  Empty,
  Loading,
  Row,
  StatusPill,
  rupees,
} from '../../components/ui';
import { Pill } from '../../components/redesign';
import { useAppStore } from '../../lib/store';
import {
  useCheckin,
  type CheckinPayload,
} from '../../lib/hooks/tenants';
import { useVacantBeds } from '../../lib/hooks/properties';
import { getApiError } from '../../lib/api';
import { colors, radius, space, type as fontSize } from '../../lib/theme';

type StepKey = '1' | '2' | '3' | '4' | '5';

const STEPS: Array<{ key: StepKey; title: string; short: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: '1', title: 'Personal details', short: 'Personal', icon: 'person-outline' },
  { key: '2', title: 'Emergency contact', short: 'Emergency', icon: 'call-outline' },
  { key: '3', title: 'Vehicle KYC', short: 'Vehicle', icon: 'car-outline' },
  { key: '4', title: 'Bed & rent', short: 'Bed & rent', icon: 'bed-outline' },
  { key: '5', title: 'Review & confirm', short: 'Review', icon: 'checkmark-done-outline' },
];

const ID_TYPES: Array<{ value: 'AADHAR' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER'; label: string }> = [
  { value: 'AADHAR', label: 'Aadhaar' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
  { value: 'OTHER', label: 'Other' },
];

const VEHICLE_TYPES: Array<{ value: 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER'; label: string }> = [
  { value: 'NONE', label: 'No vehicle' },
  { value: 'TWO_WHEELER', label: '2-wheeler' },
  { value: 'FOUR_WHEELER', label: '4-wheeler' },
];

export default function CheckinPage() {
  const router = useRouter();
  const { bedId: prefBedId } = useLocalSearchParams<{ bedId?: string }>();
  const { selectedPropertyId } = useAppStore();
  const beds = useVacantBeds(selectedPropertyId ?? undefined, { includeUpcoming: false });
  const checkin = useCheckin();

  const [step, setStep] = useState<StepKey>('1');

  // Personal
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idType, setIdType] = useState<CheckinPayload['id_type']>('AADHAR');
  const [idNumber, setIdNumber] = useState('');
  const [occupation, setOccupation] = useState('');

  // Emergency
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecRelation, setEcRelation] = useState('');

  // Vehicle
  const [vehicleType, setVehicleType] = useState<'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER'>('NONE');
  const [vehicleReg, setVehicleReg] = useState('');

  // Bed & Rent
  const [bedId, setBedId] = useState<string | null>(prefBedId ?? null);
  const [moveInDate, setMoveInDate] = useState<string | null>(() => new Date().toISOString().slice(0, 10));
  const [expectedMoveOut, setExpectedMoveOut] = useState<string | null>(null);
  const [rentPaise, setRentPaise] = useState<number>(0);
  const [depositPaise, setDepositPaise] = useState<number>(0);
  const [advancePaise, setAdvancePaise] = useState<number>(0);
  const [nonRefPaise, setNonRefPaise] = useState<number>(0);
  const [foodIncluded, setFoodIncluded] = useState(false);
  const [foodPaise, setFoodPaise] = useState<number>(0);
  const [billingDay, setBillingDay] = useState('1');
  const [notes, setNotes] = useState('');

  const selectedBed = useMemo(
    () => beds.data?.items?.find((b) => b.id === bedId),
    [beds.data, bedId],
  );

  // Auto-fill rent from bed's base rent when a bed is picked.
  const onPickBed = (id: string) => {
    setBedId(id);
    const b = beds.data?.items?.find((x) => x.id === id);
    if (b && rentPaise === 0) setRentPaise(b.monthly_base_rent_paise);
  };

  const step1Valid = name.trim() && phone.trim() && idNumber.trim();
  const step2Valid = ecName.trim() && ecPhone.trim() && ecRelation.trim();
  const step3Valid = vehicleType === 'NONE' || vehicleReg.trim().length >= 4;
  const step4Valid = bedId && moveInDate && rentPaise > 0;

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const current = STEPS[stepIndex];
  const nextStep = STEPS[stepIndex + 1];
  const prevStep = STEPS[stepIndex - 1];

  const stepValid: Record<StepKey, boolean> = {
    '1': !!step1Valid,
    '2': !!step2Valid,
    '3': !!step3Valid,
    '4': !!step4Valid,
    '5': !!step4Valid,
  };

  const submit = async () => {
    if (!step4Valid || !bedId || !moveInDate) {
      Alert.alert('Missing required fields', 'Pick a bed, set move-in date and rent.');
      return;
    }
    try {
      const payload: CheckinPayload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        bed_id: bedId,
        id_type: idType,
        id_number: idNumber.trim(),
        emergency_contact_name: ecName.trim(),
        emergency_contact_phone: ecPhone.trim(),
        emergency_contact_relation: ecRelation.trim(),
        occupation: occupation.trim() || undefined,
        vehicle_type: vehicleType,
        vehicle_registration: vehicleType !== 'NONE' ? vehicleReg.trim().toUpperCase() : undefined,
        move_in_date: moveInDate,
        expected_move_out_date: expectedMoveOut || undefined,
        notes: notes.trim() || undefined,
        rent_plan: {
          monthly_rent_paise: rentPaise,
          security_deposit_paise: depositPaise,
          advance_paid_paise: advancePaise,
          non_refundable_advance_paise: nonRefPaise || undefined,
          food_included: foodIncluded,
          food_charges_paise: foodPaise,
          billing_day: Number(billingDay) || 1,
          effective_from: moveInDate,
        },
      };
      await checkin.mutateAsync(payload);
      Alert.alert('Checked in', `${name} added successfully.`, [
        { text: 'Done', onPress: () => router.replace('/tabs/tenants') },
      ]);
    } catch (e) {
      Alert.alert('Check-in failed', getApiError(e));
    }
  };

  return (
    <Screen padded={false}>
      {/* Teal band — step identity + progress. */}
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
              {current?.title ?? 'Check-in'}
            </Text>
            <Text style={styles.bandSub}>
              Step {stepIndex + 1} of {STEPS.length} · Add tenant
            </Text>
          </View>
          <View style={styles.bandIcon}>
            <Ionicons name={current?.icon ?? 'person-outline'} size={20} color={colors.white} />
          </View>
        </View>

        {/* One segment per step. Tappable backwards only — jumping forward
            would skip the per-step validation gates. */}
        <View style={styles.progress}>
          {STEPS.map((s, i) => {
            const done = i <= stepIndex;
            const reachable = i < stepIndex;
            return (
              <Pressable
                key={s.key}
                disabled={!reachable}
                onPress={() => setStep(s.key)}
                accessibilityRole="button"
                accessibilityLabel={`Step ${i + 1}: ${s.short}`}
                style={[styles.progressSeg, done && styles.progressSegOn]}
              />
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.lg, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        {step === '1' && (
          <Card>
            <Field label="Full name" required value={name} onChangeText={setName} placeholder="Ravi Kumar" autoCapitalize="words" />
            <Field label="Phone" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="9876543210" />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Select<'AADHAR' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER'>
              label="ID type"
              required
              value={idType}
              onChange={setIdType}
              options={ID_TYPES}
            />
            <Field label="ID number" required value={idNumber} onChangeText={setIdNumber} autoCapitalize="characters" />
            <Field label="Occupation" value={occupation} onChangeText={setOccupation} placeholder="Software engineer" style={{ marginBottom: 0 }} />
          </Card>
        )}

        {step === '2' && (
          <Card>
            <Text style={styles.cardHint}>Who do we call if something happens?</Text>
            <Field label="Contact name" required value={ecName} onChangeText={setEcName} placeholder="Parent, spouse, etc." autoCapitalize="words" />
            <Field label="Contact phone" required value={ecPhone} onChangeText={setEcPhone} keyboardType="phone-pad" />
            <Field label="Relation" required value={ecRelation} onChangeText={setEcRelation} placeholder="Father / Mother / Spouse" style={{ marginBottom: 0 }} />
          </Card>
        )}

        {step === '3' && (
          <Card>
            <Text style={styles.cardHint}>Required for parking allocation.</Text>
            <Select<'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER'>
              label="Vehicle type"
              required
              value={vehicleType}
              onChange={(v) => {
                setVehicleType(v);
                if (v === 'NONE') setVehicleReg('');
              }}
              options={VEHICLE_TYPES}
              style={vehicleType === 'NONE' ? { marginBottom: 0 } : undefined}
            />
            {vehicleType !== 'NONE' && (
              <Field
                label="Registration number"
                required
                value={vehicleReg}
                onChangeText={(t) => setVehicleReg(t.toUpperCase())}
                autoCapitalize="characters"
                placeholder="KA01AB1234"
                hint="Uppercase only. Minimum 4 characters."
                error={
                  vehicleReg.length > 0 && vehicleReg.trim().length < 4
                    ? 'Minimum 4 characters.'
                    : undefined
                }
                style={{ marginBottom: 0 }}
              />
            )}
          </Card>
        )}

        {step === '4' && (
          <>
            {beds.isLoading ? (
              <Loading />
            ) : (beds.data?.items?.length ?? 0) === 0 ? (
              <Empty title="No vacant beds" hint="Add rooms in Property Setup first." />
            ) : (
              <>
                <Card>
                  <Text style={styles.cardLabel}>Pick a vacant bed</Text>
                  {(beds.data?.items ?? []).map((b, i) => {
                    const on = b.id === bedId;
                    return (
                      <Pressable
                        key={b.id}
                        onPress={() => onPickBed(b.id)}
                        android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={{
                          ...styles.bedRow,
                          borderColor: on ? colors.accent : colors.border,
                          backgroundColor: on ? colors.accentBg : colors.surface,
                          marginBottom: i === (beds.data?.items?.length ?? 0) - 1 ? 0 : space.sm,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.bedTitle} numberOfLines={1}>
                            Room {b.room_number} · Bed {b.bed_label}
                          </Text>
                          <Text style={styles.bedMeta} numberOfLines={1}>
                            {b.floor_name} · {b.room_type ?? '—'} · {rupees(b.monthly_base_rent_paise)}/mo
                          </Text>
                        </View>
                        <Row gap={4}>
                          {b.has_ac && <StatusPill label="AC" tone="info" />}
                          {on && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
                        </Row>
                      </Pressable>
                    );
                  })}
                </Card>

                <Card>
                  <Text style={styles.cardLabel}>Dates</Text>
                  <DateField label="Move-in date" required value={moveInDate} onChange={setMoveInDate} />
                  <DateField
                    label="Expected move-out (optional)"
                    value={expectedMoveOut}
                    onChange={setExpectedMoveOut}
                    style={{ marginBottom: 0 }}
                  />
                </Card>

                <Card>
                  <Text style={styles.cardLabel}>Rent plan</Text>
                  <MoneyField label="Monthly rent" required valuePaise={rentPaise} onChangeAmount={setRentPaise} />
                  <Row gap={space.sm}>
                    <View style={{ flex: 1 }}>
                      <MoneyField label="Security deposit" valuePaise={depositPaise} onChangeAmount={setDepositPaise} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <MoneyField label="Advance (refundable)" valuePaise={advancePaise} onChangeAmount={setAdvancePaise} />
                    </View>
                  </Row>
                  <MoneyField
                    label="Non-refundable advance"
                    valuePaise={nonRefPaise}
                    onChangeAmount={setNonRefPaise}
                  />
                  <Field
                    label="Billing day (of month)"
                    value={billingDay}
                    onChangeText={setBillingDay}
                    keyboardType="number-pad"
                    hint="Day rent is due each month. Usually 1."
                    style={{ marginBottom: 0 }}
                  />
                </Card>

                <Card>
                  <Pressable
                    onPress={() => setFoodIncluded(!foodIncluded)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: foodIncluded }}
                    style={styles.toggleRow}
                  >
                    <Ionicons
                      name="restaurant-outline"
                      size={20}
                      color={foodIncluded ? colors.accent : colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleTitle}>Food included</Text>
                      <Text style={styles.toggleSub}>Tap to toggle</Text>
                    </View>
                    <Ionicons
                      name={foodIncluded ? 'checkmark-circle' : 'ellipse-outline'}
                      size={26}
                      color={foodIncluded ? colors.accent : colors.textDim}
                    />
                  </Pressable>
                  {foodIncluded && (
                    <View style={{ marginTop: space.md }}>
                      <MoneyField
                        label="Food charges (monthly)"
                        valuePaise={foodPaise}
                        onChangeAmount={setFoodPaise}
                        style={{ marginBottom: 0 }}
                      />
                    </View>
                  )}
                </Card>

                <Card>
                  <Field
                    label="Notes"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Anything to remember"
                    style={{ marginBottom: 0 }}
                  />
                </Card>
              </>
            )}
          </>
        )}

        {step === '5' && (
          <>
            <Card>
              <Text style={styles.cardLabel}>Resident</Text>
              <ReviewLine label="Name" value={name} />
              <ReviewLine label="Phone" value={phone} />
              {!!selectedBed && (
                <ReviewLine
                  label="Bed"
                  value={`Room ${selectedBed.room_number} · Bed ${selectedBed.bed_label}`}
                />
              )}
              <ReviewLine label="Move-in" value={moveInDate ?? '—'} />
              <ReviewLine
                label="Vehicle"
                value={vehicleType === 'NONE' ? 'None' : `${vehicleType} · ${vehicleReg}`}
                last
              />
            </Card>

            <Card>
              <Text style={styles.cardLabel}>Money</Text>
              <ReviewLine label="Monthly rent" value={rupees(rentPaise)} />
              <ReviewLine label="Security deposit" value={rupees(depositPaise)} />
              <ReviewLine label="Advance (refundable)" value={rupees(advancePaise)} />
              <ReviewLine label="Advance (non-refundable)" value={rupees(nonRefPaise)} last />
              <View style={styles.totalRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.totalLabel}>Total collect on move-in</Text>
                  {nonRefPaise > 0 && (
                    <Pill
                      label={`${rupees(nonRefPaise)} non-refundable`}
                      tone="a"
                      style={{ marginTop: 4 }}
                    />
                  )}
                </View>
                <Text style={styles.totalValue}>
                  {rupees(depositPaise + advancePaise + nonRefPaise)}
                </Text>
              </View>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Fixed footer — the forward path never moves between steps. */}
      <View style={styles.footer}>
        <Button
          label="Back"
          variant="secondary"
          onPress={() => (prevStep ? setStep(prevStep.key) : router.back())}
          block
          style={{ flex: 1 }}
        />
        {nextStep ? (
          <Button
            label={`Next · ${nextStep.short}`}
            iconName="arrow-forward"
            disabled={!stepValid[step]}
            onPress={() => setStep(nextStep.key)}
            block
            style={{ flex: 2 }}
          />
        ) : (
          <Button
            label="Complete check-in"
            iconName="checkmark-circle"
            loading={checkin.isPending}
            onPress={submit}
            block
            style={{ flex: 2 }}
          />
        )}
      </View>
    </Screen>
  );
}

function ReviewLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.line, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
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
  bandIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  progress: { flexDirection: 'row', gap: 6, marginTop: space.md },
  progressSeg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  progressSegOn: { backgroundColor: colors.white },

  cardLabel: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: space.md,
  },
  cardHint: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    marginBottom: space.md,
  },

  bedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  bedTitle: { fontWeight: '700', color: colors.text, fontSize: fontSize.body },
  bedMeta: { color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  toggleTitle: { fontWeight: '700', color: colors.text, fontSize: fontSize.body },
  toggleSub: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 1 },

  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  lineLabel: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' },
  lineValue: {
    fontSize: fontSize.body,
    color: colors.text,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: fontSize.h2, fontWeight: '800', color: colors.accent },

  footer: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
