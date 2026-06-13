/**
 * Onboarding step 1 — name + emergency contact.
 *
 * Auto-prefills from /tenant/me if the staff app already captured these
 * at check-in. The user can correct typos before continuing.
 */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, Field, Screen } from '../../components/ui';
import { useProfile, useUpdateKyc } from '../../lib/data/hooks';
import { normalisePhone, looksLikeIndianMobile } from '../../lib/phone';
import { useTheme } from '../../lib/theme';

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const updateKyc = useUpdateKyc();
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();

  const [name, setName] = useState('');
  const [emName, setEmName] = useState('');
  const [emPhone, setEmPhone] = useState('');
  const [emRelation, setEmRelation] = useState('');

  useEffect(() => {
    if (!profile) return;
    setName((prev) => prev || profile.name);
    setEmName((prev) => prev || profile.emergency?.name || '');
    setEmPhone((prev) => prev || profile.emergency?.phone || '');
    setEmRelation((prev) => prev || profile.emergency?.relation || '');
  }, [profile]);

  function validate(): string | null {
    if (name.trim().length < 2) return 'Enter your full name.';
    if (emName.trim().length < 2) return 'Enter the emergency contact name.';
    const normalised = normalisePhone(emPhone);
    if (!looksLikeIndianMobile(normalised)) {
      return 'Enter a valid 10-digit emergency contact phone.';
    }
    if (emRelation.trim().length < 2) return 'Enter the relation (Mother, Friend…).';
    return null;
  }

  async function next() {
    const err = validate();
    if (err) {
      Alert.alert('Almost there', err);
      return;
    }
    try {
      await updateKyc.mutateAsync({
        name: name.trim(),
        emergencyContactName: emName.trim(),
        emergencyContactPhone: normalisePhone(emPhone),
        emergencyContactRelation: emRelation.trim(),
      });
      router.push('/onboarding/vehicle');
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
    }
  }

  return (
    <Screen scroll>
      <ScrollView contentContainerStyle={{ paddingBottom: space['3xl'] }}>
        <StepHeader step={1} total={3} title="About you" />

        <Field label="Your full name" required value={name} onChangeText={setName} />

        <Text
          style={{
            color: colors.text,
            fontSize: fontSize.h3,
            lineHeight: lineHeight.h3,
            fontWeight: fontWeight.bold,
            marginTop: space.lg,
            marginBottom: space.sm,
          }}
        >
          Emergency contact
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.small,
            marginBottom: space.md,
          }}
        >
          Someone we can call if you ever need help.
        </Text>

        <Field
          label="Contact name"
          required
          value={emName}
          onChangeText={setEmName}
          placeholder="e.g. Mother"
        />
        <Field
          label="Contact phone"
          required
          value={emPhone}
          onChangeText={setEmPhone}
          keyboardType="phone-pad"
          placeholder="98765 43210"
          leading={
            <Text
              style={{
                color: colors.textMuted,
                fontSize: fontSize.body,
                fontWeight: fontWeight.semibold,
              }}
            >
              +91
            </Text>
          }
        />
        <Field
          label="Relation"
          required
          value={emRelation}
          onChangeText={setEmRelation}
          placeholder="Mother / Father / Sibling / Friend"
        />

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

export function StepHeader({
  step,
  total,
  title,
}: {
  step: number;
  total: number;
  title: string;
}) {
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();
  return (
    <View style={{ marginTop: space.lg, marginBottom: space.xl }}>
      <Text
        style={{
          color: colors.accent,
          fontSize: fontSize.small,
          fontWeight: fontWeight.bold,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        Step {step} of {total}
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: fontSize.h1,
          lineHeight: lineHeight.h1,
          fontWeight: fontWeight.extrabold,
          marginTop: space.xs,
        }}
      >
        {title}
      </Text>
    </View>
  );
}
