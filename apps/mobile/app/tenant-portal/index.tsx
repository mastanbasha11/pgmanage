import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, tenantApi, getApiError } from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Step = 'phone' | 'otp' | 'home';

export default function TenantPortalScreen() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setLoading(true);
    try {
      await api.post('/tenant/auth/otp', { phone });
      setStep('otp');
    } catch (err) {
      Alert.alert('Error', getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>('/tenant/auth/verify', { phone, otp });
      await AsyncStorage.setItem('tenant_access_token', res.data.access_token);
      setStep('home');
    } catch (err) {
      Alert.alert('Invalid OTP', getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  if (step === 'phone') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Tenant Portal</Text>
        <Text style={styles.subtitle}>View your rent & complaints</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+919876543210"
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity
          style={[styles.btn, !phone && styles.btnDisabled]}
          onPress={requestOtp}
          disabled={loading || !phone}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send OTP</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'otp') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter OTP</Text>
        <Text style={styles.subtitle}>Sent to {phone}</Text>
        <TextInput
          style={[styles.input, { textAlign: 'center', letterSpacing: 8, fontSize: 22 }]}
          value={otp}
          onChangeText={setOtp}
          keyboardType="numeric"
          maxLength={6}
          placeholder="------"
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity
          style={[styles.btn, otp.length < 4 && styles.btnDisabled]}
          onPress={verifyOtp}
          disabled={loading || otp.length < 4}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#f1f5f9', marginTop: 8 }]}
          onPress={() => { setStep('phone'); setOtp(''); }}
        >
          <Text style={{ color: '#374151', fontWeight: '600' }}>Change Number</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <TenantHome />;
}

function TenantHome() {
  const { data: me } = useQuery({
    queryKey: ['tenant-me-mobile'],
    queryFn: () => tenantApi.get('/me').then((r) => r.data),
  });

  const { data: ledger } = useQuery({
    queryKey: ['tenant-ledger-mobile'],
    queryFn: () => tenantApi.get('/ledger').then((r) => r.data),
  });

  const fmtPaise = (p: number) =>
    '₹' + new Intl.NumberFormat('en-IN').format(p / 100);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.helloCard}>
        <Text style={styles.hello}>Hello, {me?.name ?? '...'} 👋</Text>
        <Text style={styles.helloSub}>Monthly Rent: {me ? fmtPaise(me.monthly_rent_paise) : '—'}</Text>
      </View>

      <Text style={styles.sectionTitle}>Payment History</Text>
      {(ledger?.entries ?? []).map((e: { id: string; month: number; year: number; amount_due_paise: number; status: string }) => (
        <View key={e.id} style={styles.ledgerRow}>
          <Text style={styles.ledgerMonth}>
            {new Date(e.year, e.month - 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' })}
          </Text>
          <Text style={styles.ledgerAmt}>{fmtPaise(e.amount_due_paise)}</Text>
          <Text style={[
            styles.ledgerStatus,
            { color: e.status === 'PAID' ? '#16a34a' : e.status === 'OVERDUE' ? '#dc2626' : '#d97706' }
          ]}>
            {e.status}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  input: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  btn: {
    width: '100%',
    maxWidth: 320,
    height: 44,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  helloCard: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
  },
  hello: { fontSize: 18, fontWeight: '700', color: '#fff' },
  helloSub: { fontSize: 13, color: '#bfdbfe', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  ledgerMonth: { flex: 1, fontSize: 14, color: '#374151' },
  ledgerAmt: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginRight: 10 },
  ledgerStatus: { fontSize: 12, fontWeight: '700' },
});
