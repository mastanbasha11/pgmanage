/**
 * Dashboard — landing tab. KPI summary from /dashboard/summary plus quick
 * actions. Same numbers the web dashboard shows, condensed to fit phone.
 */
import { useEffect } from 'react';
import { RefreshControl, ScrollView, View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, space } from '../../lib/theme';
import { Button, Card, Header, KpiCard, Loading, rupees, Screen } from '../../components/ui';

interface DashSummary {
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
  occupancy_pct: number;
  collected_today_paise: number;
  outstanding_paise: number;
  pending_rent_paise?: number;
  checkins_today?: number;
  checkouts_today?: number;
}

export default function DashboardTab() {
  const { user, selectedPropertyId, voiceGuidance } = useAppStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dash-summary', selectedPropertyId],
    queryFn: () =>
      api
        .get<DashSummary>('/dashboard/summary', {
          params: { property_id: selectedPropertyId },
        })
        .then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.dashboard'));
  }, [voiceGuidance]);

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{
          padding: space.lg,
          paddingBottom: insets.bottom + space.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <Header
          title={`${t('dash.welcome')}, ${user?.name?.split(' ')[0] ?? ''}`}
          subtitle={t('tab.dashboard')}
        />

        {isLoading || !data ? (
          <Loading />
        ) : (
          <>
            {/* Top row: occupancy + vacancies. */}
            <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.md }}>
              <KpiCard
                label={t('dash.occupancy')}
                value={`${Math.round(data.occupancy_pct ?? 0)}%`}
                hint={`${data.occupied_beds}/${data.total_beds}`}
                tone="info"
                iconName="pie-chart-outline"
              />
              <KpiCard
                label={t('dash.vacant_beds')}
                value={data.vacant_beds}
                tone="success"
                iconName="bed-outline"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.md }}>
              <KpiCard
                label={t('dash.collections_today')}
                value={rupees(data.collected_today_paise ?? 0)}
                tone="success"
                iconName="cash-outline"
              />
              <KpiCard
                label={t('dash.outstanding')}
                value={rupees(data.outstanding_paise ?? 0)}
                tone="danger"
                iconName="warning-outline"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.lg }}>
              <KpiCard
                label={t('dash.checkins_today')}
                value={data.checkins_today ?? 0}
                tone="neutral"
                iconName="log-in-outline"
              />
              <KpiCard
                label={t('dash.checkouts_today')}
                value={data.checkouts_today ?? 0}
                tone="neutral"
                iconName="log-out-outline"
              />
            </View>

            {/* Quick actions */}
            <Card>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: space.md }}>
                Quick actions
              </Text>
              <View style={{ gap: space.sm }}>
                <Button
                  variant="primary"
                  iconName="cash-outline"
                  label={t('res.record_payment')}
                  onPress={() => router.push('/tabs/rent')}
                  block
                />
                <Button
                  variant="secondary"
                  iconName="people-outline"
                  label={t('res.title')}
                  onPress={() => router.push('/tabs/tenants')}
                  block
                />
                <Button
                  variant="secondary"
                  iconName="bed-outline"
                  label={t('tab.rooms')}
                  onPress={() => router.push('/tabs/rooms')}
                  block
                />
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
