/**
 * Welcome — first screen of the onboarding flow.
 *
 * Shows the property the resident is moving into so they immediately know
 * they're in the right place + sets expectations for the next steps.
 * Pulls profile from useProfile (mock-backed in Phase 2).
 */
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Avatar,
  Button,
  Card,
  Screen,
  SkeletonLines,
} from '../../components/ui';
import { useProfile } from '../../lib/data/hooks';
import { useTheme } from '../../lib/theme';

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();

  if (isLoading || !profile) {
    return (
      <Screen scroll>
        <SkeletonLines count={6} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ScrollView contentContainerStyle={{ paddingBottom: space['3xl'] }}>
        <View style={{ alignItems: 'center', marginTop: space.xl }}>
          <Avatar name={profile.name} size={64} />
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h1,
              lineHeight: lineHeight.h1,
              fontWeight: fontWeight.extrabold,
              marginTop: space.lg,
              textAlign: 'center',
            }}
          >
            Welcome, {profile.name.split(' ')[0]}
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
            Let's get you set up at {profile.property.name}. Three quick
            steps — under a minute.
          </Text>
        </View>

        <Card variant="hero" style={{ marginTop: space['3xl'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: space.md,
              }}
            >
              <Ionicons name="home" color={colors.accent} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.bodyLg,
                  fontWeight: fontWeight.bold,
                }}
              >
                {profile.property.name}
              </Text>
              <Text
                style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
              >
                {profile.property.addressLine}
              </Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />
          <Row label="Room" value={`${profile.room.roomNumber} · Bed ${profile.room.bedLabel}`} />
          <Row
            label="Sharing"
            value={
              profile.room.sharing === 'twin'
                ? 'Twin sharing'
                : profile.room.sharing === 'single'
                  ? 'Single occupancy'
                  : profile.room.sharing === 'triple'
                    ? 'Triple sharing'
                    : 'Quad sharing'
            }
          />
          <Row label="Manager" value={profile.property.managerName} />
        </Card>

        <View style={{ marginTop: space['3xl'] }}>
          <ChecklistRow
            num="1"
            title="A bit about you"
            subtitle="Name + emergency contact"
          />
          <ChecklistRow
            num="2"
            title="Your vehicle"
            subtitle="So gate security recognises you"
          />
          <ChecklistRow
            num="3"
            title="ID proof"
            subtitle="Aadhaar or other (optional — can do later)"
          />
        </View>

        <View style={{ marginTop: space['3xl'] }}>
          <Button
            label="Let's go"
            onPress={() => router.push('/onboarding/profile')}
            iconName="arrow-forward"
            size="lg"
            block
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: space.xs,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: fontSize.small, fontWeight: fontWeight.semibold }}>
        {value}
      </Text>
    </View>
  );
}

function ChecklistRow({ num, title, subtitle }: { num: string; title: string; subtitle: string }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: space.md,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: space.md,
        }}
      >
        <Text style={{ color: colors.textMuted, fontWeight: fontWeight.bold }}>
          {num}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold }}>
          {title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

