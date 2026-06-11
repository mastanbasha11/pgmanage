/**
 * Expenses tab. Mirrors the web ExpensesPage:
 *
 *   ┌─────────────────────────────────────────┐
 *   │ Expenses        [+ Add expense] (big)   │
 *   │ Filter: [ Mine | Everyone ] (OWNER+)    │
 *   ├─────────────────────────────────────────┤
 *   │ Recent expense rows…                    │
 *
 * The Add button is always visible at the top (sticky-feel header). Tap →
 * full-screen modal with category / amount / description / vendor /
 * paid-by / mode / date.
 *
 * RBAC: OWNER + PARTNER see the Mine/Everyone toggle. Others always see
 * just their own (backend enforces this too via created_by filter).
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { api, getApiError } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { colors, radius, space, type as fontSize, TOUCH_TARGET } from '../../lib/theme';
import {
  Button,
  Card,
  Empty,
  Field,
  Header,
  IconButton,
  Loading,
  rupees,
  Screen,
  StatusPill,
} from '../../components/ui';

interface Category {
  id: string;
  name: string;
  icon?: string;
}

interface Expense {
  id: string;
  category_name: string;
  description: string | null;
  vendor_name?: string | null;
  paid_by?: string | null;
  amount_paise: number;
  payment_mode?: string | null;
  purchase_date: string;
  approval_status: 'APPROVED' | 'PENDING' | 'REJECTED';
  created_by_name?: string | null;
}

export default function ExpensesScreen() {
  const { selectedPropertyId, user, canAccessFinancials } = useAppStore();
  const hasFinancials = canAccessFinancials();
  const [scope, setScope] = useState<'mine' | 'all'>(hasFinancials ? 'all' : 'mine');
  const [showAdd, setShowAdd] = useState(false);

  const { data: recent, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['expenses-recent', selectedPropertyId, scope, user?.user_id],
    queryFn: () =>
      api
        .get<{ items: Expense[] }>('/expenses', {
          params: {
            property_id: selectedPropertyId,
            page_size: 50,
            created_by: scope === 'mine' ? user?.user_id : undefined,
          },
        })
        .then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const items = recent?.items ?? [];

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Header title="Expenses" />

        {/* Prominent Add button — the user explicitly called this out as
            missing in v1. Sticky-top so it's always one tap away. */}
        <Button
          variant="primary"
          iconName="add-circle-outline"
          label="Add expense"
          onPress={() => setShowAdd(true)}
          block
        />

        {/* Scope toggle (OWNER/PARTNER only). For non-financial roles,
            always shows their own; no toggle. */}
        {hasFinancials && (
          <View style={styles.scopeRow}>
            {(['mine', 'all'] as const).map((s) => {
              const active = scope === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setScope(s)}
                  style={[styles.scopeChip, active && styles.scopeChipActive]}
                >
                  <Text style={[styles.scopeChipText, active && styles.scopeChipTextActive]}>
                    {s === 'mine' ? 'Mine' : 'Everyone'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
          }
          renderItem={({ item }) => <ExpenseRow item={item} />}
          ListEmptyComponent={
            <Empty
              iconName="receipt-outline"
              title="No expenses yet"
              hint="Tap “Add expense” to record one — categories, vendor, paid-by, all in one flow."
            />
          }
        />
      )}

      {showAdd && (
        <AddExpenseModal
          propertyId={selectedPropertyId ?? null}
          onClose={() => setShowAdd(false)}
        />
      )}
    </Screen>
  );
}

function ExpenseRow({ item }: { item: Expense }) {
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.description || item.category_name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.category_name} · {item.purchase_date}
          {item.paid_by ? ` · paid by ${item.paid_by}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.rowAmount}>{rupees(item.amount_paise)}</Text>
        {item.approval_status !== 'APPROVED' && (
          <StatusPill
            label={item.approval_status}
            tone={item.approval_status === 'PENDING' ? 'warn' : 'danger'}
          />
        )}
      </View>
    </Card>
  );
}

// ── Add Expense modal ──────────────────────────────────────────────────────

function AddExpenseModal({
  propertyId,
  onClose,
}: {
  propertyId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState<string>('');
  const [categoryName, setCategoryName] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [mode, setMode] = useState<'CASH' | 'UPI' | 'BANK'>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: cats } = useQuery({
    queryKey: ['expense-categories', propertyId],
    queryFn: () =>
      api
        .get<{ items: Category[] }>('/expense-categories', { params: { property_id: propertyId } })
        .then((r) => r.data),
    enabled: !!propertyId,
    staleTime: Infinity,
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (data: object) => api.post('/expenses', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses-recent'] });
    },
  });

  async function save() {
    if (!propertyId) return Alert.alert('Pick a property first');
    if (!categoryId) return Alert.alert('Pick a category');
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return Alert.alert('Enter the amount');
    try {
      await mutateAsync({
        property_id: propertyId,
        category_id: categoryId,
        amount_paise: Math.round(n * 100),
        description: description || categoryName || undefined,
        vendor_name: vendor || undefined,
        paid_by: paidBy || undefined,
        payment_mode: mode,
        reference_number: mode !== 'CASH' ? referenceNumber || undefined : undefined,
        purchase_date: purchaseDate,
      });
      Alert.alert('✅ Expense recorded', `₹${amount} added to ${categoryName}.`);
      onClose();
    } catch (err) {
      Alert.alert('Error', getApiError(err));
    }
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalSheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
            <Text style={styles.modalTitle}>Add expense</Text>
            <View style={{ flex: 1 }} />
            <IconButton name="close" accessibilityLabel="Close" onPress={onClose} />
          </View>

          <FlatList
            data={cats?.items ?? []}
            keyExtractor={(c) => c.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginBottom: space.sm }}
            contentContainerStyle={{ gap: space.xs, paddingVertical: space.xs }}
            ListEmptyComponent={
              <ActivityIndicator color={colors.accent} style={{ paddingHorizontal: space.lg }} />
            }
            renderItem={({ item }) => {
              const active = categoryId === item.id;
              return (
                <Pressable
                  onPress={() => {
                    setCategoryId(item.id);
                    setCategoryName(item.name);
                  }}
                  style={[styles.catChip, active && styles.catChipActive]}
                >
                  <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
          />

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Amount (₹)"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                required
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Date"
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder={categoryName ? `e.g. ${categoryName} bill` : 'What was it for?'}
          />
          <Field
            label="Vendor (optional)"
            value={vendor}
            onChangeText={setVendor}
            placeholder="Shop / supplier"
          />
          <Field
            label="Paid by"
            value={paidBy}
            onChangeText={setPaidBy}
            placeholder="Suresh, Owner, Manager…"
          />

          <Text style={styles.sectionLabel}>Mode</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            {(['CASH', 'UPI', 'BANK'] as const).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[styles.modeChip, active && styles.modeChipActive]}
                >
                  <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                    {m}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {mode !== 'CASH' && (
            <Field
              label="Reference (optional)"
              value={referenceNumber}
              onChangeText={setReferenceNumber}
              placeholder="UPI ref / cheque #"
            />
          )}

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Button variant="ghost" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
            <Button
              variant="primary"
              iconName="checkmark-outline"
              label={isPending ? 'Saving…' : 'Save expense'}
              onPress={save}
              loading={isPending}
              block
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
    backgroundColor: colors.bg,
  },
  scopeRow: { flexDirection: 'row', gap: space.xs },
  scopeChip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  scopeChipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textMuted },
  scopeChipTextActive: { color: colors.white },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  rowTitle: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    padding: space.lg,
    paddingBottom: space.xxl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '95%',
  },
  modalTitle: { fontSize: fontSize.h2, fontWeight: '700', color: colors.text },

  catChip: {
    paddingHorizontal: space.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  catChipText: { fontSize: fontSize.small, fontWeight: '700', color: colors.textMuted },
  catChipTextActive: { color: colors.white },

  sectionLabel: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  modeChip: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeChipText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textMuted },
  modeChipTextActive: { color: colors.white },
});
