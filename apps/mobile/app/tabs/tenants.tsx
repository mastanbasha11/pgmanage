/**
 * Residents tab — restyled to the redesign mock (mirrors the web
 * apps/web/src/pages/tenants/TenantsPage.tsx).
 *
 * Header sub shows active count · beds free · on-notice count. Filter chips
 * carry coloured dots + live counts. Each row is a green room·bed badge, the
 * tenant's avatar/name/phone, and stacked status pills on the right.
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize, TOUCH_TARGET } from '../../lib/theme';
import { Avatar, Empty, Fab, Header, Loading, rupees, Screen, formatDateHuman } from '../../components/ui';
import { Pill, RoomBadge, Tag, tagKindFor } from '../../components/redesign';
import { useTenants, type Tenant } from '../../lib/hooks/tenants';
import { useProperties } from '../../lib/hooks/properties';
import { buildTenantParams, type StatusFilter } from '../../lib/tenants-filter';

/** "4 mo here" / "12 days here" tenure string — same helper as the web page. */
function tenure(iso: string | undefined): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  const days = Math.round((Date.now() - parsed) / 86_400_000);
  if (days < 0) return 'starts soon';
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} here`;
  const mo = Math.round(days / 30.4);
  if (mo < 12) return `${mo} mo here`;
  const yr = Math.floor(mo / 12);
  const rem = mo % 12;
  return rem ? `${yr}y ${rem}m here` : `${yr} yr${yr === 1 ? '' : 's'} here`;
}

export default function ResidentsTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openCheckin?: string }>();
  const { selectedPropertyId, voiceGuidance, canRecordPayments } = useAppStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ACTIVE');

  useEffect(() => {
    if (voiceGuidance) speak(t('res.title'));
  }, [voiceGuidance]);

  // Deep-link handler — dashboard sends ?openCheckin=1 for the Check-in quick action.
  useEffect(() => {
    if (params.openCheckin === '1') {
      router.push('/tenants/checkin');
    }
  }, [params.openCheckin, router]);

  const { data, isLoading, refetch, isRefetching } = useTenants({
    property_id: selectedPropertyId ?? undefined,
    search: search || undefined,
    ...buildTenantParams(filter),
  });

  // Counts for the chips + header sub, independent of the filter in effect.
  // The backend's `total` is len(items) for the returned page — NOT a table
  // count — so these must use the SAME limit/sort as the main list (a limit:1
  // probe would always report 1) and be counted client-side. Params mirror the
  // main query exactly so react-query shares the cache when that filter is on.
  const activeQ = useTenants({
    property_id: selectedPropertyId ?? undefined,
    status: 'ACTIVE',
  });
  const noticeQ = useTenants({
    property_id: selectedPropertyId ?? undefined,
    status: 'ACTIVE',
    has_notice: true,
  });
  const checkedOutQ = useTenants({
    property_id: selectedPropertyId ?? undefined,
    status: 'CHECKED_OUT',
  });
  const { data: propertiesData } = useProperties();

  const activeCount = activeQ.data?.items.length;
  const noticeCount = noticeQ.data?.items.length;
  const checkedOutCount = checkedOutQ.data?.items.length;
  const vacantBeds =
    propertiesData?.items.find((p) => p.id === selectedPropertyId)?.vacant_beds ?? null;

  const subtitle = [
    `${activeCount ?? '…'} active tenants`,
    vacantBeds != null ? `${vacantBeds} beds free` : null,
    (noticeCount ?? 0) > 0 ? `${noticeCount} on notice` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const items = data?.items ?? [];

  const SEGMENTS: { key: StatusFilter; label: string; dot?: string; count?: number }[] = [
    { key: 'ACTIVE', label: t('res.filter.active'), dot: '#22a559', count: activeCount },
    { key: 'NOTICE', label: t('res.filter.notice'), dot: '#e0912f', count: noticeCount },
    { key: 'CHECKED_OUT', label: t('res.filter.checked_out'), dot: '#9aa1ad', count: checkedOutCount },
    { key: 'ALL', label: t('res.filter.all') },
  ];

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header title={t('res.title')} subtitle={subtitle} />

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

        {/* Filter chips — coloured dot + live count */}
        <View style={styles.chips}>
          {SEGMENTS.map((seg) => {
            const active = filter === seg.key;
            return (
              <Pressable
                key={seg.key}
                onPress={() => setFilter(seg.key)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {!!seg.dot && <View style={[styles.chipDot, { backgroundColor: seg.dot }]} />}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{seg.label}</Text>
                {seg.count != null && (
                  <View style={[styles.chipCount, active && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, active && styles.chipTextActive]}>
                      {seg.count}
                    </Text>
                  </View>
                )}
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
          contentContainerStyle={{ padding: space.lg, paddingTop: space.md }}
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
                  : filter === 'CHECKED_OUT'
                    ? 'Residents who have checked out will appear here.'
                    : search
                      ? 'Try a different name or phone number.'
                      : 'Try a different filter or search.'
              }
            />
          }
        />
      )}

      {canRecordPayments() && (
        <Fab
          name="add"
          accessibilityLabel="Check-in new resident"
          onPress={() => router.push('/tenants/checkin')}
        />
      )}
    </Screen>
  );
}

function ResidentRow({ item, onPress }: { item: Tenant; onPress: () => void }) {
  const isActive = item.is_active ?? item.status === 'ACTIVE';
  const ten = tenure(item.move_in_date);
  return (
    <Pressable onPress={onPress} android_ripple={{ color: 'rgba(0,0,0,0.04)' }} style={styles.row}>
      {item.room_number ? (
        <RoomBadge room={item.room_number} sub={item.bed_label ? `·${item.bed_label}` : undefined} />
      ) : (
        <View style={styles.roomEmpty}>
          <Text style={styles.roomEmptyText}>—</Text>
        </View>
      )}

      <Avatar name={item.name} size={34} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="call-outline" size={11} color={colors.textDim} />
          <Text style={styles.meta} numberOfLines={1}>
            {item.phone}
          </Text>
        </View>
        <View style={styles.tagRow}>
          {!!item.room_type && <Tag label={item.room_type} kind={tagKindFor(item.room_type)} />}
          {!!ten && <Text style={styles.tenure}>{ten}</Text>}
        </View>
      </View>

      <View style={styles.rightCol}>
        {!!item.monthly_rent_paise && (
          <Text style={styles.rent}>
            {rupees(item.monthly_rent_paise)}
            <Text style={styles.rentPer}>/mo</Text>
          </Text>
        )}
        <Pill label={isActive ? 'Active' : (item.status ?? 'Inactive')} tone={isActive ? 'g' : 's'} dot />
        {isActive && !!item.notice_given_date && (
          <Pill
            label={`Notice · ${item.expected_move_out_date ? formatDateHuman(item.expected_move_out_date) : '—'}`}
            tone="a"
          />
        )}
        {!!item.outstanding_paise && item.outstanding_paise > 0 && (
          <Pill label={`Due ${rupees(item.outstanding_paise)}`} tone="r" dot />
        )}
      </View>
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
  chips: { flexDirection: 'row', gap: 6, marginTop: space.md, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    minHeight: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 12.5, fontWeight: '700', color: '#4a5261' },
  chipTextActive: { color: colors.white },
  chipCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipCountText: { fontSize: 11, fontWeight: '800', color: colors.neutralFg },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    marginBottom: space.sm,
  },
  roomEmpty: {
    minWidth: 38,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.neutralBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomEmptyText: { fontSize: 12.5, fontWeight: '800', color: colors.textDim },

  name: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  tenure: { fontSize: 10.5, color: colors.textDim, fontWeight: '600' },

  rightCol: { alignItems: 'flex-end', gap: 4, maxWidth: 132 },
  rent: { fontSize: 13, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  rentPer: { fontSize: 10.5, fontWeight: '700', color: colors.textDim },
});
