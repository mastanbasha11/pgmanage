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
 */
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Screen,
  Header,
  Button,
  Card,
  Field,
  MoneyField,
  DateField,
  Select,
  Segmented,
  Empty,
  Loading,
  Row,
  Chip,
  StatusPill,
  rupees,
} from '../../components/ui';
import { useAppStore } from '../../lib/store';
import {
  useCheckin,
  type CheckinPayload,
} from '../../lib/hooks/tenants';
import { useVacantBeds } from '../../lib/hooks/properties';
import { getApiError } from '../../lib/api';
import { colors, radius, space, type as fontSize } from '../../lib/theme';

type StepKey = '1' | '2' | '3' | '4' | '5';

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
      <View style={{ padding: space.lg }}>
        <Header title="Check-in" subtitle={`Step ${step} of 5`} onBack={() => router.back()} />
        <Segmented<StepKey>
          value={step}
          onChange={setStep}
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5', label: '5' },
          ]}
        />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {step === '1' && (
          <>
            <StepTitle icon="person-outline" title="Personal details" />
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
            <Field label="Occupation" value={occupation} onChangeText={setOccupation} placeholder="Software engineer" />
            <StepNext disabled={!step1Valid} onNext={() => setStep('2')} />
          </>
        )}

        {step === '2' && (
          <>
            <StepTitle icon="call-outline" title="Emergency contact" />
            <Field label="Contact name" required value={ecName} onChangeText={setEcName} placeholder="Parent, spouse, etc." autoCapitalize="words" />
            <Field label="Contact phone" required value={ecPhone} onChangeText={setEcPhone} keyboardType="phone-pad" />
            <Field label="Relation" required value={ecRelation} onChangeText={setEcRelation} placeholder="Father / Mother / Spouse" />
            <StepNext disabled={!step2Valid} onNext={() => setStep('3')} onBack={() => setStep('1')} />
          </>
        )}

        {step === '3' && (
          <>
            <StepTitle icon="car-outline" title="Vehicle KYC" />
            <Text style={styles.stepHint}>Required for parking allocation.</Text>
            <Select<'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER'>
              label="Vehicle type"
              required
              value={vehicleType}
              onChange={(v) => {
                setVehicleType(v);
                if (v === 'NONE') setVehicleReg('');
              }}
              options={VEHICLE_TYPES}
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
              />
            )}
            <StepNext disabled={!step3Valid} onNext={() => setStep('4')} onBack={() => setStep('2')} />
          </>
        )}

        {step === '4' && (
          <>
            <StepTitle icon="bed-outline" title="Bed & rent" />
            {beds.isLoading ? (
              <Loading />
            ) : (beds.data?.items?.length ?? 0) === 0 ? (
              <Empty title="No vacant beds" hint="Add rooms in Property Setup first." />
            ) : (
              <>
                <Text style={styles.stepHint}>Pick a vacant bed</Text>
                <View style={{ marginBottom: space.md }}>
                  {(beds.data?.items ?? []).map((b) => {
                    const on = b.id === bedId;
                    return (
                      <Card
                        key={b.id}
                        onPress={() => onPickBed(b.id)}
                        style={{
                          marginBottom: space.sm,
                          borderColor: on ? colors.accent : colors.border,
                          backgroundColor: on ? colors.accentBg : colors.surface,
                        }}
                      >
                        <Row justify="space-between">
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', color: colors.text, fontSize: fontSize.bodyLg }}>
                              Room {b.room_number} · Bed {b.bed_label}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>
                              {b.floor_name} · {b.room_type ?? '—'} · {rupees(b.monthly_base_rent_paise)}/mo
                            </Text>
                          </View>
                          <Row gap={4}>
                            {b.has_ac && <StatusPill label="AC" tone="info" />}
                            {on && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
                          </Row>
                        </Row>
                      </Card>
                    );
                  })}
                </View>

                <DateField label="Move-in date" required value={moveInDate} onChange={setMoveInDate} />
                <DateField label="Expected move-out (optional)" value={expectedMoveOut} onChange={setExpectedMoveOut} />
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
                <Card
                  onPress={() => setFoodIncluded(!foodIncluded)}
                  style={{
                    marginBottom: space.md,
                    borderColor: foodIncluded ? colors.accent : colors.border,
                    backgroundColor: foodIncluded ? colors.accentBg : colors.surface,
                  }}
                >
                  <Row justify="space-between">
                    <Row gap={space.sm}>
                      <Ionicons
                        name="restaurant-outline"
                        size={20}
                        color={foodIncluded ? colors.accent : colors.textMuted}
                      />
                      <View>
                        <Text style={{ fontWeight: '700', color: colors.text }}>Food included</Text>
                        <Text style={{ fontSize: fontSize.small, color: colors.textMuted }}>
                          Tap to toggle
                        </Text>
                      </View>
                    </Row>
                    <Ionicons
                      name={foodIncluded ? 'checkmark-circle' : 'ellipse-outline'}
                      size={26}
                      color={foodIncluded ? colors.accent : colors.textDim}
                    />
                  </Row>
                </Card>
                {foodIncluded && (
                  <MoneyField
                    label="Food charges (monthly)"
                    valuePaise={foodPaise}
                    onChangeAmount={setFoodPaise}
                  />
                )}
                <Field
                  label="Billing day (of month)"
                  value={billingDay}
                  onChangeText={setBillingDay}
                  keyboardType="number-pad"
                  hint="Day rent is due each month. Usually 1."
                />
                <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Anything to remember" />
                <StepNext disabled={!step4Valid} onNext={() => setStep('5')} onBack={() => setStep('3')} />
              </>
            )}
          </>
        )}

        {step === '5' && (
          <>
            <StepTitle icon="checkmark-done-outline" title="Review & confirm" />
            <Card style={{ marginBottom: space.md }}>
              <Row justify="space-between" style={styles.line}>
                <Text style={styles.label}>Name</Text>
                <Text style={styles.value}>{name}</Text>
              </Row>
              <Row justify="space-between" style={styles.line}>
                <Text style={styles.label}>Phone</Text>
                <Text style={styles.value}>{phone}</Text>
              </Row>
              {selectedBed && (
                <Row justify="space-between" style={styles.line}>
                  <Text style={styles.label}>Bed</Text>
                  <Text style={styles.value}>
                    Room {selectedBed.room_number} · Bed {selectedBed.bed_label}
                  </Text>
                </Row>
              )}
              <Row justify="space-between" style={styles.line}>
                <Text style={styles.label}>Move-in</Text>
                <Text style={styles.value}>{moveInDate}</Text>
              </Row>
              <Row justify="space-between" style={styles.line}>
                <Text style={styles.label}>Vehicle</Text>
                <Text style={styles.value}>
                  {vehicleType === 'NONE' ? 'None' : `${vehicleType} · ${vehicleReg}`}
                </Text>
              </Row>
            </Card>

            <Card style={{ marginBottom: space.md }}>
              <Text style={{ fontWeight: '700', color: colors.text, marginBottom: space.sm }}>Money</Text>
              <Row justify="space-between" style={styles.line}>
                <Text style={styles.label}>Monthly rent</Text>
                <Text style={styles.value}>{rupees(rentPaise)}</Text>
              </Row>
              <Row justify="space-between" style={styles.line}>
                <Text style={styles.label}>Security deposit</Text>
                <Text style={styles.value}>{rupees(depositPaise)}</Text>
              </Row>
              <Row justify="space-between" style={styles.line}>
                <Text style={styles.label}>Advance (refundable)</Text>
                <Text style={styles.value}>{rupees(advancePaise)}</Text>
              </Row>
              <Row justify="space-between" style={styles.line}>
                <Text style={styles.label}>Advance (non-refundable)</Text>
                <Text style={styles.value}>{rupees(nonRefPaise)}</Text>
              </Row>
              <Row justify="space-between" style={styles.line}>
                <Text style={[styles.label, { fontWeight: '700' }]}>Total collect on move-in</Text>
                <Text style={[styles.value, { fontSize: fontSize.h3 }]}>
                  {rupees(depositPaise + advancePaise + nonRefPaise)}
                </Text>
              </Row>
            </Card>

            <Button
              label="Complete check-in"
              iconName="checkmark-circle"
              loading={checkin.isPending}
              onPress={submit}
              block
            />
            <Button
              label="Back"
              variant="ghost"
              onPress={() => setStep('4')}
              block
              style={{ marginTop: space.sm }}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function StepTitle({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
}) {
  return (
    <Row gap={space.sm} style={{ marginBottom: space.md }}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </Row>
  );
}

function StepNext({
  disabled,
  onNext,
  onBack,
}: {
  disabled?: boolean;
  onNext: () => void;
  onBack?: () => void;
}) {
  return (
    <Row gap={space.sm} style={{ marginTop: space.md }}>
      {onBack && <Button label="Back" variant="secondary" onPress={onBack} block style={{ flex: 1 }} />}
      <Button
        label="Next"
        iconName="arrow-forward"
        disabled={disabled}
        onPress={onNext}
        block
        style={{ flex: onBack ? 1 : undefined }}
      />
    </Row>
  );
}

const styles = StyleSheet.create({
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: { fontSize: fontSize.h3, fontWeight: '700', color: colors.text },
  stepHint: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: space.md },

  line: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },
});
