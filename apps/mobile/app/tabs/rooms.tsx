/**
 * Rooms tab. Two sections: Available now + Upcoming vacancies (residents
 * who've given notice). Mirrors the web PropertyDetailPage layout but
 * compacted for phone.
 *
 * Bed/room colour spec (per product requirements):
 *   green  = vacant
 *   yellow = reserved
 *   teal   = occupied (brand)
 *   red    = maintenance
 */
import { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import {
  Card,
  Empty,
  Header,
  Loading,
  rupees,
  Screen,
  StatusPill,
} from '../../components/ui';

interface VacantBed {
  id: string;
  bed_label: string;
  room_number: string;
  floor_name: string;
  floor_number: number;
  room_type?: string;
  monthly_base_rent_paise: number;
  status: 'VACANT' | 'UPCOMING';
  available_from?: string;
  current_tenant_name?: string;
  current_tenant_id?: string;
}

export default function RoomsTab() {
  const { selectedPropertyId, voiceGuidance } = useAppStore();

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.rooms'));
  }, [voiceGuidance]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['vacant-beds-mobile', selectedPropertyId],
    queryFn: () =>
      api
        .get<{ items: VacantBed[]; vacant_count: number; upcoming_count: number }>(
          `/properties/${selectedPropertyId}/vacant-beds`,
        )
        .then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const items = data?.items ?? [];
  const available = items.filter((b) => b.status === 'VACANT');
  const upcoming = items.filter((b) => b.status === 'UPCOMING');

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header
          title={t('tab.rooms')}
          subtitle={`${data?.vacant_count ?? 0} now · ${data?.upcoming_count ?? 0} upcoming`}
        />
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          {/* Legend */}
          <View style={styles.legend}>
            <LegendItem color={colors.bedVacant} label={t('rooms.legend.vacant')} />
            <LegendItem color={colors.bedReserved} label={t('rooms.legend.reserved')} />
            <LegendItem color={colors.bedOccupied} label={t('rooms.legend.occupied')} />
            <LegendItem color={colors.bedMaintenance} label={t('rooms.legend.maintenance')} />
          </View>

          {available.length > 0 && (
            <Section
              dotColor={colors.bedVacant}
              title={t('rooms.available_now')}
              count={available.length}
            >
              {available.map((b) => (
                <BedCard key={b.id} bed={b} />
              ))}
            </Section>
          )}

          {upcoming.length > 0 && (
            <Section
              dotColor={colors.warn}
              title={t('rooms.upcoming')}
              count={upcoming.length}
            >
              {upcoming.map((b) => (
                <BedCard key={b.id} bed={b} />
              ))}
            </Section>
          )}

          {available.length === 0 && upcoming.length === 0 && (
            <Empty
              iconName="bed-outline"
              title="No vacancies"
              hint="Currently full and no notices given in the next 60 days."
            />
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function Section({
  dotColor,
  title,
  count,
  children,
}: {
  dotColor: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <View style={styles.sectionHeader}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.sectionTitle}>
          {title} <Text style={styles.sectionCount}>({count})</Text>
        </Text>
      </View>
      {children}
    </View>
  );
}

function BedCard({ bed }: { bed: VacantBed }) {
  const isUpcoming = bed.status === 'UPCOMING';
  return (
    <Card
      style={{
        ...styles.bed,
        ...(isUpcoming
          ? { backgroundColor: colors.warnBg, borderColor: colors.warn }
          : { backgroundColor: colors.successBg, borderColor: colors.bedVacant }),
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.bedTitle}>
          {bed.room_number}·{bed.bed_label}
          {bed.room_type ? ` · ${bed.room_type}` : ''}
        </Text>
        <Text style={styles.bedMeta}>
          {bed.floor_name} · {rupees(bed.monthly_base_rent_paise ?? 0)}/mo
        </Text>
        {isUpcoming && bed.current_tenant_name && (
          <Text style={styles.bedMeta}>{bed.current_tenant_name} is vacating</Text>
        )}
      </View>
      {isUpcoming && bed.available_from && (
        <View style={{ alignItems: 'flex-end' }}>
          <StatusPill label={bed.available_from} tone="warn" />
        </View>
      )}
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendLabel: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  sectionTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  sectionCount: { color: colors.textMuted, fontWeight: '400' },
  bed: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  bedTitle: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  bedMeta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
});
