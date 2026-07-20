/**
 * Message log — outbound notification feed, grouped into per-recipient
 * sequences so an owner sees "who did we chase, and did it land?" rather than a
 * flat list of rows.
 *
 * Backend: GET /notifications (OWNER/PARTNER only — 403 renders an empty state).
 * `delivery_status` carries the Meta callback state (sent|delivered|read|failed);
 * inbound replies are stored with template_name LIKE 'inbound:%' — that is what
 * powers the "Replied" filter.
 *
 * There is no server-side resend endpoint, so "Retry" opens the recipient's
 * WhatsApp chat (the same action the old per-row WhatsApp button performed).
 */
import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../lib/api';
import { colors, space } from '../lib/theme';
import { Avatar, Chip, ChipStrip, Empty, Header, IconButton, Loading, Row, Screen } from '../components/ui';
import { KpiTile, Pill, type PillTone } from '../components/redesign';

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

type Filter = 'ALL' | 'FAILED' | 'REPLIED' | 'SCHEDULED' | 'WHATSAPP';

interface Sequence {
  key: string;
  name: string;
  room: string | null;
  phoneDigits: string;
  attempts: NotificationRow[];
  /** Worst-case state across the sequence — drives the header pill. */
  state: 'FAILED' | 'REPLIED' | 'SCHEDULED' | 'SENT';
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REPLIED', label: 'Replied' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
];

const isInbound = (r: NotificationRow) => (r.template_name ?? '').startsWith('inbound:');

/** Per-attempt chip label: prefer the carrier callback over our own status. */
function attemptState(r: NotificationRow): { label: string; tone: PillTone } {
  if (isInbound(r)) return { label: 'Replied', tone: 'v' };
  const d = (r.delivery_status ?? '').toLowerCase();
  if (r.status === 'FAILED' || d === 'failed') return { label: 'Failed', tone: 'r' };
  if (d === 'read') return { label: 'Read', tone: 'g' };
  if (d === 'delivered') return { label: 'Delivered', tone: 'g' };
  if (r.status === 'PENDING') return { label: 'Scheduled', tone: 'a' };
  return { label: 'Sent', tone: 's' };
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function MessageLogScreen() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  const { data, isLoading, isRefetching, refetch, error } = useQuery<{
    items: NotificationRow[];
    total: number;
  }>({
    queryKey: ['message-log-mobile'],
    queryFn: () => api.get('/notifications', { params: { page_size: 200 } }).then((r) => r.data),
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const isForbidden = (error as { response?: { status?: number } })?.response?.status === 403;

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const outbound = items.filter((r) => !isInbound(r));
    const landed = outbound.filter((r) => {
      const d = (r.delivery_status ?? '').toLowerCase();
      return d === 'delivered' || d === 'read';
    }).length;
    const failedToday = outbound.filter(
      (r) =>
        (r.status === 'FAILED' || (r.delivery_status ?? '').toLowerCase() === 'failed') &&
        isToday(r.sent_at ?? r.created_at),
    ).length;
    const pct = outbound.length ? Math.round((landed / outbound.length) * 100) : 0;
    return { pct, landed, total: outbound.length, failedToday };
  }, [items]);

  // ── Group into per-recipient sequences ─────────────────────────────────────
  const sequences = useMemo(() => {
    const byKey = new Map<string, Sequence>();
    for (const r of items) {
      const phoneDigits = (r.tenant_phone ?? r.recipient_phone ?? '').replace(/\D/g, '');
      const key = phoneDigits || r.tenant_name || r.id;
      let seq = byKey.get(key);
      if (!seq) {
        seq = {
          key,
          name: r.tenant_name ?? r.recipient_phone ?? 'Unknown',
          room: r.room_number,
          phoneDigits,
          attempts: [],
          state: 'SENT',
        };
        byKey.set(key, seq);
      }
      seq.attempts.push(r);
      if (!seq.room && r.room_number) seq.room = r.room_number;
    }

    const out: Sequence[] = [];
    byKey.forEach((seq) => {
      seq.attempts.sort(
        (a, b) =>
          new Date(b.sent_at ?? b.created_at ?? 0).getTime() -
          new Date(a.sent_at ?? a.created_at ?? 0).getTime(),
      );
      const states = seq.attempts.map(attemptState);
      seq.state = states.some((s) => s.label === 'Failed')
        ? 'FAILED'
        : states.some((s) => s.label === 'Replied')
          ? 'REPLIED'
          : states.some((s) => s.label === 'Scheduled')
            ? 'SCHEDULED'
            : 'SENT';
      out.push(seq);
    });

    out.sort(
      (a, b) =>
        new Date(b.attempts[0]?.sent_at ?? b.attempts[0]?.created_at ?? 0).getTime() -
        new Date(a.attempts[0]?.sent_at ?? a.attempts[0]?.created_at ?? 0).getTime(),
    );
    return out;
  }, [items]);

  const shown = useMemo(() => {
    switch (filter) {
      case 'FAILED':
        return sequences.filter((s) => s.state === 'FAILED');
      case 'REPLIED':
        return sequences.filter((s) => s.state === 'REPLIED');
      case 'SCHEDULED':
        return sequences.filter((s) => s.state === 'SCHEDULED');
      case 'WHATSAPP':
        return sequences.filter((s) => s.attempts.some((a) => a.channel === 'WHATSAPP'));
      default:
        return sequences;
    }
  }, [sequences, filter]);

  const counts = useMemo(
    () => ({
      ALL: sequences.length,
      FAILED: sequences.filter((s) => s.state === 'FAILED').length,
      REPLIED: sequences.filter((s) => s.state === 'REPLIED').length,
      SCHEDULED: sequences.filter((s) => s.state === 'SCHEDULED').length,
      WHATSAPP: sequences.filter((s) => s.attempts.some((a) => a.channel === 'WHATSAPP')).length,
    }),
    [sequences],
  );

  const openChat = (digits: string) => {
    if (!digits) return;
    Linking.openURL(`https://wa.me/${digits}`).catch(() => {});
  };

  return (
    <Screen padded={false}>
      <View style={styles.headerWrap}>
        <IconButton name="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Header title="Message log" subtitle={`${data?.total ?? 0} recent messages`} />
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
          data={shown}
          keyExtractor={(seq) => seq.key}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: space.md }}>
              <Row gap={space.sm} align="stretch" style={{ marginBottom: space.md }}>
                <KpiTile
                  label="Delivered"
                  value={`${kpis.pct}%`}
                  foot={`${kpis.landed} of ${kpis.total} landed`}
                />
                <KpiTile
                  label="Failed today"
                  value={kpis.failedToday}
                  tone="danger"
                  foot="needs action"
                />
              </Row>
              <ChipStrip>
                {FILTERS.map((f) => (
                  <Chip
                    key={f.value}
                    label={f.label}
                    active={filter === f.value}
                    count={counts[f.value]}
                    onPress={() => setFilter(f.value)}
                  />
                ))}
              </ChipStrip>
            </View>
          }
          renderItem={({ item }) => (
            <SequenceCard
              seq={item}
              expandedId={expanded}
              onToggle={(id) => setExpanded(expanded === id ? null : id)}
              onRetry={() => openChat(item.phoneDigits)}
            />
          )}
          ListEmptyComponent={
            <Empty
              iconName="chatbubbles-outline"
              title="Nothing here"
              hint="Rent reminders and overdue notices show up here once sent."
            />
          }
        />
      )}
    </Screen>
  );
}

function SequenceCard({
  seq,
  expandedId,
  onToggle,
  onRetry,
}: {
  seq: Sequence;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onRetry: () => void;
}) {
  const headPill: { label: string; tone: PillTone } =
    seq.state === 'FAILED'
      ? { label: 'Failed', tone: 'r' }
      : seq.state === 'REPLIED'
        ? { label: 'Replied', tone: 'g' }
        : seq.state === 'SCHEDULED'
          ? { label: 'Scheduled', tone: 'a' }
          : { label: 'Sent', tone: 's' };

  return (
    <View style={styles.card}>
      <Row gap={space.md} align="center">
        <Avatar name={seq.name} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {seq.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {seq.room ? `Room ${seq.room} · ` : ''}
            {seq.attempts.length} message{seq.attempts.length === 1 ? '' : 's'}
          </Text>
        </View>
        <Pill label={headPill.label} tone={headPill.tone} dot />
      </Row>

      {/* per-attempt strip */}
      <View style={styles.attempts}>
        {seq.attempts.map((a) => {
          const st = attemptState(a);
          const open = expandedId === a.id;
          return (
            <Pressable
              key={a.id}
              onPress={() => onToggle(a.id)}
              android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
              style={styles.attemptRow}
            >
              <View style={styles.attemptHead}>
                <Pill label={st.label} tone={st.tone} />
                <Text style={styles.attemptMeta} numberOfLines={1}>
                  {a.template_name ?? '—'} · {fmtWhen(a.sent_at ?? a.created_at)}
                </Text>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.textDim}
                />
              </View>
              {open && !!(a.rendered_message || a.message_body) && (
                <Text style={styles.body}>{a.rendered_message ?? a.message_body}</Text>
              )}
              {open && !!a.error_message && (
                <Text style={styles.error}>Error: {a.error_message}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {seq.state === 'FAILED' && !!seq.phoneDigits && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={`Retry ${seq.name} on WhatsApp`}
          android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
          style={styles.retry}
        >
          <Ionicons name="logo-whatsapp" size={15} color="#25D366" />
          <Text style={styles.retryText}>Retry on WhatsApp</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    padding: space.lg,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: space.sm,
  },
  name: { fontSize: 14, fontWeight: '800', color: colors.text },
  meta: { fontSize: 10.5, fontWeight: '600', color: colors.textDim, marginTop: 2 },

  attempts: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  attemptRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  attemptHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  attemptMeta: { flex: 1, fontSize: 10.5, fontWeight: '600', color: colors.textMuted },
  body: { marginTop: 6, fontSize: 12.5, color: colors.text, lineHeight: 18 },
  error: { marginTop: 4, fontSize: 11, fontWeight: '600', color: colors.danger },

  retry: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  retryText: { fontSize: 12, fontWeight: '800', color: colors.text },
});
