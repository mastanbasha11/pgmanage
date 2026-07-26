/**
 * Get help — pick a topic, describe the issue, submit. Posts a complaint to the
 * PG's maintenance queue. Shows the resident's existing requests below.
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, space } from '../../lib/theme';
import { useRaiseComplaint, useTenantTickets } from '../../lib/tenant/hooks';
import { TScreen, TAppBar, TCard, TButton, TPill, Cap } from '../../components/tenant-ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TOPICS: { key: string; label: string; icon: IconName }[] = [
  { key: 'CLEANLINESS', label: 'Cleaning', icon: 'sparkles-outline' },
  { key: 'MAINTENANCE', label: 'Repairs', icon: 'construct-outline' },
  { key: 'FOOD', label: 'Food', icon: 'restaurant-outline' },
  { key: 'NOISE', label: 'Noise', icon: 'volume-high-outline' },
  { key: 'SECURITY', label: 'Security', icon: 'shield-checkmark-outline' },
  { key: 'OTHER', label: 'Something else', icon: 'ellipsis-horizontal' },
];

export default function TenantHelp() {
  const router = useRouter();
  const [category, setCategory] = useState('MAINTENANCE');
  const [text, setText] = useState('');
  const raise = useRaiseComplaint();
  const tickets = useTenantTickets();

  const open = (tickets.data ?? []).filter((t) => t.status !== 'resolved');

  function submit() {
    const description = text.trim();
    if (description.length < 4) {
      Alert.alert('Add a little detail', 'Describe the issue so the manager can help.');
      return;
    }
    raise.mutate(
      { category, description },
      {
        onSuccess: () => {
          setText('');
          Alert.alert('Request sent', 'The manager has been notified. You can track it here.');
        },
        onError: () => Alert.alert('Could not send', 'Please try again in a moment.'),
      },
    );
  }

  return (
    <TScreen>
      <TAppBar
        title="Get help"
        sub="most issues fixed within 24h"
        onBack={() => router.back()}
      />

      <Cap>PICK A TOPIC</Cap>
      <View style={styles.grid}>
        {TOPICS.map((topic) => {
          const on = category === topic.key;
          return (
            <TouchableOpacity
              key={topic.key}
              style={[styles.topic, on && styles.topicOn]}
              activeOpacity={0.8}
              onPress={() => setCategory(topic.key)}
            >
              <Ionicons name={topic.icon} size={18} color={on ? '#fff' : colors.forest} />
              <Text style={[styles.topicLabel, on && { color: '#fff' }]}>{topic.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Cap>DESCRIBE IT</Cap>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder='e.g. "AC not cooling in room"'
        placeholderTextColor={colors.textDim}
        multiline
      />
      <TButton
        label={raise.isPending ? 'Sending…' : 'Send request'}
        variant="dark"
        icon="paper-plane-outline"
        style={{ marginTop: space.md }}
        disabled={raise.isPending}
        onPress={submit}
      />

      {open.length > 0 && (
        <>
          <Cap>YOUR OPEN REQUESTS</Cap>
          <TCard style={{ paddingVertical: 4 }}>
            {open.map((t, i) => (
              <View
                key={t.id}
                style={[styles.reqRow, i === open.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.reqTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.reqSub}>{t.status.replace('_', ' ')}</Text>
                </View>
                <TPill label={t.status === 'in_progress' ? 'in progress' : 'received'} tone="warm" />
              </View>
            ))}
          </TCard>
        </>
      )}
    </TScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  topic: {
    width: '31.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  topicOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  topicLabel: { fontSize: 11, fontWeight: '700', color: colors.text },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 13,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  reqTitle: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  reqSub: { fontSize: 11, color: colors.textDim, marginTop: 1, textTransform: 'capitalize' },
});
