/**
 * Vacancies view — restyled to the redesign mock.
 *
 *   - Two KpiTiles at top: "Free now" · "Whole rooms" (green-tinted)
 *   - Horizontal chip strip: All · Whole rooms · one chip per room-type
 *     (+ AC / Non-AC, kept from the previous version)
 *   - Vertical list of room cards. A room where every bed is free is tinted
 *     green and reads "Whole room free"; otherwise "N of M free".
 *   - Bed letters render as small rounded squares — green when the whole room
 *     is free, amber otherwise. Upcoming cards name the freeing tenants.
 *   - Two actions per card: "Match leads" · "Assign booking".
 *
 * Beds from the same room are visually clustered in a single card so a fully-
 * vacant 2-share room reads as "sell as single occupancy" at a glance.
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, space } from '../../lib/theme';
import {
  Button,
  Chip,
  ChipStrip,
  Empty,
  Header,
  Loading,
  Row,
  rupees,
  formatDateHuman,
} from '../../components/ui';
import { KpiTile, Pill, Tag, tagKindFor } from '../../components/redesign';
import { useVacantBeds, VacantBed } from '../../lib/hooks/properties';

/** 'all' · 'whole' · 'ac' · 'nonac' · 'type:<room type>' */
type FilterKey = string;

// Room-type name → normalised short label. Web app uses shortRoomType; keep in
// sync so both apps show the same pill text.
function shortType(type?: string): string {
  if (!type) return '—';
  const s = type.toLowerCase();
  if (s.includes('suite')) return 'Suite';
  if (s.includes('dorm')) return 'Dorm';
  const m = /(\d)/.exec(s);
  if (m) return `${m[1]}-Share`;
  return type;
}

// Group beds into rooms so we can render a single card per room with bed
// sub-rows. Room capacity comes from `room_capacity` (added to backend so we
// know whether an all-vacant room = whole room).
interface RoomGroup {
  room_id: string;
  room_number: string;
  room_name?: string;
  floor_id: string;
  floor_number: number;
  floor_name: string;
  room_type?: string;
  has_ac?: boolean;
  capacity: number;
  beds: VacantBed[];
  monthly_base_rent_paise: number;
  wholeRoom: boolean;
}

function groupByRoom(items: VacantBed[]): RoomGroup[] {
  const map = new Map<string, RoomGroup>();
  for (const b of items) {
    const cap = b.room_capacity ?? 1;
    const g = map.get(b.room_id) ?? {
      room_id: b.room_id,
      room_number: b.room_number,
      room_name: b.room_name,
      floor_id: b.floor_id,
      floor_number: b.floor_number,
      floor_name: b.floor_name,
      room_type: b.room_type,
      has_ac: b.has_ac,
      capacity: cap,
      beds: [],
      monthly_base_rent_paise: b.monthly_base_rent_paise,
      wholeRoom: false,
    };
    g.beds.push(b);
    map.set(b.room_id, g);
  }
  return Array.from(map.values()).map((g) => ({
    ...g,
    wholeRoom: g.beds.length === g.capacity,
  }));
}

function sortRooms(rooms: RoomGroup[]): RoomGroup[] {
  return [...rooms].sort(
    (a, b) =>
      a.floor_number - b.floor_number ||
      a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
  );
}

export default function VacanciesTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedPropertyId, voiceGuidance } = useAppStore();
  const [filter, setFilter] = useState<FilterKey>('all');
  const q = useVacantBeds(selectedPropertyId ?? undefined, { includeUpcoming: true });

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.rooms'));
  }, [voiceGuidance]);

  const items = q.data?.items ?? [];
  const vacantRooms = useMemo(
    () => groupByRoom(items.filter((b) => b.status !== 'UPCOMING')),
    [items],
  );
  const upcomingRooms = useMemo(
    () => groupByRoom(items.filter((b) => b.status === 'UPCOMING')),
    [items],
  );

  // One chip per distinct room-type present in the vacancy list.
  const roomTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of [...vacantRooms, ...upcomingRooms]) if (r.room_type) set.add(r.room_type);
    return Array.from(set).sort();
  }, [vacantRooms, upcomingRooms]);

  const applyFilter = (rooms: RoomGroup[]): RoomGroup[] =>
    rooms.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'whole') return r.wholeRoom;
      if (filter === 'ac') return !!r.has_ac;
      if (filter === 'nonac') return !r.has_ac;
      if (filter.startsWith('type:')) return r.room_type === filter.slice(5);
      return true;
    });

  const vacantShown = sortRooms(applyFilter(vacantRooms));
  const upcomingShown = sortRooms(applyFilter(upcomingRooms));

  const vacantBedCount = vacantShown.reduce((a, r) => a + r.beds.length, 0);
  const upcomingBedCount = upcomingShown.reduce((a, r) => a + r.beds.length, 0);
  const wholeRoomCount = vacantShown.filter((r) => r.wholeRoom).length;

  const goLeads = () => router.push('/tabs/leads');
  const goBookings = () => router.push('/bookings');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Header
          title="Vacancies"
          subtitle={`${q.data?.vacant_count ?? 0} vacant now · ${q.data?.upcoming_count ?? 0} upcoming`}
        />
      </View>

      {q.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.accent} />
          }
        >
          {/* KPI tiles */}
          <Row gap={space.sm} align="stretch" style={{ marginBottom: space.md }}>
            <KpiTile
              label="Free now"
              value={vacantBedCount}
              foot={`${upcomingBedCount} freeing up soon`}
            />
            <KpiTile
              label="Whole rooms"
              value={wholeRoomCount}
              foot="every bed free — sell as one"
              tone="accent"
            />
          </Row>

          {/* Filter chips */}
          <ChipStrip>
            <Chip
              label="All"
              active={filter === 'all'}
              onPress={() => setFilter('all')}
              count={vacantRooms.length}
            />
            <Chip
              label="Whole rooms"
              iconName="cube-outline"
              active={filter === 'whole'}
              onPress={() => setFilter('whole')}
              count={vacantRooms.filter((r) => r.wholeRoom).length}
            />
            {roomTypes.map((rt) => (
              <Chip
                key={rt}
                label={shortType(rt)}
                active={filter === `type:${rt}`}
                onPress={() => setFilter(`type:${rt}`)}
                count={vacantRooms.filter((r) => r.room_type === rt).length}
              />
            ))}
            <Chip
              label="AC"
              iconName="snow-outline"
              active={filter === 'ac'}
              onPress={() => setFilter('ac')}
              tone="info"
            />
            <Chip label="Non-AC" active={filter === 'nonac'} onPress={() => setFilter('nonac')} />
          </ChipStrip>

          <View style={{ height: space.md }} />

          {vacantShown.length === 0 && upcomingShown.length === 0 && (
            <Empty
              iconName="bed-outline"
              title="No vacancies match"
              hint={filter !== 'all' ? 'Try a different filter.' : 'Currently full and no notices given.'}
            />
          )}

          {vacantShown.length > 0 && (
            <>
              <SectionHead title="Vacant now" count={vacantShown.length} tone="vacant" />
              {vacantShown.map((r) => (
                <RoomCard
                  key={r.room_id}
                  room={r}
                  tone="vacant"
                  onMatchLeads={goLeads}
                  onAssign={goBookings}
                />
              ))}
            </>
          )}

          {upcomingShown.length > 0 && (
            <>
              <View style={{ height: space.md }} />
              <SectionHead title="Upcoming vacancies" count={upcomingShown.length} tone="upcoming" />
              {upcomingShown.map((r) => (
                <RoomCard
                  key={r.room_id}
                  room={r}
                  tone="upcoming"
                  onMatchLeads={goLeads}
                  onAssign={goBookings}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function SectionHead({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone: 'vacant' | 'upcoming';
}) {
  const accent = tone === 'vacant' ? colors.success : colors.warn;
  return (
    <Row gap={space.sm} style={{ marginBottom: space.sm }}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={styles.sectionTitle}>
        {title} <Text style={styles.sectionCount}>({count})</Text>
      </Text>
    </Row>
  );
}

function RoomCard({
  room,
  tone,
  onMatchLeads,
  onAssign,
}: {
  room: RoomGroup;
  tone: 'vacant' | 'upcoming';
  onMatchLeads: () => void;
  onAssign: () => void;
}) {
  const isVacant = tone === 'vacant';
  const isWhole = isVacant && room.wholeRoom;
  const bedTone = isWhole
    ? { bg: colors.successBg, line: colors.successLine, fg: colors.success }
    : { bg: colors.warnBg, line: colors.warnLine, fg: colors.warn };

  const freeingNames = Array.from(
    new Set(room.beds.map((b) => b.current_tenant_name).filter(Boolean) as string[]),
  );
  const soonest = room.beds
    .map((b) => b.available_from)
    .filter(Boolean)
    .sort()[0];

  return (
    <View
      style={{
        ...styles.roomCard,
        ...(isWhole ? { borderColor: colors.successLine, backgroundColor: '#f8fefb' } : null),
      }}
    >
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row gap={space.sm} wrap>
            <Text style={styles.roomNum}>Room {room.room_number}</Text>
            <Pill
              label={isWhole ? 'Whole room free' : `${room.beds.length} of ${room.capacity} free`}
              tone={isWhole ? 'g' : 'a'}
              dot
            />
          </Row>
          <Text style={styles.roomMeta} numberOfLines={1}>
            {room.floor_name}
            {room.room_name ? ` · ${room.room_name}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.roomRent}>
            {rupees(room.monthly_base_rent_paise)}
            <Text style={styles.roomRentPer}>/mo</Text>
          </Text>
          {!isVacant && !!soonest && (
            <Text style={styles.freeFrom}>free {formatDateHuman(soonest)}</Text>
          )}
        </View>
      </Row>

      {/* Room-type / AC tags */}
      <Row wrap gap={6} style={{ marginTop: space.sm }}>
        {!!room.room_type && <Tag label={shortType(room.room_type)} kind={tagKindFor(room.room_type)} />}
        <Tag label={room.has_ac ? 'AC' : 'Non-AC'} kind="ac" />
      </Row>

      {/* Bed letters */}
      <Row wrap gap={6} style={{ marginTop: space.sm }}>
        {[...room.beds]
          .sort((a, b) => a.bed_label.localeCompare(b.bed_label))
          .map((b) => (
            <View
              key={b.id}
              style={[styles.bedBox, { backgroundColor: bedTone.bg, borderColor: bedTone.line }]}
            >
              <Text style={[styles.bedBoxText, { color: bedTone.fg }]} numberOfLines={1}>
                {b.bed_label}
              </Text>
            </View>
          ))}
      </Row>

      {!isVacant && freeingNames.length > 0 && (
        <Text style={styles.freeing} numberOfLines={2}>
          Freeing up: {freeingNames.join(', ')}
        </Text>
      )}

      {/* Actions */}
      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Button
          label="Match leads"
          variant="secondary"
          size="sm"
          iconName="people-outline"
          onPress={onMatchLeads}
          style={{ flex: 1 }}
        />
        <Button
          label="Assign booking"
          size="sm"
          iconName="calendar-outline"
          onPress={onAssign}
          style={{ flex: 1 }}
        />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.text, letterSpacing: 0.2 },
  sectionCount: { color: colors.textDim, fontWeight: '700' },

  roomCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    marginBottom: space.sm,
  },
  roomNum: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  roomMeta: { fontSize: 11, color: colors.textDim, fontWeight: '600', marginTop: 3 },
  roomRent: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  roomRentPer: { fontSize: 10, fontWeight: '700', color: colors.textDim },
  freeFrom: { fontSize: 10, color: colors.warn, fontWeight: '700', marginTop: 3 },

  bedBox: {
    width: 19,
    height: 19,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bedBoxText: { fontSize: 10, fontWeight: '800' },

  freeing: { fontSize: 10.5, color: colors.textMuted, fontWeight: '600', marginTop: space.sm },
});
