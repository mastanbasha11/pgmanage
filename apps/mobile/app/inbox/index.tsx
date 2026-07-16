/**
 * Inbox — unified resident-event feed (complaints, notice-to-vacate, KYC
 * updates, feedback, payment queries). Mark-read and mark-all-read supported.
 */
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Screen,
  Header,
  Card,
  Loading,
  Empty,
  Button,
  Row,
  StatusPill,
  IconButton,
  rupees,
  formatDateHuman,
} from '../../components/ui';
import {
  useInbox,
  useInboxUnreadCount,
  useMarkAllInboxRead,
  useMarkInboxRead,
  type InboxItem,
  type InboxItemKind,
} from '../../lib/hooks/misc';
import { useAppStore } from '../../lib/store';
import { colors, radius, space, type as fontSize } from '../../lib/theme';

const KIND_META: Record<InboxItemKind, { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; tone: 'info' | 'warn' | 'accent' | 'neutral' | 'danger' }> = {
  COMPLAINT: { icon: 'alert-circle-outline', label: 'Complaint', tone: 'danger' },
  NOTICE_TO_VACATE: { icon: 'calendar-outline', label: 'Notice', tone: 'warn' },
  KYC_UPDATE: { icon: 'card-outline', label: 'KYC', tone: 'info' },
  FEEDBACK: { icon: 'chatbox-outline', label: 'Feedback', tone: 'accent' },
  PAYMENT_QUERY: { icon: 'cash-outline', label: 'Payment', tone: 'neutral' },
};

export default function InboxPage() {
  const router = useRouter();
  const { selectedPropertyId } = useAppStore();
  const q = useInbox({ property_id: selectedPropertyId ?? undefined });
  const unread = useInboxUnreadCount();
  const markRead = useMarkInboxRead();
  const markAll = useMarkAllInboxRead();

  const items = q.data?.items ?? [];

  return (
    <Screen>
      <Header
        title="Inbox"
        subtitle={
          unread.data?.count ? `${unread.data.count} unread` : 'Tenant-initiated events'
        }
        onBack={() => router.back()}
        right={
          items.some((i) => !i.read) ? (
            <IconButton
              name="checkmark-done"
              accessibilityLabel="Mark all read"
              onPress={() => markAll.mutate()}
            />
          ) : undefined
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty
          title="Nothing new"
          hint="Tenant complaints, notices and KYC updates will show up here."
          iconName="mail-open-outline"
        />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.accent} />
          }
        >
          {items.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              onOpen={() => {
                if (!item.read) markRead.mutate(item.id);
                if (item.tenant_id) {
                  router.push({ pathname: '/residents/[id]', params: { id: item.tenant_id } });
                }
              }}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function InboxRow({ item, onOpen }: { item: InboxItem; onOpen: () => void }) {
  const meta = KIND_META[item.kind];
  return (
    <Card onPress={onOpen} style={{ ...styles.row, opacity: item.read ? 0.7 : 1 }}>
      <View style={[styles.iconBox, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name={meta.icon} size={22} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.hint} numberOfLines={2}>
              {item.tenant_name ? `${item.tenant_name} · ` : ''}
              {formatDateHuman(item.created_at)}
            </Text>
          </View>
          {!item.read && <View style={styles.unreadDot} />}
        </Row>
        <Row gap={space.xs} style={{ marginTop: space.xs }}>
          <StatusPill label={meta.label} tone={meta.tone} />
        </Row>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginBottom: space.sm,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  hint: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginLeft: space.sm,
    marginTop: 6,
  },
});
