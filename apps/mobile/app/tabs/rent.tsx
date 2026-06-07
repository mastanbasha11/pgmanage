/**
 * Rent tab. Monthly ledger for the selected property; tap a row to record
 * a payment for that tenant/month/year.
 *
 * Status pills mirror web colours: green PAID, amber PARTIAL, red UNPAID.
 */
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

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

interface LedgerEntry {
  id: string;
  tenant_id: string;
  tenant_name: string;
  month: number;
  year: number;
  amount_due_paise: number;
  amount_paid_paise: number;
  outstanding_paise: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function RentTab() {
  const { selectedPropertyId, voiceGuidance } = useAppStore();
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.rent'));
  }, [voiceGuidance]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['rent-ledger-mobile', selectedPropertyId, month, year],
    queryFn: () =>
      api
        .get<{ items: LedgerEntry[] }>('/rent/ledger', {
          params: { property_id: selectedPropertyId, month, year },
        })
        .then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const entries = data?.items ?? [];
  const outstanding = entries.reduce((s, e) => s + (e.outstanding_paise ?? 0), 0);

  function statusTone(s: LedgerEntry['status']): 'success' | 'warn' | 'danger' {
    return s === 'PAID' ? 'success' : s === 'PARTIAL' ? 'warn' : 'danger';
  }

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header
          title={t('tab.rent')}
          subtitle={
            outstanding > 0
              ? t('rent.outstanding', { amount: rupees(outstanding) })
              : t('rent.this_month')
          }
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: space.xs, paddingVertical: space.sm }}>
            {MONTHS.map((m, i) => (
              <Pressable
                key={m}
                style={[styles.chip, month === i + 1 && styles.chipActive]}
                onPress={() => setMonth(i + 1)}
                accessibilityRole="button"
                accessibilityState={{ selected: month === i + 1 }}
              >
                <Text style={[styles.chipText, month === i + 1 && styles.chipTextActive]}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: 0 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => (
            <Card
              style={styles.entry}
              onPress={() =>
                router.push({
                  pathname: '/payments/new',
                  params: { tenant_id: item.tenant_id, name: item.tenant_name },
                })
              }
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.tenantName} numberOfLines={1}>
                  {item.tenant_name}
                </Text>
                <Text style={styles.due}>Due {rupees(item.amount_due_paise)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                <StatusPill label={t(`rent.status.${item.status}` as 'rent.status.PAID')} tone={statusTone(item.status)} />
                {item.status !== 'PAID' && (
                  <Text style={styles.outstanding}>{rupees(item.outstanding_paise)}</Text>
                )}
              </View>
            </Card>
          )}
          ListEmptyComponent={
            <Empty
              iconName="cash-outline"
              title={t('common.empty')}
              hint="Generate ledger from the web app for this month."
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    minWidth: 56,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontSize: fontSize.small, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.white },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  tenantName: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  due: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  outstanding: { fontSize: fontSize.body, fontWeight: '700', color: colors.danger },
});
