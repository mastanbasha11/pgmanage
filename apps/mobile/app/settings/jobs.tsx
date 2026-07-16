/**
 * Job monitor — list of scheduled/background job runs. OWNER only.
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
  formatDateHuman,
} from '../../components/ui';
import { useJobRuns } from '../../lib/hooks/misc';
import { colors, space, type as fontSize } from '../../lib/theme';

export default function JobsPage() {
  const router = useRouter();
  const q = useJobRuns();
  const items = q.data?.items ?? [];

  return (
    <Screen>
      <Header title="Job monitor" subtitle={`${items.length} recent runs`} onBack={() => router.back()} />
      {q.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty title="No job runs" iconName="hardware-chip-outline" />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.xxl }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.accent} />}
        >
          {items.map((r: {
            id: string;
            job_name?: string;
            status?: string;
            started_at?: string;
            duration_ms?: number;
            error?: string;
          }) => {
            const tone =
              r.status === 'SUCCESS' ? 'success'
              : r.status === 'RUNNING' ? 'info'
              : r.status === 'FAILED' ? 'danger'
              : 'neutral';
            return (
              <Card key={r.id} style={{ marginBottom: space.sm }}>
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.job_name ?? 'job'}</Text>
                    <Text style={styles.meta}>
                      {formatDateHuman(r.started_at)}
                      {r.duration_ms ? ` · ${Math.round(r.duration_ms / 1000)}s` : ''}
                    </Text>
                    {!!r.error && (
                      <Text style={[styles.meta, { color: colors.danger, marginTop: 4 }]} numberOfLines={2}>
                        {r.error}
                      </Text>
                    )}
                  </View>
                  <StatusPill label={r.status ?? '—'} tone={tone} />
                </Row>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
});
