/**
 * Services tab — recent tickets + category grid to raise a new one.
 *
 * Matches the Stanza-style layout you shared: a top "Recent tickets"
 * area with OPEN/CLOSED status chips, followed by a 3-column category
 * grid. Tapping a category pushes /tickets/new?category=...
 */
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import {
  Card,
  Empty,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  SkeletonLines,
} from '../../components/ui';
import { useTickets } from '../../lib/data/hooks';
import type { Ticket, TicketCategory, TicketStatus } from '../../lib/data/types';
import { useTheme } from '../../lib/theme';

const CATEGORIES: { value: TicketCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'housekeeping', label: 'Housekeeping', icon: 'sparkles' },
  { value: 'cleaning', label: 'Cleaning', icon: 'water' },
  { value: 'laundry', label: 'Laundry', icon: 'shirt' },
  { value: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
  { value: 'electrical', label: 'Electrical', icon: 'flash' },
  { value: 'plumbing', label: 'Plumbing', icon: 'water-outline' },
  { value: 'other', label: 'Repair & Maintenance', icon: 'construct' },
  { value: 'other', label: 'Security', icon: 'shield-checkmark' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const STATUS_TONE: Record<TicketStatus, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  raised: 'warning',
  assigned: 'info',
  in_progress: 'info',
  resolved: 'success',
  reopened: 'warning',
};

export default function ServicesScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const ticketsQ = useTickets();
  const [refreshing, setRefreshing] = useState(false);

  const tickets = ticketsQ.data ?? [];
  const recent = tickets.slice(0, 5);

  async function onRefresh() {
    setRefreshing(true);
    await ticketsQ.refetch();
    setRefreshing(false);
  }

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <View style={{ marginTop: space.md, marginBottom: space.lg }}>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h1,
              lineHeight: lineHeight.h1,
              fontWeight: fontWeight.extrabold,
            }}
          >
            Services
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.body, marginTop: 2 }}>
            Raise issues, track tickets
          </Text>
        </View>

        {/* Recent tickets */}
        <SectionHeader title="Recent tickets" subtitle="Your recently raised tickets" />
        {ticketsQ.isLoading ? (
          <SkeletonLines count={3} />
        ) : recent.length === 0 ? (
          <Empty
            iconName="ticket"
            title="No tickets yet"
            message="Tap a category below to raise your first one."
          />
        ) : (
          <View style={{ gap: space.md }}>
            {recent.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                onPress={() => router.push(`/tickets/${t.id}`)}
              />
            ))}
          </View>
        )}

        {/* Category grid */}
        <SectionHeader
          title="Complaint category"
          subtitle="Choose a category you need help with"
        />
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: space.md,
          }}
        >
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.label}
              onPress={() =>
                router.push({
                  pathname: '/tickets/new',
                  params: { category: c.value, categoryLabel: c.label },
                })
              }
              style={{
                flexBasis: '30%',
                flexGrow: 1,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius.lg,
                padding: space.lg,
                alignItems: 'center',
                gap: space.sm,
                minHeight: 100,
                justifyContent: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel={`Raise ${c.label} ticket`}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={c.icon} size={20} color={colors.accent} />
              </View>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.small,
                  fontWeight: fontWeight.semibold,
                  textAlign: 'center',
                }}
                numberOfLines={2}
              >
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress: () => void }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  const isOpen = !['resolved'].includes(ticket.status);
  return (
    <Card onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: space.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.caption,
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontWeight: fontWeight.semibold,
            }}
          >
            {ticket.category.replace(/_/g, ' ')}
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.body,
              fontWeight: fontWeight.bold,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {ticket.title}
          </Text>
          <Text
            style={{ color: colors.textDim, fontSize: fontSize.caption, marginTop: space.sm }}
          >
            ID {ticket.id.slice(0, 8).toUpperCase()} · Created{' '}
            {format(parseISO(ticket.createdAt), 'd MMM yy')}
          </Text>
        </View>
        <Pill
          label={isOpen ? 'Open' : 'Closed'}
          tone={isOpen ? 'warning' : 'success'}
          size="sm"
        />
      </View>
    </Card>
  );
}
