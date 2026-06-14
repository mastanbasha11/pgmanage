/**
 * Profile — full view of identity, stay, vehicle, emergency contact.
 *
 * All read-mostly with inline edit affordances. Tapping a section
 * opens the matching edit screen (KYC flow under /onboarding/*).
 */
import { ScrollView, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import {
  Avatar,
  Card,
  Money,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  SkeletonLines,
} from '../../components/ui';
import { useProfile } from '../../lib/data/hooks';
import { useTheme } from '../../lib/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const profileQ = useProfile();
  const profile = profileQ.data;

  if (!profile) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'Profile' }} />
        <View style={{ marginTop: 24 }}>
          <SkeletonLines count={6} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Profile',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', marginTop: space.md, marginBottom: space.lg }}>
          <Avatar name={profile.name} size={80} />
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h1,
              lineHeight: lineHeight.h1,
              fontWeight: fontWeight.extrabold,
              marginTop: space.md,
            }}
          >
            {profile.name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.body, marginTop: 2 }}>
            {profile.phone}
          </Text>
          {!profile.kycComplete ? (
            <Pill label="Profile incomplete" tone="warning" size="sm" style={{ marginTop: space.sm }} />
          ) : null}
        </View>

        <Pressable
          onPress={() => router.push('/onboarding/welcome')}
          style={{
            backgroundColor: colors.accent,
            borderRadius: radius.md,
            paddingVertical: 12,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: space.sm,
          }}
        >
          <Ionicons name="create" size={16} color={colors.onAccent} />
          <Text
            style={{ color: colors.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
          >
            Edit profile
          </Text>
        </Pressable>

        {/* Stay */}
        <SectionHeader title="Your stay" />
        <Card>
          <Row label="Property" value={profile.property.name} />
          <Row label="Address" value={profile.property.addressLine} />
          <Row
            label="Room"
            value={`${profile.room.roomNumber} · Bed ${profile.room.bedLabel}`}
          />
          <Row
            label="Move-in"
            value={format(parseISO(profile.lease.startDate), 'd MMM yyyy')}
          />
          {profile.lease.expectedEndDate ? (
            <Row
              label="Expected move-out"
              value={format(parseISO(profile.lease.expectedEndDate), 'd MMM yyyy')}
            />
          ) : null}
        </Card>

        {/* Money */}
        <SectionHeader title="Money on file" />
        <Card>
          <Row
            label="Monthly rent"
            value={<Money paise={profile.lease.monthlyRentPaise} size="small" />}
          />
          <Row
            label="Security deposit"
            value={<Money paise={profile.lease.depositPaise} size="small" />}
          />
          <Row
            label="Wallet balance"
            value={
              <Money paise={profile.walletBalancePaise} size="small" color={colors.celebrationFg} />
            }
          />
        </Card>

        {/* Vehicle */}
        <SectionHeader title="Vehicle" />
        <Card>
          {profile.vehicle.type === 'NONE' ? (
            <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>
              You haven't added a vehicle. Add one so gate security
              recognises you.
            </Text>
          ) : (
            <>
              <Row
                label="Type"
                value={profile.vehicle.type === 'TWO_WHEELER' ? 'Two-wheeler' : 'Four-wheeler'}
              />
              <Row label="Registration" value={profile.vehicle.registration ?? '—'} />
            </>
          )}
        </Card>

        {/* Emergency */}
        <SectionHeader title="Emergency contact" />
        <Card>
          {profile.emergency ? (
            <>
              <Row label="Name" value={profile.emergency.name} />
              <Row label="Phone" value={profile.emergency.phone} />
              <Row label="Relation" value={profile.emergency.relation} />
            </>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>
              Add an emergency contact so we can reach someone if needed.
            </Text>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: space.xs,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>{label}</Text>
      {typeof value === 'string' ? (
        <Text
          style={{
            color: colors.text,
            fontSize: fontSize.small,
            fontWeight: fontWeight.semibold,
            flexShrink: 1,
            textAlign: 'right',
          }}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}
