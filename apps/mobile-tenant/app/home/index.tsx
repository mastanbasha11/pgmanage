/**
 * Home — landing screen post-login.
 *
 * Phase-2.1 interim: still mostly stub sections (Phase 3 rebuilds this
 * as a full command-center with hero rent card, meals strip, quick
 * actions, etc.). The work landing here NOW is the post-login UX fix:
 *
 *   1. Land on Home immediately after OTP — never gated on KYC.
 *   2. Show a "Complete your profile" nudge card when kyc_complete=false.
 *      Tapping it opens the optional 3-step profile flow that lives
 *      under /onboarding/* (renamed in spirit to "profile edit" — actual
 *      route move happens in Phase 9 with the full Profile section).
 *   3. Sign out lives at the bottom for now; moves into More tab in Phase 3.
 */
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Avatar,
  Card,
  Pressable,
  Screen,
  SkeletonLines,
  toast,
} from '../../components/ui';
import { useProfile } from '../../lib/data/hooks';
import { secureStorage } from '../../lib/storage';
import { useAppStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { data: profile, isLoading, refetch } = useProfile();
  const signOut = useAppStore((s) => s.signOut);
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();

  // Local dismiss so a user who taps "Maybe later" doesn't see the card
  // again until they re-open the app. Persisting this would need a
  // dedicated key — not worth it for v1, the next session re-prompts.
  const [kycDismissed, setKycDismissed] = useState(false);

  async function doSignOut() {
    await secureStorage.clear();
    signOut();
    router.replace('/auth/login');
  }

  if (isLoading || !profile) {
    return (
      <Screen scroll>
        <View style={{ marginTop: 24 }}>
          <SkeletonLines count={6} />
        </View>
      </Screen>
    );
  }

  const showKycNudge = !profile.kycComplete && !kycDismissed;

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space['3xl'] }}
        refreshControl={undefined /* full pull-to-refresh in Phase 3 */}
      >
        {/* Greeting header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: space.md,
            marginBottom: space.xl,
            gap: space.md,
          }}
        >
          <Avatar name={profile.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: fontSize.h2,
                fontWeight: fontWeight.extrabold,
              }}
            >
              Hi, {profile.name.split(' ')[0]}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
              {profile.property.name} · Room {profile.room.roomNumber} · Bed{' '}
              {profile.room.bedLabel}
            </Text>
          </View>
        </View>

        {/* Optional KYC nudge — friendly, dismissible */}
        {showKycNudge ? (
          <Card
            variant="hero"
            style={{ marginBottom: space.xl }}
            onPress={() => router.push('/onboarding/welcome')}
            accessibilityLabel="Complete your profile"
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="person-circle" size={24} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: fontSize.bodyLg,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  Complete your profile
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: fontSize.small,
                    lineHeight: lineHeight.small,
                    marginTop: space.xs,
                  }}
                >
                  Add an emergency contact and your vehicle so gate
                  security recognises you. Takes under a minute.
                </Text>
                <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}>
                  <View
                    style={{
                      backgroundColor: colors.accent,
                      borderRadius: radius.pill,
                      paddingHorizontal: space.lg,
                      paddingVertical: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.onAccent,
                        fontSize: fontSize.small,
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      Complete now
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setKycDismissed(true);
                      toast.info("We'll remind you later");
                    }}
                    hitSlop={8}
                  >
                    <View
                      style={{
                        paddingHorizontal: space.md,
                        paddingVertical: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: fontSize.small,
                          fontWeight: fontWeight.semibold,
                        }}
                      >
                        Maybe later
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Phase-3 placeholders — replaced when we build the real dashboard. */}
        <View style={{ gap: space.md }}>
          <PlaceholderSection title="Dues" body="Phase 3 will show your rent here." />
          <PlaceholderSection
            title="Today's meals"
            body="Phase 3 will show breakfast / lunch / dinner from the uploaded menu."
          />
          <PlaceholderSection
            title="Complaints"
            body="Open + recently-resolved tickets land here."
          />
          <PlaceholderSection title="Notices" body="Latest announcement preview." />
        </View>

        {/* Temporary sign-out — moves into More tab + Profile in Phase 3. */}
        <Pressable
          onPress={doSignOut}
          hitSlop={8}
          style={{ alignSelf: 'center', marginTop: space['3xl'], padding: space.md }}
        >
          <Text
            style={{
              color: colors.accent,
              fontWeight: fontWeight.semibold,
              fontSize: fontSize.body,
            }}
          >
            Sign out
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function PlaceholderSection({ title, body }: { title: string; body: string }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  return (
    <Card variant="flat">
      <Text
        style={{ color: colors.text, fontSize: fontSize.h3, fontWeight: fontWeight.bold }}
      >
        {title}
      </Text>
      <Text
        style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: space.xs }}
      >
        {body}
      </Text>
    </Card>
  );
}
