import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

type BedStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';

interface Bed {
  id: string;
  label: string;
  status: BedStatus;
  tenant_name?: string;
}

interface Room {
  id: string;
  room_number: string;
  floor_number: number;
  beds: Bed[];
}

const BED_COLORS: Record<BedStatus, string> = {
  VACANT: '#dcfce7',
  OCCUPIED: '#dbeafe',
  MAINTENANCE: '#fee2e2',
};

const BED_BORDER: Record<BedStatus, string> = {
  VACANT: '#86efac',
  OCCUPIED: '#93c5fd',
  MAINTENANCE: '#fca5a5',
};

export default function RoomsScreen() {
  const { selectedPropertyId } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['occupancy', selectedPropertyId],
    queryFn: () =>
      api.get(`/properties/${selectedPropertyId}/occupancy`).then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  if (!selectedPropertyId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Select a property to view rooms.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  const rooms: Room[] = data?.floors?.flatMap((f: { rooms: Room[] }) => f.rooms) ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {/* Legend */}
      <View style={styles.legend}>
        {(['VACANT', 'OCCUPIED', 'MAINTENANCE'] as BedStatus[]).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BED_BORDER[s] }]} />
            <Text style={styles.legendText}>{s}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {rooms.map((room) => (
          <View key={room.id} style={styles.roomCard}>
            <Text style={styles.roomNumber}>Room {room.room_number}</Text>
            <Text style={styles.floorLabel}>Floor {room.floor_number}</Text>
            <View style={styles.beds}>
              {room.beds.map((bed) => (
                <View
                  key={bed.id}
                  style={[
                    styles.bed,
                    { backgroundColor: BED_COLORS[bed.status], borderColor: BED_BORDER[bed.status] },
                  ]}
                >
                  <Text style={styles.bedLabel}>Bed {bed.label}</Text>
                  {bed.tenant_name && (
                    <Text style={styles.bedTenant} numberOfLines={1}>
                      {bed.tenant_name}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#94a3b8', fontSize: 14 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#64748b' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  roomCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  roomNumber: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  floorLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 8 },
  beds: { gap: 6 },
  bed: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 6,
  },
  bedLabel: { fontSize: 12, fontWeight: '600', color: '#374151' },
  bedTenant: { fontSize: 10, color: '#64748b', marginTop: 2 },
});
