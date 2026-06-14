/**
 * Support — FAQ + contact channels to the property team.
 *
 * The "Stanza fix" — there's always a visible way to reach someone.
 */
import { Linking, ScrollView, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Card, Pressable, Screen, SectionHeader } from '../components/ui';
import { useProfile } from '../lib/data/hooks';
import { useTheme } from '../lib/theme';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'When is my rent due?',
    a: 'On the billing day of the month set when you checked in. See Pay tab for the exact date.',
  },
  {
    q: 'How do I raise a complaint?',
    a: 'Services tab → pick a category → describe the issue. You can track the status timeline live.',
  },
  {
    q: 'What if I move out early?',
    a: 'Give notice at least 30 days before your move-out to keep your refundable advance. Less than 30 days and the advance is forfeit per PG policy.',
  },
  {
    q: 'How do referrals work?',
    a: 'Share your code from Refer & Earn. ₹500 when they sign up, ₹2,000 once they move in — straight to your wallet.',
  },
  {
    q: "I can't find the menu",
    a: "Food tab — your PG manager uploads the weekly menu there. Pull down to refresh if it looks stale.",
  },
];

export default function SupportScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const profileQ = useProfile();
  const profile = profileQ.data;

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Support',
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
            Need help?
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: fontSize.body, marginTop: 2 }}
          >
            We're always one tap away.
          </Text>
        </View>

        {/* Contact actions */}
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <ContactTile
            icon="call"
            label="Call manager"
            sublabel={profile?.property.managerName ?? '—'}
            onPress={() => profile?.property.managerPhone && Linking.openURL(`tel:${profile.property.managerPhone}`)}
            tint={colors.successFg}
            bg={colors.successBg}
          />
          <ContactTile
            icon="logo-whatsapp"
            label="WhatsApp"
            sublabel="Quick reply"
            onPress={() =>
              profile?.property.managerPhone &&
              Linking.openURL(`whatsapp://send?phone=${profile.property.managerPhone.replace(/[^\d]/g, '')}`)
            }
            tint="#25D366"
            bg="#DCFCE7"
          />
        </View>
        <View style={{ height: space.md }} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <ContactTile
            icon="construct"
            label="Raise ticket"
            sublabel="Get help, tracked"
            onPress={() => router.push('/home/services')}
            tint={colors.accent}
            bg={colors.accentSoft}
          />
          <ContactTile
            icon="chatbubble-ellipses"
            label="Feedback"
            sublabel="Tell us anything"
            onPress={() => router.push('/feedback')}
            tint={colors.celebrationFg}
            bg={colors.celebrationBg}
          />
        </View>

        {/* FAQ */}
        <SectionHeader title="FAQ" />
        <Card style={{ padding: 0 }}>
          {FAQS.map((f, i) => (
            <View key={f.q}>
              <View style={{ padding: space.lg }}>
                <Text
                  style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
                >
                  {f.q}
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: fontSize.small,
                    lineHeight: lineHeight.small,
                    marginTop: 4,
                  }}
                >
                  {f.a}
                </Text>
              </View>
              {i < FAQS.length - 1 ? (
                <View
                  style={{ height: 1, backgroundColor: colors.border, marginHorizontal: space.lg }}
                />
              ) : null}
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function ContactTile({
  icon,
  label,
  sublabel,
  onPress,
  tint,
  bg,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  onPress: () => void;
  tint: string;
  bg: string;
}) {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.lg,
        alignItems: 'flex-start',
        gap: space.sm,
        minHeight: 120,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
        >
          {label}
        </Text>
        <Text
          style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: 2 }}
        >
          {sublabel}
        </Text>
      </View>
    </Pressable>
  );
}
