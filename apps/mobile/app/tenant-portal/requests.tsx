/**
 * My requests — the resident's maintenance tickets with status, progress, and
 * an expandable timeline. Filter All / Open / Closed. New request → Get help.
 */
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, space } from '../../lib/theme';
import { useTenantTickets } from '../../lib/tenant/hooks';
import { TScreen, TAppBar, TCard, TPill, TIconBtn, TBar } from '../../components/tenant-ui';
import type { Ticket, TicketStatus } from '../../lib/tenant/types';

const PROGRESS: Record<TicketStatus, number> = {
  raised: 15,
  assigned: 40,
  in_progress: 65,
  reopened: 30,
  resolved: 100,
};

function statusPill(s: TicketStatus): { label: string; tone: 'money' | 'warm' | 'sage' } {
  if (s === 'resolved') return { label: 'resolved', tone: 'money' };
  if (s === 'raised') return { label: 'received', tone: 'sage' };
  return { label: s.replace('_', ' '), tone: 'warm' };
}

function fmt(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

type Filter = 'all' | 'open' | 'closed';

export default function TenantRequests() {
  const router = useRouter();
  const tickets = useTenantTickets();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const all = tickets.data ?? [];
  const rows = all.filter((t) =>
    filter === 'all' ? true : filter === 'open' ? t.status !== 'resolved' : t.status === 'resolved',
  );

  return (
    <TScreen>
      <TAppBar
        title="My requests"
        sub={`${all.length} total · ${all.filter((t) => t.status !== 'resolved').length} open`}
        onBack={() => router.back()}
        right={<TIconBtn icon="add" onPress={() => router.push('/tenant-portal/help')} />}
      />

      <View style={styles.seg}>
        {(['all', 'open', 'closed'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.segItem, filter === f && styles.segOn]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segText, filter === f && { color: colors.forest }]}>
              {f[0].toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {rows.length === 0 ? (
        <TCard variant="tint" style={{ marginTop: space.md, alignItems: 'center', paddingVertical: 26 }}>
          <Ionicons name="checkmark-done-outline" size={26} color={colors.textMuted} />
          <Text style={styles.empty}>Nothing here — you're all clear.</Text>
        </TCard>
      ) : (
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {rows.map((t) => (
            <TicketCard
              key={t.id}
              t={t}
              open={open === t.id}
              onToggle={() => setOpen((c) => (c === t.id ? null : t.id))}
            />
          ))}
        </View>
      )}
    </TScreen>
  );
}

function TicketCard({ t, open, onToggle }: { t: Ticket; open: boolean; onToggle: () => void }) {
  const pill = statusPill(t.status);
  const pct = PROGRESS[t.status] ?? 15;
  const hasTimeline = (t.timeline ?? []).length > 0;
  return (
    <TCard>
      <TouchableOpacity activeOpacity={hasTimeline ? 0.7 : 1} onPress={hasTimeline ? onToggle : undefined}>
        <View style={styles.between}>
          <Text style={styles.title} numberOfLines={1}>{t.title}</Text>
          <TPill label={pill.label} tone={pill.tone} />
        </View>
        <Text style={styles.sub} numberOfLines={open ? undefined : 1}>
          {t.description || t.category}
        </Text>
        <View style={{ marginTop: 9 }}>
          <TBar pct={pct} color={t.status === 'resolved' ? colors.money : colors.warn} />
        </View>
      </TouchableOpacity>

      {open && hasTimeline && (
        <View style={styles.timeline}>
          {t.timeline.map((ev, i) => (
            <View key={i} style={styles.tlRow}>
              <View style={styles.tlDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tlStatus}>{ev.status.replace('_', ' ')}</Text>
                {!!ev.note && <Text style={styles.tlNote}>{ev.note}</Text>}
              </View>
              <Text style={styles.tlDate}>{fmt(ev.at)}</Text>
            </View>
          ))}
        </View>
      )}
    </TCard>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  seg: {
    flexDirection: 'row',
    backgroundColor: colors.sage2,
    borderRadius: 12,
    padding: 3,
    gap: 2,
    marginTop: space.xs,
  },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segOn: { backgroundColor: colors.surface },
  segText: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'capitalize' },
  empty: { fontSize: 12.5, color: colors.textMuted, marginTop: 10 },
  title: { fontSize: 13, fontWeight: '800', color: colors.text, flex: 1 },
  sub: { fontSize: 11.5, color: colors.textDim, marginTop: 3, lineHeight: 17 },
  timeline: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: 10 },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  tlDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.forest, marginTop: 3 },
  tlStatus: { fontSize: 12, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  tlNote: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  tlDate: { fontSize: 10.5, color: colors.textDim },
});
