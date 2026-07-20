/**
 * Audit log — filterable list. OWNER / PARTNER only.
 *
 * RESTYLE ONLY: the feature set and the (currently filter-less) data wiring are
 * deliberately unchanged. What changed is presentation —
 *   - a 3px left border per entry, coloured by entity type
 *   - a "Sensitive" pill on money / access / deletion events
 *   - a before→after diff block for entries whose metadata carries one
 *   - the per-staff summary rendered as rows instead of a JSON dump
 *
 * Field names match apps/backend/app/api/v1/audit_logs.py `_serialize`:
 * event_type / event_category / entity_type / entity_name / actor_name /
 * description / metadata.
 */
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, Header, Card, Loading, Empty, Row, Section, formatDateHuman } from '../../components/ui';
import { Pill, type PillTone } from '../../components/redesign';
import { useAuditLogs, useAuditSummary } from '../../lib/hooks/misc';
import { colors, space } from '../../lib/theme';

interface AuditEntry {
  id: string;
  created_at?: string;
  actor_name?: string | null;
  actor_role?: string | null;
  actor_user_id?: string | null;
  event_type?: string | null;
  event_category?: string | null;
  description?: string | null;
  entity_type?: string | null;
  entity_name?: string | null;
  property_name?: string | null;
  tenant_name?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface SummaryRow {
  user_id: string;
  user_name?: string | null;
  role?: string | null;
  event_count: number;
  last_active?: string | null;
}

/** Left-rail colour per entity type — a scannable spine down the list. */
function entityColor(entity?: string | null): string {
  const e = (entity || '').toUpperCase();
  if (e.includes('PAYMENT') || e.includes('REFUND') || e.includes('LEDGER')) return colors.success;
  if (e.includes('EXPENSE')) return colors.warn;
  if (e.includes('TENANT') || e.includes('RESIDENT')) return colors.info;
  if (e.includes('USER') || e.includes('STAFF') || e.includes('AUTH')) return colors.purple;
  if (e.includes('BED') || e.includes('ROOM') || e.includes('PROPERTY')) return colors.accent;
  if (e.includes('BOOKING') || e.includes('LEAD')) return colors.pink;
  return colors.neutralLine;
}

function categoryTone(category?: string | null): PillTone {
  const c = (category || '').toUpperCase();
  if (c.includes('DELETE') || c.includes('SECURITY')) return 'r';
  if (c.includes('MONEY') || c.includes('PAYMENT') || c.includes('FINANC')) return 'g';
  if (c.includes('AUTH') || c.includes('ACCESS')) return 'v';
  if (c.includes('UPDATE') || c.includes('EDIT')) return 'a';
  return 's';
}

/** Events an owner would want to spot instantly in a scroll. */
function isSensitive(it: AuditEntry): boolean {
  const hay = `${it.event_type ?? ''} ${it.event_category ?? ''} ${it.entity_type ?? ''}`.toUpperCase();
  return /DELETE|REFUND|ROLE|PERMISSION|PASSWORD|LOGIN|EXPORT|DISCOUNT|WAIVE/.test(hay);
}

/** Pull a before→after pair out of the free-form metadata blob, if present. */
function diffOf(meta?: Record<string, unknown> | null): { before: unknown; after: unknown } | null {
  if (!meta) return null;
  const before = meta.before ?? meta.old ?? meta.old_value ?? meta.previous;
  const after = meta.after ?? meta.new ?? meta.new_value ?? meta.current;
  if (before === undefined && after === undefined) return null;
  return { before, after };
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function AuditLogPage() {
  const router = useRouter();
  const logs = useAuditLogs();
  const summary = useAuditSummary();

  const items: AuditEntry[] = logs.data?.items ?? [];
  const staff: SummaryRow[] = Array.isArray(summary.data) ? summary.data : [];

  return (
    <Screen>
      <Header
        title="Audit log"
        subtitle={`${items.length} recent entries`}
        onBack={() => router.back()}
      />
      {logs.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.xxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={logs.isRefetching}
              onRefresh={logs.refetch}
              tintColor={colors.accent}
            />
          }
        >
          {staff.length > 0 && (
            <Section title="Who's been active (30 days)">
              <Card style={styles.summaryCard}>
                {staff.map((s, i) => (
                  <View
                    key={s.user_id}
                    style={[styles.summaryRow, i === staff.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.summaryName} numberOfLines={1}>
                        {s.user_name ?? 'Unknown'}
                      </Text>
                      <Text style={styles.summaryMeta} numberOfLines={1}>
                        {(s.role ?? '—').toLowerCase()} · last {formatDateHuman(s.last_active)}
                      </Text>
                    </View>
                    <Text style={styles.summaryCount}>{s.event_count}</Text>
                  </View>
                ))}
              </Card>
            </Section>
          )}

          {items.length === 0 ? (
            <Empty title="Nothing logged yet" iconName="document-text-outline" />
          ) : (
            items.map((it) => {
              const diff = diffOf(it.metadata);
              const rail = entityColor(it.entity_type);
              return (
                <Card key={it.id} style={{ ...styles.entry, borderLeftColor: rail }}>
                  <Row justify="space-between" align="flex-start" gap={space.sm}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.title} numberOfLines={2}>
                        {it.description || it.event_type || 'activity'}
                      </Text>
                      <Text style={styles.meta} numberOfLines={2}>
                        {it.entity_name || it.entity_type || '—'} ·{' '}
                        {it.actor_name ?? 'system'} · {formatDateHuman(it.created_at)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Pill
                        label={(it.event_category || it.entity_type || '—').toLowerCase()}
                        tone={categoryTone(it.event_category)}
                      />
                      {isSensitive(it) && <Pill label="Sensitive" tone="r" dot />}
                    </View>
                  </Row>

                  {diff && (
                    <View style={styles.diff}>
                      <View style={styles.diffLine}>
                        <Text style={styles.diffLabel}>before</Text>
                        <Text style={styles.diffBefore} numberOfLines={2}>
                          {show(diff.before)}
                        </Text>
                      </View>
                      <View style={styles.diffLine}>
                        <Text style={styles.diffLabel}>after</Text>
                        <Text style={styles.diffAfter} numberOfLines={2}>
                          {show(diff.after)}
                        </Text>
                      </View>
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: { padding: 0 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  summaryName: { fontSize: 13, fontWeight: '800', color: colors.text },
  summaryMeta: { fontSize: 10.5, fontWeight: '600', color: colors.textDim, marginTop: 2 },
  summaryCount: { fontSize: 15, fontWeight: '800', color: colors.text },

  entry: {
    marginBottom: space.sm,
    padding: 12,
    borderLeftWidth: 3,
  },
  title: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  meta: { fontSize: 10.5, color: colors.textMuted, fontWeight: '600', marginTop: 3 },

  diff: {
    marginTop: 10,
    backgroundColor: '#fbfcfe',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    padding: 9,
    gap: 4,
  },
  diffLine: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  diffLabel: {
    width: 44,
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.textDim,
    textTransform: 'uppercase',
    paddingTop: 1,
  },
  diffBefore: { flex: 1, fontSize: 11.5, fontWeight: '600', color: colors.danger },
  diffAfter: { flex: 1, fontSize: 11.5, fontWeight: '700', color: colors.success },
});
