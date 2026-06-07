import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
// Idempotency key generated inline below — avoids the 'uuid' dep, which needs a
// crypto polyfill (react-native-get-random-values) to run in React Native.
const newIdempotencyKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

interface LedgerEntry {
  id: string;
  tenant_id: string;
  tenant_name: string;
  month: number;
  year: number;
  amount_due_paise: number;
  amount_paid_paise: number;
  outstanding_paise: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  PAID: '#dcfce7',
  PARTIAL: '#fef9c3',
  PENDING: '#f1f5f9',
  OVERDUE: '#fee2e2',
};

const STATUS_TEXT: Record<string, string> = {
  PAID: '#166534',
  PARTIAL: '#854d0e',
  PENDING: '#374151',
  OVERDUE: '#dc2626',
};

export default function RentScreen() {
  const { selectedPropertyId } = useAuthStore();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [payEntry, setPayEntry] = useState<LedgerEntry | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['rent-ledger-mobile', selectedPropertyId, month, year],
    queryFn: () =>
      api.get('/rent/ledger', {
        params: { property_id: selectedPropertyId, month, year },
      }).then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const { mutateAsync: record, isPending } = useMutation({
    mutationFn: (payload: object) =>
      api.post('/payments', payload, {
        headers: { 'X-Idempotency-Key': newIdempotencyKey() },
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rent-ledger-mobile'] });
      setPayEntry(null);
      setPayAmount('');
    },
  });

  async function submitPayment() {
    if (!payEntry || !payAmount) return;
    try {
      await record({
        tenant_id: payEntry.tenant_id,
        amount_paise: Math.round(Number(payAmount) * 100),
        payment_type: 'RENT',
        payment_mode: 'CASH',
        for_month: payEntry.month,
        for_year: payEntry.year,
      });
      Alert.alert('Payment recorded', `₹${payAmount} recorded for ${payEntry.tenant_name}`);
    } catch (err) {
      Alert.alert('Error', getApiError(err));
    }
  }

  const entries: LedgerEntry[] = data?.items ?? [];
  const totalOutstanding = entries.reduce((s, e) => s + e.outstanding_paise, 0);

  const fmtRupees = (p: number) =>
    '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(p / 100);

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Header controls */}
      <View style={styles.header}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {MONTH_NAMES.map((m, i) => (
              <TouchableOpacity
                key={m}
                style={[styles.monthChip, month === i + 1 && styles.monthChipActive]}
                onPress={() => setMonth(i + 1)}
              >
                <Text style={[styles.monthChipText, month === i + 1 && styles.monthChipTextActive]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        {totalOutstanding > 0 && (
          <Text style={styles.outstanding}>Outstanding: {fmtRupees(totalOutstanding)}</Text>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#2563eb" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {entries.map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tenantName}>{e.tenant_name}</Text>
                <Text style={styles.meta}>Due: {fmtRupees(e.amount_due_paise)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[styles.badge, { backgroundColor: STATUS_COLORS[e.status] ?? '#f1f5f9' }]}>
                  <Text style={[styles.badgeText, { color: STATUS_TEXT[e.status] ?? '#374151' }]}>
                    {e.status}
                  </Text>
                </View>
                {e.status !== 'PAID' && (
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => {
                      setPayEntry(e);
                      setPayAmount(String(e.outstanding_paise / 100));
                    }}
                  >
                    <Text style={styles.payBtnText}>Pay</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          {entries.length === 0 && (
            <Text style={styles.empty}>No entries for this month. Generate from web.</Text>
          )}
        </ScrollView>
      )}

      {/* Payment modal */}
      <Modal visible={!!payEntry} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Record Payment</Text>
            {payEntry && (
              <Text style={styles.modalSub}>{payEntry.tenant_name} — {MONTH_NAMES[payEntry.month - 1]} {payEntry.year}</Text>
            )}
            <TextInput
              style={styles.payInput}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="Amount in ₹"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#f1f5f9' }]}
                onPress={() => { setPayEntry(null); setPayAmount(''); }}
              >
                <Text style={{ color: '#374151', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563eb', flex: 1 }]}
                onPress={submitPayment}
                disabled={isPending}
              >
                {isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  monthChipActive: { backgroundColor: '#2563eb' },
  monthChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  monthChipTextActive: { color: '#fff' },
  outstanding: { fontSize: 12, color: '#dc2626', fontWeight: '600', marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tenantName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  payBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  payBtnText: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
  empty: { textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 40 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  payInput: {
    height: 52,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  modalBtn: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
