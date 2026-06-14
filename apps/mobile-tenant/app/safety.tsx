/**
 * Safety — daily check-in, "staying out" toggle, SOS, emergency
 * contacts.
 *
 * SOS just opens the phone dialer with the property's emergency number.
 * Daily check-in + staying-out toggle are local-state stubs in v1; the
 * server-side `safety_events` table is a follow-up.
 */
import { useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Button,
  Card,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  toast,
} from '../components/ui';
import { useProfile } from '../lib/data/hooks';
import { useTheme } from '../lib/theme';

export default function SafetyScreen() {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const profileQ = useProfile();
  const [checkedIn, setCheckedIn] = useState(false);
  const [stayingOut, setStayingOut] = useState(false);

  const profile = profileQ.data;

  function sos() {
    const num = profile?.property.emergencyPhone ?? '112';
    Alert.alert('SOS — Emergency call', `Call ${num}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Call',
        style: 'destructive',
        onPress: () => Linking.openURL(`tel:${num}`),
      },
    ]);
  }

  function call(number?: string) {
    if (!number) return;
    Linking.openURL(`tel:${number}`);
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Safety',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ marginTop: space.md, marginBottom: space.lg }}>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h1,
              lineHeight: lineHeight.h1,
              fontWeight: fontWeight.extrabold,
            }}
          >
            Safety
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.body,
              marginTop: 2,
            }}
          >
            Peace of mind for you and your family.
          </Text>
        </View>

        {/* SOS button */}
        <Pressable
          onPress={sos}
          accessibilityRole="button"
          accessibilityLabel="SOS — emergency call"
          style={{
            backgroundColor: colors.dangerFg,
            borderRadius: radius.xl,
            padding: space.xl,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.sm,
          }}
        >
          <Ionicons name="warning" size={32} color="#FFFFFF" />
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: fontSize.h2,
              fontWeight: fontWeight.extrabold,
              letterSpacing: 2,
            }}
          >
            SOS
          </Text>
          <Text
            style={{
              color: '#FEE2E2',
              fontSize: fontSize.small,
              textAlign: 'center',
            }}
          >
            Tap to call emergency number
          </Text>
        </Pressable>

        {/* Daily check-in */}
        <SectionHeader title="Check-in" />
        <Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              marginBottom: space.md,
            }}
          >
            <Ionicons
              name={checkedIn ? 'checkmark-circle' : 'time'}
              size={28}
              color={checkedIn ? colors.successFg : colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.body,
                  fontWeight: fontWeight.bold,
                }}
              >
                {checkedIn ? "You're checked in today" : 'Daily check-in'}
              </Text>
              <Text
                style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
              >
                Lets the team know you're back safely each day.
              </Text>
            </View>
          </View>
          {checkedIn ? (
            <Pill label="Done for today" tone="success" size="sm" />
          ) : (
            <Button
              label="Check in now"
              onPress={() => {
                setCheckedIn(true);
                toast.success('Checked in');
              }}
              block
            />
          )}
        </Card>

        {/* Staying out */}
        <SectionHeader title="Out tonight?" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Ionicons
              name="moon"
              size={28}
              color={stayingOut ? colors.accent : colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.body,
                  fontWeight: fontWeight.bold,
                }}
              >
                Staying out tonight
              </Text>
              <Text
                style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
              >
                Skips tonight's headcount + lets reception know.
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setStayingOut((s) => !s);
                toast.info(stayingOut ? "We'll expect you tonight" : 'Got it — staying out');
              }}
              style={{
                backgroundColor: stayingOut ? colors.accent : colors.surfaceMuted,
                borderRadius: radius.pill,
                paddingHorizontal: space.md,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  color: stayingOut ? colors.onAccent : colors.textMuted,
                  fontSize: fontSize.small,
                  fontWeight: fontWeight.bold,
                }}
              >
                {stayingOut ? 'On' : 'Off'}
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* Emergency contacts */}
        <SectionHeader title="Emergency contacts" />
        <Card style={{ padding: 0 }}>
          <ContactRow
            icon="person"
            label="Property manager"
            value={profile?.property.managerName ?? '—'}
            phone={profile?.property.managerPhone}
            onCall={call}
          />
          <View
            style={{ height: 1, backgroundColor: colors.border, marginHorizontal: space.lg }}
          />
          <ContactRow
            icon="medkit"
            label="Property emergency"
            value="Reception (24/7)"
            phone={profile?.property.emergencyPhone}
            onCall={call}
          />
          <View
            style={{ height: 1, backgroundColor: colors.border, marginHorizontal: space.lg }}
          />
          <ContactRow
            icon="heart"
            label="Your emergency contact"
            value={profile?.emergency?.name ?? 'Not set'}
            phone={profile?.emergency?.phone}
            onCall={call}
          />
          <View
            style={{ height: 1, backgroundColor: colors.border, marginHorizontal: space.lg }}
          />
          <ContactRow
            icon="call"
            label="Police"
            value="Emergency services"
            phone="100"
            onCall={call}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

function ContactRow({
  icon,
  label,
  value,
  phone,
  onCall,
}: {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  value: string;
  phone?: string;
  onCall: (n?: string) => void;
}) {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: space.lg,
        gap: space.md,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold }}>
          {label}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
          {value}
        </Text>
      </View>
      {phone ? (
        <Pressable
          onPress={() => onCall(phone)}
          accessibilityRole="button"
          accessibilityLabel={`Call ${label}`}
          style={{
            paddingHorizontal: space.md,
            paddingVertical: 8,
            borderRadius: radius.pill,
            backgroundColor: colors.successFg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Ionicons name="call" size={14} color="#FFFFFF" />
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: fontSize.caption,
              fontWeight: fontWeight.bold,
            }}
          >
            Call
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
