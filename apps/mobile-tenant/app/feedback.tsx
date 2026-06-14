/**
 * Feedback — in-app star rating + free text + Google / Instagram links.
 *
 * Submissions feed the admin Inbox.
 */
import { useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Button,
  Card,
  Field,
  Pressable,
  Screen,
  SectionHeader,
  toast,
} from '../components/ui';
import { useTheme } from '../lib/theme';

// In v1 these are property-level constants. In v2, owner-configurable
// via Settings → Feedback links (need 2 new columns on properties +
// a small Settings page).
const GOOGLE_MAPS_URL = 'https://www.google.com/maps';
const INSTAGRAM_URL = 'https://www.instagram.com';

export default function FeedbackScreen() {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (rating === 0) {
      Alert.alert('Pick a rating', 'Tap a star so we know how it went.');
      return;
    }
    setSubmitting(true);
    // Mock — real wiring posts to /tenant/feedback and writes an inbox event.
    await new Promise((r) => setTimeout(r, 400));
    setSubmitting(false);
    toast.success('Thanks for the feedback!');
    setRating(0);
    setMessage('');
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Feedback',
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
            Tell us how we're doing
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.body, marginTop: 2 }}>
            Your honest feedback helps us improve.
          </Text>
        </View>

        <Card>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.body,
              fontWeight: fontWeight.bold,
              marginBottom: space.sm,
            }}
          >
            How would you rate your stay?
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={4} pressScale={0.92}>
                <Ionicons
                  name={n <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={n <= rating ? colors.warningFg : colors.borderStrong}
                />
              </Pressable>
            ))}
          </View>
          <Field
            label="Anything to tell us?"
            value={message}
            onChangeText={setMessage}
            placeholder="Compliments, complaints, suggestions — all welcome."
            multiline
            numberOfLines={5}
            style={{ minHeight: 120 }}
          />
          <Button
            label={submitting ? 'Sending…' : 'Submit feedback'}
            onPress={submit}
            loading={submitting}
            iconName="paper-plane"
            size="lg"
            block
          />
        </Card>

        <SectionHeader title="Share publicly" subtitle="Help others discover us" />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <ExternalTile
            icon="logo-google"
            label="Google Maps"
            sublabel="Leave a review"
            tint="#EA4335"
            bg="#FEE2E2"
            onPress={() => Linking.openURL(GOOGLE_MAPS_URL)}
          />
          <ExternalTile
            icon="logo-instagram"
            label="Instagram"
            sublabel="Follow us"
            tint="#C13584"
            bg="#FCE7F3"
            onPress={() => Linking.openURL(INSTAGRAM_URL)}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function ExternalTile({
  icon,
  label,
  sublabel,
  tint,
  bg,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  tint: string;
  bg: string;
  onPress: () => void;
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
        gap: space.sm,
        alignItems: 'flex-start',
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
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text
        style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
      >
        {label}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
        {sublabel}
      </Text>
    </Pressable>
  );
}
