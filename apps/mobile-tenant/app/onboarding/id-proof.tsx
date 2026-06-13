/**
 * Onboarding step 3 — ID proof.
 *
 * expo-image-picker isn't installed for the resident app yet (deliberate
 * decision to keep the APK small and skip the Play-Store permissions
 * conversation until the staff app has handled ID-proof during check-in
 * anyway). We render a placeholder that explains the situation, with a
 * primary "Skip for now" button and a secondary "Mark uploaded".
 *
 * When the picker dependency is added (Phase 2.1 follow-up), this screen
 * grows a `launchImageLibraryAsync` call and a presigned S3 upload. For
 * Phase 2 the staff app's tenant-detail screen remains the
 * canonical upload surface and this screen is purely informational.
 */
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Screen, toast } from '../../components/ui';
import { useTheme } from '../../lib/theme';

import { StepHeader } from './profile';

export default function OnboardingIdProofScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();

  function finish() {
    toast.success('You’re all set');
    router.replace('/home');
  }

  return (
    <Screen scroll>
      <ScrollView contentContainerStyle={{ paddingBottom: space['3xl'] }}>
        <StepHeader step={3} total={3} title="ID proof" />

        <Card variant="hero">
          <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: space.lg,
              }}
            >
              <Ionicons name="document-text" size={36} color={colors.accent} />
            </View>
            <Text
              style={{
                color: colors.text,
                fontSize: fontSize.h3,
                lineHeight: lineHeight.h3,
                fontWeight: fontWeight.bold,
                textAlign: 'center',
              }}
            >
              Already with your PG owner
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: fontSize.body,
                lineHeight: lineHeight.body,
                textAlign: 'center',
                marginTop: space.sm,
                maxWidth: 320,
              }}
            >
              Your manager captured your ID at check-in. You can skip this
              for now; if you ever need to re-upload, you'll find it under
              Profile → ID proof.
            </Text>
          </View>
        </Card>

        <Card variant="flat" style={{ marginTop: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Ionicons name="information-circle" size={20} color={colors.infoFg} />
            <Text
              style={{
                color: colors.textMuted,
                fontSize: fontSize.small,
                lineHeight: lineHeight.small,
                flex: 1,
              }}
            >
              Aadhaar / passport / DL upload from your phone is coming in the
              next release. Stay tuned.
            </Text>
          </View>
        </Card>

        <View style={{ height: space.xl }} />

        <Button
          label="Finish setup"
          onPress={finish}
          iconName="checkmark-circle"
          size="lg"
          block
        />
      </ScrollView>
    </Screen>
  );
}
