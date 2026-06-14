/**
 * Raise a new ticket. Pre-fills category from the route param the
 * Services tab passes through.
 */
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Field, Screen, toast } from '../../components/ui';
import { useTheme } from '../../lib/theme';

export default function NewTicketScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; categoryLabel?: string }>();
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (title.trim().length < 4 || description.trim().length < 10) {
      Alert.alert(
        'A bit more detail?',
        'Give the ticket a short title and a couple of sentences describing the issue.',
      );
      return;
    }
    setSubmitting(true);
    // Mock — real wiring to POST /tenant/complaints lives in the cutover phase.
    await new Promise((r) => setTimeout(r, 400));
    setSubmitting(false);
    toast.success('Ticket raised');
    router.back();
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'New ticket',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Card variant="flat" style={{ marginTop: space.md, marginBottom: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Ionicons name="construct" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: colors.textMuted, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.semibold }}
              >
                Category
              </Text>
              <Text
                style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
              >
                {params.categoryLabel ?? 'Other'}
              </Text>
            </View>
          </View>
        </Card>

        <Field
          label="What's the issue?"
          value={title}
          onChangeText={setTitle}
          placeholder="Short title (e.g. Wi-Fi dropping in the evening)"
          maxLength={120}
          required
        />

        <Field
          label="Describe in detail"
          value={description}
          onChangeText={setDescription}
          placeholder="When it happens, what you’ve tried, anything else useful."
          multiline
          numberOfLines={5}
          style={{ minHeight: 120 }}
          required
        />

        <View style={{ height: space.lg }} />

        <Button
          label={submitting ? 'Sending…' : 'Raise ticket'}
          onPress={submit}
          loading={submitting}
          iconName="paper-plane"
          size="lg"
          block
        />
      </ScrollView>
    </Screen>
  );
}
