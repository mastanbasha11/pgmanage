/**
 * Audit log — filterable list. OWNER only.
 */
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Screen,
  Header,
  Card,
  Loading,
  Empty,
  Row,
  StatusPill,
  Section,
  formatDateHuman,
} from '../../components/ui';
import { useAuditLogs, useAuditSummary } from '../../lib/hooks/misc';
import { colors, space, type as fontSize } from '../../lib/theme';

export default function AuditLogPage() {
  const router = useRouter();
  const logs = useAuditLogs();
  const summary = useAuditSummary();

  const items = logs.data?.items ?? [];

  return (
    <Screen>
      <Header title="Audit log" subtitle={`${items.length} recent entries`} onBack={() => router.back()} />
      {logs.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.xxl }}
          refreshControl={<RefreshControl refreshing={logs.isRefetching} onRefresh={logs.refetch} tintColor={colors.accent} />}
        >
          {summary.data && (
            <Card style={{ marginBottom: space.md }}>
              <Text style={{ fontWeight: '700', color: colors.text, marginBottom: space.sm }}>Summary</Text>
              <Text style={{ fontSize: fontSize.small, color: colors.textMuted }}>
                {JSON.stringify(summary.data).slice(0, 200)}
              </Text>
            </Card>
          )}
          {items.length === 0 ? (
            <Empty title="Nothing logged yet" iconName="document-text-outline" />
          ) : (
            items.map((it: {
              id: string;
              action?: string;
              entity?: string;
              actor_name?: string;
              actor_id?: string;
              created_at?: string;
              details?: Record<string, unknown>;
            }) => (
              <Card key={it.id} style={{ marginBottom: space.sm }}>
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{it.action ?? 'action'}</Text>
                    <Text style={styles.meta}>
                      {it.entity ?? '—'} · {it.actor_name ?? it.actor_id ?? 'system'} · {formatDateHuman(it.created_at)}
                    </Text>
                  </View>
                  <StatusPill label={String(it.action ?? '').split('.')[0] ?? '—'} tone="neutral" />
                </Row>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
});
