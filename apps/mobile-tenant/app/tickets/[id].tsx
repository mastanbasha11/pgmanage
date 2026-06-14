/**
 * Ticket detail — the page that does what Stanza users complain about
 * not having: a full visible status timeline with timestamps and notes.
 * Plus rate / reopen on a resolved ticket.
 */
import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import {
  Button,
  Card,
  Pill,
  Pressable,
  Screen,
  toast,
} from '../../components/ui';
import { useTickets } from '../../lib/data/hooks';
import type { TicketStatus } from '../../lib/data/types';
import { useTheme } from '../../lib/theme';

const STATUS_LABEL: Record<TicketStatus, string> = {
  raised: 'Raised',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  reopened: 'Reopened',
};

const STATUS_TONE: Record<TicketStatus, 'warning' | 'info' | 'success'> = {
  raised: 'warning',
  assigned: 'info',
  in_progress: 'info',
  resolved: 'success',
  reopened: 'warning',
};

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const ticketsQ = useTickets();
  const ticket = useMemo(
    () => ticketsQ.data?.find((t) => t.id === id),
    [ticketsQ.data, id],
  );

  const [rating, setRating] = useState<number>(0);

  if (!ticket) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Ticket' }} />
        <View style={{ marginTop: 24 }}>
          <Text style={{ color: colors.textMuted }}>Ticket not found.</Text>
        </View>
      </Screen>
    );
  }

  function rate() {
    if (rating === 0) {
      Alert.alert('Pick a rating first', 'Tap a star to rate this resolution.');
      return;
    }
    toast.success(`Thanks for the ${rating}-star rating!`);
    router.back();
  }

  function reopen() {
    Alert.alert(
      'Reopen this ticket?',
      'We’ll mark it as reopened and re-notify the team.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          onPress: () => {
            toast.info('Ticket reopened');
            router.back();
          },
        },
      ],
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: ticket.category.replace(/_/g, ' '),
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Title + status */}
        <View style={{ marginBottom: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Pill
              label={STATUS_LABEL[ticket.status]}
              tone={STATUS_TONE[ticket.status]}
              size="sm"
            />
            <Text
              style={{ color: colors.textDim, fontSize: fontSize.caption }}
            >
              ID {ticket.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h2,
              lineHeight: lineHeight.h2,
              fontWeight: fontWeight.extrabold,
              marginTop: space.sm,
            }}
          >
            {ticket.title}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.body,
              lineHeight: lineHeight.body,
              marginTop: space.sm,
            }}
          >
            {ticket.description}
          </Text>
          <Text
            style={{ color: colors.textDim, fontSize: fontSize.small, marginTop: space.md }}
          >
            Raised {formatDistanceToNow(parseISO(ticket.createdAt))} ago
          </Text>
        </View>

        {/* Timeline */}
        <Card>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.small,
              fontWeight: fontWeight.bold,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: space.md,
            }}
          >
            Status timeline
          </Text>
          {ticket.timeline.map((event, i) => {
            const isLast = i === ticket.timeline.length - 1;
            return (
              <View
                key={i}
                style={{ flexDirection: 'row', gap: space.md }}
              >
                {/* dot + line */}
                <View style={{ alignItems: 'center', width: 24 }}>
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor:
                        i === ticket.timeline.length - 1
                          ? colors.accent
                          : colors.successFg,
                      marginTop: 2,
                    }}
                  />
                  {!isLast ? (
                    <View
                      style={{
                        flex: 1,
                        width: 2,
                        backgroundColor: colors.border,
                        marginTop: 2,
                      }}
                    />
                  ) : null}
                </View>
                <View
                  style={{
                    flex: 1,
                    paddingBottom: isLast ? 0 : space.lg,
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: fontSize.body,
                      fontWeight: fontWeight.bold,
                    }}
                  >
                    {STATUS_LABEL[event.status]}
                  </Text>
                  <Text
                    style={{ color: colors.textDim, fontSize: fontSize.caption, marginTop: 2 }}
                  >
                    {format(parseISO(event.at), 'd MMM yyyy, h:mm a')}
                  </Text>
                  {event.note ? (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: fontSize.small,
                        marginTop: space.xs,
                      }}
                    >
                      {event.note}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>

        {/* Resolution actions */}
        {ticket.status === 'resolved' ? (
          <Card style={{ marginTop: space.lg }}>
            <Text
              style={{
                color: colors.text,
                fontSize: fontSize.h3,
                fontWeight: fontWeight.bold,
              }}
            >
              How was the resolution?
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: fontSize.small,
                marginTop: 2,
                marginBottom: space.md,
              }}
            >
              Your feedback helps the team improve.
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setRating(n)}
                  hitSlop={4}
                  pressScale={0.92}
                >
                  <Ionicons
                    name={n <= rating ? 'star' : 'star-outline'}
                    size={32}
                    color={n <= rating ? colors.warningFg : colors.borderStrong}
                  />
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button label="Submit rating" onPress={rate} block />
            </View>
            <View style={{ height: space.sm }} />
            <Button label="Not really — reopen" onPress={reopen} variant="ghost" block />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
