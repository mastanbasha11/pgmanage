/**
 * Rent tab. Monthly ledger for the selected property; tap a row to record
 * a payment for that tenant/month/year.
 *
 * Status pills mirror web colours: green PAID, amber PARTIAL, red UNPAID.
 */
import { useEffect, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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
import {
  countByStatus,
  filterByStatus,
  sumOutstanding,
  type LedgerFilter,
} from '../../lib/ledger-filter';

interface LedgerEntry {
  id: string;
  tenant_id: string;
  tenant_name: string;
  phone?: string | null;
  month: number;
  year: number;
  amount_due_paise: number;
  amount_paid_paise: number;
  outstanding_paise: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Compose a wa.me deep-link with the overdue-reminder message pre-filled.
 * Same shape as the web WhatsApp icon — client-side text, not a Meta
 * template call, so the collector reviews before tapping Send.
 */
function buildOverdueWhatsappUrl(e: LedgerEntry, monthLabel: string): string {
  const phone = (e.phone ?? '').replace(/\D/g, '');
  const rupeesFmt = Math.round(e.outstanding_paise / 100).toLocaleString('en-IN');
  const name = e.tenant_name.trim();
  const msg =
    `Hi ${name}, a friendly reminder that your rent for ${monthLabel} is still ` +
    `outstanding — ₹${rupeesFmt}. Please clear it at the earliest. Thanks!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export default function RentTab() {
  const { selectedPropertyId, voiceGuidance } = useAppStore();
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const [filter, setFilter] = useState<LedgerFilter>('ALL');

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

  const allEntries: LedgerEntry[] = data?.items ?? [];
  const entries = filterByStatus<LedgerEntry>(allEntries, filter);
  // Outstanding always sums over ALL entries — filter is a view, not a scope.
  const outstanding = sumOutstanding(allEntries);
  const statusCounts = countByStatus(allEntries);

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

        {/* Status filter chips. ALL is default; PARTIAL + UNPAID are the
            two an owner usually wants to filter to when chasing collections. */}
        <View style={{ flexDirection: 'row', gap: space.xs, paddingBottom: space.sm }}>
          {(['ALL', 'UNPAID', 'PARTIAL', 'PAID'] as const).map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.statusChip, active && styles.statusChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()} ({statusCounts[f] ?? 0})
                </Text>
              </Pressable>
            );
          })}
        </View>
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
          renderItem={({ item }) => {
            const canWhatsapp = item.status !== 'PAID' && !!item.phone;
            const monthLabel = `${MONTHS[item.month - 1]} ${item.year}`;
            return (
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
                {canWhatsapp && (
                  <Pressable
                    accessibilityLabel={`Message ${item.tenant_name} on WhatsApp`}
                    hitSlop={8}
                    style={styles.waButton}
                    onPress={(ev) => {
                      // Stop the card's onPress from firing behind us.
                      ev.stopPropagation();
                      const url = buildOverdueWhatsappUrl(item, monthLabel);
                      Linking.openURL(url).catch(() => {});
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                  </Pressable>
                )}
                <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                  <StatusPill label={t(`rent.status.${item.status}` as 'rent.status.PAID')} tone={statusTone(item.status)} />
                  {item.status !== 'PAID' && (
                    <Text style={styles.outstanding}>{rupees(item.outstanding_paise)}</Text>
                  )}
                </View>
              </Card>
            );
          }}
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
  statusChip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textMuted },
  statusChipTextActive: { color: colors.white },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  waButton: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCFCE7',
  },
  tenantName: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  due: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  outstanding: { fontSize: fontSize.body, fontWeight: '700', color: colors.danger },
});
