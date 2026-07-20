/**
 * Properties list — one wide card per property, mirroring the web redesign in
 * apps/web/src/pages/properties/PropertiesPage.tsx: identity row with the
 * headline occupancy %, status pills, a 3-stat grid, and Edit / Open actions.
 *
 * Occupancy % comes straight from the backend's `occupancy_rate`, which already
 * folds RESERVED beds into "occupied" (a held bed isn't sellable). Never
 * recompute it client-side.
 *
 * The 6-month occupancy sparkline from the mock is intentionally dropped — web
 * removed it too.
 */
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Header, Card, Loading, Empty, Button, Row } from '../../components/ui';
import { Pill } from '../../components/redesign';
import { useProperties, type Property } from '../../lib/hooks/properties';
import { useAppStore } from '../../lib/store';
import { colors, space } from '../../lib/theme';

export default function PropertiesPage() {
  const router = useRouter();
  const properties = useProperties();
  const { setSelectedProperty } = useAppStore();

  const openProperty = (id: string) => {
    setSelectedProperty(id);
    router.push('/tabs/rooms');
  };

  const editProperty = (id: string) =>
    router.push({ pathname: '/properties/setup', params: { propertyId: id } });

  return (
    <Screen>
      <Header
        title="Properties"
        subtitle="Manage floors, rooms and beds"
        onBack={() => router.back()}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        {properties.isLoading ? (
          <Loading />
        ) : properties.data?.items?.length === 0 ? (
          <Empty
            title="No properties yet"
            hint="Create your first property from the web app."
            iconName="business-outline"
          />
        ) : (
          properties.data?.items.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              onOpen={() => openProperty(p.id)}
              onEdit={() => editProperty(p.id)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function PropertyCard({
  property,
  onOpen,
  onEdit,
}: {
  property: Property;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const total = property.total_beds ?? 0;
  const occupied = property.occupied_beds ?? 0;
  const vacant = property.vacant_beds ?? 0;
  const reserved = property.reserved_beds ?? 0;
  // Backend already counts RESERVED as occupied inside occupancy_rate.
  const pct = Math.round((property.occupancy_rate ?? 0) * 100);
  const isEmpty = total === 0;

  return (
    <Card style={styles.card}>
      {/* identity row */}
      <View style={styles.identity}>
        <View style={styles.logo}>
          <Ionicons name="business" size={18} color={colors.white} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {property.name}
          </Text>
          {!!property.address && (
            <Text style={styles.addr} numberOfLines={1}>
              {property.address}
            </Text>
          )}
        </View>
        {!isEmpty && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.pct}>{pct}%</Text>
            <Text style={styles.pctLabel}>occupancy</Text>
            <Text style={styles.pctLabel}>
              {occupied} of {total} beds
            </Text>
          </View>
        )}
      </View>

      {/* pills */}
      <Row gap={6} wrap style={styles.pills}>
        {isEmpty ? (
          <Pill label="No rooms yet — run setup" tone="a" />
        ) : (
          <>
            {vacant > 0 && <Pill label={`${vacant} beds vacant now`} tone="g" />}
            {reserved > 0 && <Pill label={`${reserved} reserved`} tone="a" />}
            {vacant === 0 && reserved === 0 && <Pill label="Full house" tone="g" />}
          </>
        )}
      </Row>

      {/* stat grid */}
      {!isEmpty && (
        <View style={styles.grid}>
          <Stat label="Total beds" value={String(total)} />
          <Stat
            label="Occupied"
            value={String(occupied)}
            foot={reserved > 0 ? `incl. ${reserved} reserved` : undefined}
          />
          <Stat label="Vacant" value={String(vacant)} foot="sellable today" last />
        </View>
      )}

      {/* actions */}
      <Row gap={space.sm} style={styles.actions}>
        <Button
          label="Edit"
          variant="secondary"
          size="sm"
          iconName="pencil-outline"
          onPress={onEdit}
        />
        <View style={{ flex: 1 }} />
        <Button label="Open" size="sm" iconName="chevron-forward" onPress={onOpen} />
      </Row>
    </Card>
  );
}

function Stat({
  label,
  value,
  foot,
  last,
}: {
  label: string;
  value: string;
  foot?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.statCell, last && { borderRightWidth: 0 }]}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue}>{value}</Text>
      {!!foot && (
        <Text style={styles.statFoot} numberOfLines={1}>
          {foot}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.md, padding: 0, overflow: 'hidden' },

  identity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: 13,
    paddingTop: 13,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  addr: { fontSize: 11, fontWeight: '600', color: colors.textDim, marginTop: 2 },
  pct: { fontSize: 20, fontWeight: '800', color: colors.accent, letterSpacing: -0.4 },
  pctLabel: { fontSize: 11, fontWeight: '600', color: colors.textDim, textAlign: 'right' },

  pills: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 12 },

  grid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: colors.borderSoft,
  },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textDim },
  statValue: { fontSize: 15.5, fontWeight: '800', color: colors.text, marginTop: 2 },
  statFoot: { fontSize: 10, color: colors.textDim, fontWeight: '600', marginTop: 2 },

  actions: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
});
