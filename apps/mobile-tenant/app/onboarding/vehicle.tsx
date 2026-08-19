/**
 * Onboarding step 2 — vehicle (type + registration).
 *
 * Three-card picker (None / Two-wheeler / Four-wheeler) with the
 * registration input revealed only when a vehicle type is chosen.
 */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Field, Pressable, Screen } from '../../components/ui';
import { useProfile, useUpdateKyc } from '../../lib/data/hooks';
import type { VehicleType } from '../../lib/data/types';
import { useTheme } from '../../lib/theme';

import { StepHeader } from './profile';

const OPTIONS: { value: VehicleType; label: string; icon: 'close-circle' | 'bicycle' | 'car' }[] = [
  { value: 'NONE', label: 'No vehicle', icon: 'close-circle' },
  { value: 'TWO_WHEELER', label: 'Two-wheeler', icon: 'bicycle' },
  { value: 'FOUR_WHEELER', label: 'Four-wheeler', icon: 'car' },
];

export default function OnboardingVehicleScreen() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const updateKyc = useUpdateKyc();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();

  const [type, setType] = useState<VehicleType>('NONE');
  const [registration, setRegistration] = useState('');

  useEffect(() => {
    if (!profile) return;
    setType((prev) => (prev === 'NONE' && profile.vehicle.type ? profile.vehicle.type : prev));
    setRegistration((prev) => prev || profile.vehicle.registration || '');
  }, [profile]);

  async function next() {
    if (type !== 'NONE' && registration.trim().length < 4) {
      Alert.alert('Registration number?', 'Enter your vehicle plate (e.g. KA 01 AB 1234).');
      return;
    }
    try {
      await updateKyc.mutateAsync({
        vehicleType: type,
        vehicleRegistration:
          type === 'NONE' ? undefined : registration.trim().toUpperCase(),
      });
      router.push('/onboarding/id-proof');
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
    }
  }

  return (
    <Screen scroll>
      <ScrollView contentContainerStyle={{ paddingBottom: space['3xl'] }}>
        <StepHeader step={2} total={3} title="Your vehicle" />

        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.body,
            lineHeight: lineHeight.body,
            marginBottom: space.lg,
          }}
        >
          We share your plate with gate security so they can recognise you on entry.
        </Text>

        <Text
          style={{
            color: colors.textMuted,
            fontSize: 10,
            fontWeight: '800',
            letterSpacing: 1,
            marginBottom: space.sm,
          }}
        >
          VEHICLE TYPE
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {OPTIONS.map((opt) => {
            const selected = type === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setType(opt.value);
                  if (opt.value === 'NONE') setRegistration('');
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: space.lg,
                  paddingHorizontal: 4,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent : colors.border,
                  backgroundColor: selected ? colors.surfaceMuted : colors.surface,
                }}
              >
                <Ionicons
                  name={opt.icon}
                  size={24}
                  color={selected ? colors.accent : colors.textMuted}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 6,
                    color: selected ? colors.accent : colors.textMuted,
                    fontSize: fontSize.caption,
                    fontWeight: fontWeight.bold,
                    textAlign: 'center',
                  }}
                >
                  {opt.value === 'NONE' ? 'None' : opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {type !== 'NONE' ? (
          <Card style={{ marginTop: space.xl }}>
            <Field
              label="Registration number"
              required
              value={registration}
              onChangeText={(v) => setRegistration(v.toUpperCase())}
              placeholder="KA 01 AB 1234"
              autoCapitalize="characters"
              maxLength={20}
            />
          </Card>
        ) : null}

        <View style={{ height: space.xl }} />

        <Button
          label="Continue"
          onPress={next}
          loading={updateKyc.isPending}
          iconName="arrow-forward"
          size="lg"
          block
        />
      </ScrollView>
    </Screen>
  );
}
