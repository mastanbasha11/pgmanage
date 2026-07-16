/**
 * Vacancies view — mirrors the web PropertyDetailPage/VacancySections layout:
 *
 *   - StatTiles at top: beds / rooms / whole-rooms
 *   - Filter chips:     All · Whole rooms · 1-Share · 2-Share · 3-Share · Suite · AC · Non-AC
 *   - Vacant section:   grouped by floor, one card per room (green), nested bed rows
 *   - Upcoming section: same layout, amber tone, per-bed "leaving on <date>" pill
 *
 * Beds from the same room are visually clustered in a single card so a fully-
 * vacant 2-share room reads as "sell as single occupancy" at a glance.
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import {
  Chip,
  ChipStrip,
  Empty,
  Header,
  Loading,
  Row,
  StatusPill,
  StatTile,
  rupees,
  formatDateHuman,
} from '../../components/ui';
import { useVacantBeds, VacantBed } from '../../lib/hooks/properties';

type FilterKey = 'all' | 'whole' | '1' | '2' | '3' | 'suite' | 'ac' | 'nonac';

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

function shareCount(type?: string): number | null {
  const m = /(\d)/.exec(type ?? '');
  return m ? Number(m[1]) : null;
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

export default function VacanciesTab() {
  const { selectedPropertyId, voiceGuidance } = useAppStore();
  const [filter, setFilter] = useState<FilterKey>('all');
  const q = useVacantBeds(selectedPropertyId ?? undefined, { includeUpcoming: true });

  useEffect(() => {
    if (voiceGuidance) speak(t('tab.rooms'));
  }, [voiceGuidance]);

  const items = q.data?.items ?? [];
  const vacantRooms = useMemo(() => groupByRoom(items.filter((b) => b.status !== 'UPCOMING')), [items]);
  const upcomingRooms = useMemo(() => groupByRoom(items.filter((b) => b.status === 'UPCOMING')), [items]);

  const applyFilter = (rooms: RoomGroup[]): RoomGroup[] =>
    rooms.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'whole') return r.wholeRoom;
      if (filter === 'ac') return !!r.has_ac;
      if (filter === 'nonac') return !r.has_ac;
      const s = shareCount(r.room_type);
      if (filter === '1') return s === 1;
      if (filter === '2') return s === 2;
      if (filter === '3') return s === 3;
      if (filter === 'suite') return /suite/i.test(r.room_type ?? '');
      return true;
    });

  const vacantShown = applyFilter(vacantRooms);
  const upcomingShown = applyFilter(upcomingRooms);

  const vacantBedCount = vacantShown.reduce((a, r) => a + r.beds.length, 0);
  const upcomingBedCount = upcomingShown.reduce((a, r) => a + r.beds.length, 0);
  const wholeRoomCount = vacantShown.filter((r) => r.wholeRoom).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm }}>
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
          {/* Stat tiles */}
          <Row gap={space.sm} style={{ marginBottom: space.md }}>
            <StatTile label="Vacant beds" value={vacantBedCount} tone="success" />
            <StatTile label="Whole rooms" value={wholeRoomCount} tone="success" />
            <StatTile label="Upcoming" value={upcomingBedCount} tone="warn" />
          </Row>

          {/* Filter chips */}
          <ChipStrip>
            <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} count={vacantRooms.length} />
            <Chip
              label="Whole"
              iconName="cube-outline"
              active={filter === 'whole'}
              onPress={() => setFilter('whole')}
              count={vacantRooms.filter((r) => r.wholeRoom).length}
            />
            <Chip label="1-Share" active={filter === '1'} onPress={() => setFilter('1')} />
            <Chip label="2-Share" active={filter === '2'} onPress={() => setFilter('2')} />
            <Chip label="3-Share" active={filter === '3'} onPress={() => setFilter('3')} />
            <Chip label="Suite" active={filter === 'suite'} onPress={() => setFilter('suite')} />
            <Chip label="AC" iconName="snow-outline" active={filter === 'ac'} onPress={() => setFilter('ac')} tone="info" />
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
            <FloorSections title="Vacant now" rooms={vacantShown} tone="vacant" />
          )}

          {upcomingShown.length > 0 && (
            <>
              <View style={{ height: space.md }} />
              <FloorSections title="Upcoming vacancies" rooms={upcomingShown} tone="upcoming" />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// Group room cards by floor with a floor tag on the left column.
function FloorSections({
  title,
  rooms,
  tone,
}: {
  title: string;
  rooms: RoomGroup[];
  tone: 'vacant' | 'upcoming';
}) {
  const byFloor = new Map<string, { floor_number: number; floor_name: string; rooms: RoomGroup[] }>();
  for (const r of rooms) {
    const g = byFloor.get(r.floor_id) ?? { floor_number: r.floor_number, floor_name: r.floor_name, rooms: [] };
    g.rooms.push(r);
    byFloor.set(r.floor_id, g);
  }
  const groups = Array.from(byFloor.values()).sort((a, b) => a.floor_number - b.floor_number);
  const accent = tone === 'vacant' ? colors.success : colors.warn;
  return (
    <View>
      <Row gap={space.sm} style={{ marginBottom: space.sm }}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={styles.sectionTitle}>
          {title} <Text style={styles.sectionCount}>({rooms.length})</Text>
        </Text>
      </Row>
      {groups.map((g) => (
        <View key={g.floor_number} style={styles.floorRow}>
          <View style={styles.floorTag}>
            <Text style={styles.floorNum}>{g.floor_number}F</Text>
            <Text style={styles.floorLabel}>{g.floor_name}</Text>
            <Text style={styles.floorMeta}>{g.rooms.length} rooms</Text>
          </View>
          <View style={{ flex: 1, gap: space.sm }}>
            {g.rooms
              .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
              .map((r) => (
                <RoomCard key={r.room_id} room={r} tone={tone} />
              ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function RoomCard({ room, tone }: { room: RoomGroup; tone: 'vacant' | 'upcoming' }) {
  const isVacant = tone === 'vacant';
  const isWhole = isVacant && room.wholeRoom;
  const cardBg = isVacant ? colors.surface : colors.warnBg;
  const borderColor = isWhole ? colors.success : isVacant ? colors.border : colors.warn;
  return (
    <View style={[styles.roomCard, { backgroundColor: cardBg, borderColor }]}>
      {isWhole && <View style={styles.wholeAccent} />}
      <Row justify="space-between" style={{ marginBottom: space.xs }}>
        <Row gap={space.sm}>
          <Text style={styles.roomNum}>Room {room.room_number}</Text>
          {isWhole && <StatusPill label="Whole room" tone="success" />}
        </Row>
        <Text style={styles.roomRent}>{rupees(room.monthly_base_rent_paise)}/mo</Text>
      </Row>
      <Row wrap gap={6} style={{ marginBottom: space.sm }}>
        <StatusPill label={shortType(room.room_type)} tone="neutral" />
        {room.has_ac ? (
          <StatusPill label="AC" tone="info" />
        ) : (
          <StatusPill label="Non-AC" tone="neutral" />
        )}
        <OccupancyDots capacity={room.capacity} vacant={room.beds.length} />
      </Row>
      {/* Nested bed rows */}
      <View style={styles.bedList}>
        {room.beds
          .sort((a, b) => a.bed_label.localeCompare(b.bed_label))
          .map((b) => (
            <View key={b.id} style={styles.bedRow}>
              <View style={[styles.bedDot, { backgroundColor: isVacant ? colors.success : colors.warn }]} />
              <Text style={styles.bedLabel}>Bed {b.bed_label}</Text>
              {!isVacant && b.available_from && (
                <Text style={styles.bedHint}> · leaving {formatDateHuman(b.available_from)}</Text>
              )}
              {!isVacant && b.current_tenant_name && (
                <Text style={styles.bedHint}> ({b.current_tenant_name})</Text>
              )}
            </View>
          ))}
      </View>
    </View>
  );
}

function OccupancyDots({ capacity, vacant }: { capacity: number; vacant: number }) {
  return (
    <Row gap={3}>
      {Array.from({ length: capacity }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.capDot,
            {
              backgroundColor: i < vacant ? colors.success : colors.surfaceMuted2,
              borderColor: i < vacant ? colors.success : colors.border,
            },
          ]}
        />
      ))}
      <Text style={{ fontSize: fontSize.caption, color: colors.textMuted, marginLeft: 4 }}>
        {vacant}/{capacity} free
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: fontSize.h3, fontWeight: '700', color: colors.text },
  sectionCount: { color: colors.textMuted, fontWeight: '400' },

  floorRow: {
    flexDirection: 'row',
    gap: space.md,
    marginBottom: space.md,
  },
  floorTag: {
    width: 68,
    alignItems: 'center',
    paddingTop: space.sm,
  },
  floorNum: { fontSize: fontSize.h1, fontWeight: '800', color: colors.primary },
  floorLabel: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
  floorMeta: { fontSize: fontSize.caption, color: colors.textDim, marginTop: 2 },

  roomCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    paddingLeft: space.md + 4,
    position: 'relative',
    overflow: 'hidden',
  },
  wholeAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.success,
  },
  roomNum: { fontSize: fontSize.bodyLg, fontWeight: '800', color: colors.text },
  roomRent: { fontSize: fontSize.body, fontWeight: '700', color: colors.accent },

  capDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },

  bedList: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  bedRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  bedDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  bedLabel: { fontSize: fontSize.small, color: colors.text, fontWeight: '600' },
  bedHint: { fontSize: fontSize.caption, color: colors.textMuted },
});
