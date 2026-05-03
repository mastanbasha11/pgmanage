import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

// 3-tap flow: (1) tap category → (2) enter amount → (3) confirm
type Step = 'category' | 'amount' | 'confirm';

interface Category { id: string; name: string; icon?: string; }

export default function ExpensesScreen() {
  const { selectedPropertyId } = useAuthStore();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('category');
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const { data: cats } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expense-categories').then((r) => r.data),
    staleTime: Infinity,
  });

  const { data: recent, isLoading } = useQuery({
    queryKey: ['expenses-recent', selectedPropertyId],
    queryFn: () =>
      api.get('/expenses', {
        params: { property_id: selectedPropertyId, page_size: 20 },
      }).then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (data: object) => api.post('/expenses', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses-recent'] });
      resetFlow();
    },
  });

  function resetFlow() {
    setStep('category');
    setSelectedCat(null);
    setAmount('');
    setDescription('');
  }

  async function confirmExpense() {
    if (!selectedCat || !amount || !selectedPropertyId) return;
    try {
      await mutateAsync({
        category_id: selectedCat.id,
        description: description || selectedCat.name,
        amount_paise: Math.round(Number(amount) * 100),
        expense_date: new Date().toISOString().slice(0, 10),
        property_id: selectedPropertyId,
      });
      Alert.alert('Saved!', `₹${amount} expense recorded.`);
    } catch (err) {
      Alert.alert('Error', getApiError(err));
    }
  }

  const categories: Category[] = cats?.items ?? [];

  const formatPaise = (p: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p / 100);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Quick add - 3 tap flow */}
      <View style={styles.quickAdd}>
        <Text style={styles.quickTitle}>Quick Add Expense</Text>

        {/* Step indicator */}
        <View style={styles.steps}>
          {(['category', 'amount', 'confirm'] as Step[]).map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, step === s && styles.stepDotActive]}>
                <Text style={[styles.stepNum, step === s && styles.stepNumActive]}>{i + 1}</Text>
              </View>
              {i < 2 && <View style={[styles.stepLine, i < (['category', 'amount', 'confirm'] as Step[]).indexOf(step) && styles.stepLineDone]} />}
            </View>
          ))}
        </View>

        {step === 'category' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 4 }}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.catChip}
                  onPress={() => { setSelectedCat(cat); setStep('amount'); }}
                >
                  <Text style={styles.catName}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {step === 'amount' && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.stepLabel}>{selectedCat?.name} — Enter Amount (₹)</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              autoFocus
            />
            <TextInput
              style={[styles.amountInput, { fontSize: 13, height: 36, marginTop: 8 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.btnSecondary} onPress={resetFlow}>
                <Text style={styles.btnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, !amount && styles.btnDisabled]}
                disabled={!amount}
                onPress={() => setStep('confirm')}
              >
                <Text style={styles.btnText}>Next →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'confirm' && (
          <View style={{ marginTop: 12, padding: 12, backgroundColor: '#eff6ff', borderRadius: 10 }}>
            <Text style={styles.confirmLine}>Category: <Text style={{ fontWeight: '700' }}>{selectedCat?.name}</Text></Text>
            <Text style={styles.confirmLine}>Amount: <Text style={{ fontWeight: '700' }}>₹{amount}</Text></Text>
            {description ? <Text style={styles.confirmLine}>Note: {description}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('amount')}>
                <Text style={styles.btnSecText}>← Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={confirmExpense} disabled={isPending}>
                {isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>Save Expense</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Recent expenses */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.sectionTitle}>Recent Expenses</Text>
        {isLoading && <ActivityIndicator color="#2563eb" style={{ marginTop: 20 }} />}
        {(recent?.items ?? []).map((e: { id: string; category_name: string; description: string; amount_paise: number; expense_date: string; status: string }) => (
          <View key={e.id} style={styles.expenseRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.expDesc}>{e.description}</Text>
              <Text style={styles.expMeta}>{e.category_name} · {e.expense_date}</Text>
            </View>
            <Text style={styles.expAmt}>{formatPaise(e.amount_paise)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  quickAdd: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  quickTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  steps: { flexDirection: 'row', alignItems: 'center' },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: '#2563eb' },
  stepNum: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  stepNumActive: { color: '#fff' },
  stepLine: { width: 24, height: 2, backgroundColor: '#e2e8f0' },
  stepLineDone: { backgroundColor: '#2563eb' },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  catName: { fontSize: 13, fontWeight: '600', color: '#334155' },
  stepLabel: { fontSize: 13, color: '#64748b', marginBottom: 6 },
  amountInput: {
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
  btnPrimary: {
    flex: 1,
    height: 40,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnSecText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  confirmLine: { fontSize: 14, color: '#374151', marginBottom: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  expDesc: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  expMeta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  expAmt: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
});
