/**
 * Visitors — invite guests + see history.
 *
 * The "invite a guest" action mints a 6-digit pass code (mock for now).
 * Real flow: POST creates a visitor row + the gate scans the code on
 * arrival. QR rendering is deferred until we add a QR library.
 */
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import {
  Button,
  Card,
  Empty,
  Field,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  toast,
} from '../../components/ui';
import { useVisitors } from '../../lib/data/hooks';
import type { Visitor } from '../../lib/data/types';
import { useTheme } from '../../lib/theme';

const STATUS_TONE: Record<
  Visitor['status'],
  'warning' | 'info' | 'success' | 'danger' | 'neutral'
> = {
  pending: 'warning',
  arrived: 'info',
  left: 'success',
  expired: 'neutral',
  denied: 'danger',
};

export default function VisitorsScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();
  const visitorsQ = useVisitors();
  const [inviting, setInviting] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [purpose, setPurpose] = useState('');

  async function invite() {
    if (guestName.trim().length < 2) {
      Alert.alert('Need a name', 'Tell us who is visiting.');
      return;
    }
    // Mock — in v2 this POSTs to /tenant/visitors and mints a code.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    toast.success(`Gate pass: ${code}`);
    setGuestName('');
    setPurpose('');
    setInviting(false);
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Visitors',
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
            Guests & visitors
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: fontSize.body, marginTop: 2 }}
          >
            Invite friends and family — they'll get a gate pass code.
          </Text>
        </View>

        {!inviting ? (
          <Button
            label="Invite a guest"
            onPress={() => setInviting(true)}
            iconName="person-add"
            size="lg"
            block
          />
        ) : (
          <Card>
            <Field
              label="Guest name"
              value={guestName}
              onChangeText={setGuestName}
              required
              placeholder="e.g. Riya Mehta"
            />
            <Field
              label="Purpose (optional)"
              value={purpose}
              onChangeText={setPurpose}
              placeholder="e.g. friend visiting"
            />
            <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setInviting(false)}
                block
                style={{ flex: 1 }}
              />
              <Button
                label="Generate pass"
                iconName="qr-code"
                onPress={invite}
                block
                style={{ flex: 2 }}
              />
            </View>
          </Card>
        )}

        <SectionHeader title="Visitor history" />
        {visitorsQ.isLoading ? null : !visitorsQ.data?.length ? (
          <Empty
            iconName="people"
            title="No visitors yet"
            message="Invites you create will show up here."
          />
        ) : (
          <View style={{ gap: space.md }}>
            {visitorsQ.data.map((v) => (
              <Card key={v.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: space.md,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: fontSize.body,
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      {v.name}
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: fontSize.small,
                        marginTop: 2,
                      }}
                    >
                      {v.purpose ?? '—'} ·{' '}
                      {format(parseISO(v.expectedAt), 'd MMM, h:mm a')}
                    </Text>
                    <Text
                      style={{
                        color: colors.textDim,
                        fontSize: fontSize.caption,
                        marginTop: space.xs,
                        letterSpacing: 2,
                      }}
                    >
                      Code · {v.passCode}
                    </Text>
                  </View>
                  <Pill label={v.status} tone={STATUS_TONE[v.status]} size="sm" />
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
