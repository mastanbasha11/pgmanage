import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

interface Tenant {
  id: string;
  name: string;
  phone: string;
  is_active: boolean;
  monthly_rent_paise: number;
  move_in_date: string;
}

export default function TenantsScreen() {
  const { selectedPropertyId } = useAuthStore();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenants-mobile', selectedPropertyId, search],
    queryFn: () =>
      api.get('/tenants', {
        params: { property_id: selectedPropertyId, search: search || undefined, is_active: true },
      }).then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const tenants: Tenant[] = data?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or phone..."
          placeholderTextColor="#94a3b8"
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color="#2563eb" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tenants}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item: t }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {t.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{t.name}</Text>
                <Text style={styles.phone}>{t.phone}</Text>
              </View>
              <Text style={styles.rent}>
                ₹{new Intl.NumberFormat('en-IN').format(t.monthly_rent_paise / 100)}
                {'\n'}<Text style={{ fontSize: 10, color: '#94a3b8' }}>/mo</Text>
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No active tenants found.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  phone: { fontSize: 12, color: '#64748b', marginTop: 2 },
  rent: { fontSize: 14, fontWeight: '700', color: '#0f172a', textAlign: 'right' },
  empty: { textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 40 },
});
