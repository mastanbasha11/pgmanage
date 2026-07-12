/**
 * WA Message Log — read-only feed of outbound WhatsApp notifications.
 *
 * Mirrors the web /settings/messages page, scoped to WhatsApp only by
 * default (the mobile use-case is chasing tenants). Backend endpoint is
 * OWNER/PARTNER only (returns 403 otherwise) — the screen renders an
 * empty state for lower roles.
 *
 * Tap a row to expand the rendered message body; use the small WhatsApp
 * button on the row to open the recipient's chat for a follow-up.
 */
import { useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../lib/api';
import { colors, radius, space, type as fontSize } from '../lib/theme';
import { Card, Empty, Header, IconButton, Loading, Screen, StatusPill } from '../components/ui';

interface NotificationRow {
  id: string;
  created_at: string | null;
  sent_at: string | null;
  channel: string;
  template_name: string | null;
  message_body: string | null;
  rendered_message: string | null;
  status: 'SENT' | 'FAILED' | 'PENDING';
  delivery_status: string | null;
  delivered_at: string | null;
  error_message: string | null;
  recipient_phone: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  property_name: string | null;
  room_number: string | null;
}

function statusTone(s: NotificationRow['status']): 'success' | 'warn' | 'danger' {
  if (s === 'SENT') return 'success';
  if (s === 'FAILED') return 'danger';
  return 'warn';
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageLogScreen() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isRefetching, refetch, error } = useQuery<{
    items: NotificationRow[];
    total: number;
  }>({
    queryKey: ['message-log-mobile'],
    queryFn: () =>
      api
        .get('/notifications', {
          params: { channel: 'WHATSAPP', page_size: 100 },
        })
        .then((r) => r.data),
  });

  const items = data?.items ?? [];
  const isForbidden = (error as { response?: { status?: number } })?.response?.status === 403;

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: 0, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconButton name="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Header title="WA Message Log" subtitle={`${data?.total ?? 0} recent WhatsApp messages`} />
        </View>
      </View>

      {isLoading ? (
        <Loading />
      ) : isForbidden ? (
        <Empty
          iconName="lock-closed-outline"
          title="Owners only"
          hint="The message log is visible to owners and partners."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.md }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => {
            const isExpanded = expanded === item.id;
            const name = item.tenant_name ?? item.recipient_phone ?? 'Unknown';
            const when = fmtWhen(item.sent_at ?? item.created_at);
            const phoneDigits = (item.tenant_phone ?? item.recipient_phone ?? '').replace(/\D/g, '');
            return (
              <Card
                style={styles.row}
                onPress={() => setExpanded(isExpanded ? null : item.id)}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text style={styles.name} numberOfLines={1}>{name}</Text>
                    {item.room_number && (
                      <Text style={styles.room}>{item.room_number}</Text>
                    )}
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.template_name ?? '—'} · {when}
                  </Text>
                  {isExpanded && (item.rendered_message || item.message_body) && (
                    <Text style={styles.body}>
                      {item.rendered_message ?? item.message_body}
                    </Text>
                  )}
                  {isExpanded && item.error_message && (
                    <Text style={styles.error}>Error: {item.error_message}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                  <StatusPill label={item.status} tone={statusTone(item.status)} />
                  {phoneDigits && (
                    <Pressable
                      accessibilityLabel="Open WhatsApp with this contact"
                      hitSlop={8}
                      style={styles.waButton}
                      onPress={(ev) => {
                        ev.stopPropagation();
                        Linking.openURL(`https://wa.me/${phoneDigits}`).catch(() => {});
                      }}
                    >
                      <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                    </Pressable>
                  )}
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <Empty
              iconName="chatbubbles-outline"
              title="No WhatsApp messages yet"
              hint="Once you send rent reminders or overdue notices, they show up here."
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginBottom: space.sm,
  },
  name: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  room: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.accent,
    backgroundColor: 'rgba(13, 148, 136, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  meta: { fontSize: fontSize.caption, color: colors.textMuted },
  body: {
    marginTop: space.xs,
    fontSize: fontSize.body,
    color: colors.text,
    lineHeight: 20,
  },
  error: {
    marginTop: space.xs,
    fontSize: fontSize.caption,
    color: colors.danger,
  },
  waButton: {
    height: 30,
    width: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCFCE7',
  },
});
