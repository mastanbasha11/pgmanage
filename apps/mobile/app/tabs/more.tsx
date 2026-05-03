import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../lib/store';

export default function MoreScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/auth/login');
        },
      },
    ]);
  }

  const items = [
    { label: 'Tenant Portal', action: () => router.push('/tenant-portal'), emoji: '🏠' },
    { label: 'Sign Out', action: handleLogout, emoji: '🚪', danger: true },
  ];

  return (
    <View style={styles.container}>
      {/* User card */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.role}>{user?.role}</Text>
        </View>
      </View>

      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity key={item.label} style={styles.row} onPress={item.action}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={[styles.label, item.danger && styles.dangerText]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.version}>PGManage v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  role: { fontSize: 12, color: '#64748b', marginTop: 2 },
  list: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  emoji: { fontSize: 18 },
  label: { fontSize: 15, color: '#0f172a', fontWeight: '500' },
  dangerText: { color: '#dc2626' },
  version: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 32 },
});
