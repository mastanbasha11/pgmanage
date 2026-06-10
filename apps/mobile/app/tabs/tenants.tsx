/**
 * Residents tab. List + status filter + search, tap → /residents/[id].
 *
 * Status filter mirrors the web app: Active / Notice given / Checked-out /
 * All. Under the hood: status=ACTIVE + has_notice=true is sent for "Notice".
 */
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize, TOUCH_TARGET } from '../../lib/theme';
import { Empty, Header, Loading, StatusPill, rupees, Screen } from '../../components/ui';
import { buildTenantParams, type StatusFilter } from '../../lib/tenants-filter';

interface Resident {
  id: string;
  name: string;
  phone: string;
  status: 'ACTIVE' | 'CHECKED_OUT' | 'RESERVED';
  monthly_rent_paise: number;
  room_number?: string;
  bed_label?: string;
  floor_name?: string;
  outstanding_paise?: number;
  notice_given_date?: string;
  expected_move_out_date?: string;
}

export default function ResidentsTab() {
  const router = useRouter();
  const { selectedPropertyId, voiceGuidance } = useAppStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ACTIVE');

  useEffect(() => {
    if (voiceGuidance) speak(t('res.title'));
  }, [voiceGuidance]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['residents-mobile', selectedPropertyId, search, filter],
    queryFn: () =>
      api
        .get<{ items: Resident[] }>('/tenants', {
          params: {
            property_id: selectedPropertyId,
            search: search || undefined,
            ...buildTenantParams(filter),
          },
        })
        .then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const items = data?.items ?? [];

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header title={t('res.title')} subtitle={`${items.length}`} />

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.textDim} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('res.search_placeholder')}
            placeholderTextColor={colors.textDim}
            returnKeyType="search"
          />
        </View>

        {/* Filter chips */}
        <View style={styles.chips}>
          {(['ACTIVE', 'NOTICE', 'CHECKED_OUT', 'ALL'] as const).map((opt) => {
            const labelMap: Record<StatusFilter, string> = {
              ACTIVE: t('res.filter.active'),
              NOTICE: t('res.filter.notice'),
              CHECKED_OUT: t('res.filter.checked_out'),
              ALL: t('res.filter.all'),
            };
            const active = filter === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setFilter(opt)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {labelMap[opt]}
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
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => (
            <ResidentRow
              item={item}
              onPress={() => router.push({ pathname: '/residents/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <Empty
              iconName="people-outline"
              title={t('common.empty')}
              hint={
                filter === 'NOTICE'
                  ? 'No residents currently on notice.'
                  : 'Try a different filter or search.'
              }
            />
          }
        />
      )}
    </Screen>
  );
}

function ResidentRow({ item, onPress }: { item: Resident; onPress: () => void }) {
  const initials = item.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Pressable onPress={onPress} android_ripple={{ color: 'rgba(0,0,0,0.04)' }} style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.phone}
          {item.room_number ? ` · ${item.room_number}${item.bed_label ? `·${item.bed_label}` : ''}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.xs, marginTop: 4, flexWrap: 'wrap' }}>
          {item.status !== 'ACTIVE' && <StatusPill label={item.status} tone="neutral" />}
          {item.notice_given_date && (
            <StatusPill
              label={`Notice · ${item.expected_move_out_date ?? ''}`}
              tone="warn"
            />
          )}
          {!!item.outstanding_paise && item.outstanding_paise > 0 && (
            <StatusPill label={`Due ${rupees(item.outstanding_paise)}`} tone="danger" />
          )}
        </View>
      </View>
      <Text style={styles.rent}>{rupees(item.monthly_rent_paise ?? 0)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    gap: space.sm,
    marginTop: space.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    fontSize: fontSize.body,
    color: colors.text,
  },
  chips: { flexDirection: 'row', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: space.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.small, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.white },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: fontSize.body },
  name: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  rent: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, marginLeft: space.sm },
});
