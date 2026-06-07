/**
 * Resident detail. Profile + payments history + actions (record payment,
 * give notice, share contact via WhatsApp).
 *
 * Notice / check-out submission is handled here too — mirroring the
 * web NoticeDialog and CheckoutDialog flows in a single tap-friendly screen.
 */
import { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { api, getApiError } from '../../lib/api';
import { t } from '../../lib/i18n';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import { useAppStore } from '../../lib/store';
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

interface ResidentDetail {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: 'ACTIVE' | 'CHECKED_OUT' | 'RESERVED';
  move_in_date: string;
  expected_move_out_date?: string;
  notice_given_date?: string;
  property_name?: string;
  room_number?: string;
  bed_label?: string;
  floor_name?: string;
  monthly_rent_paise?: number;
  active_rent_plan?: {
    security_deposit_paise?: number;
    advance_paid_paise?: number;
    monthly_rent_paise?: number;
  } | null;
}

interface Payment {
  id: string;
  amount_paise: number;
  payment_type: string;
  payment_mode: string;
  collected_at: string;
  for_month?: number;
  for_year?: number;
  paid_to?: string;
}

export default function ResidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [showNotice, setShowNotice] = useState(false);

  const { data: r, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['resident', id],
    queryFn: () => api.get<ResidentDetail>(`/tenants/${id}`).then((res) => res.data),
    enabled: !!id,
  });

  const { data: payments } = useQuery({
    queryKey: ['resident-payments', id],
    queryFn: () =>
      api
        .get<{ items: Payment[] }>('/payments', { params: { tenant_id: id, limit: 20 } })
        .then((res) => res.data),
    enabled: !!id,
  });

  function shareWhatsApp() {
    if (!r) return;
    const text = `Hi ${r.name}, your rent details are available on PGManage.`;
    const phone = r.phone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
  }

  if (isLoading || !r) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  const isActive = r.status === 'ACTIVE';

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
        }
      >
        {/* App bar with back */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <IconButton
            name="arrow-back"
            accessibilityLabel="Back"
            onPress={() => router.back()}
          />
          <Header title={r.name} subtitle={r.phone} />
        </View>

        {/* Status & notice */}
        <Card style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <StatusPill label={r.status} tone={isActive ? 'success' : 'neutral'} />
            {r.notice_given_date && r.expected_move_out_date && (
              <StatusPill
                label={`Notice · vacate ${r.expected_move_out_date}`}
                tone="warn"
              />
            )}
          </View>
          <Text style={styles.metaLine}>
            {r.property_name ?? '—'} ·{' '}
            {r.floor_name ? `${r.floor_name} ` : ''}
            {r.room_number ? `Room ${r.room_number}` : ''}
            {r.bed_label ? ` · Bed ${r.bed_label}` : ''}
          </Text>
          <Text style={styles.metaLine}>Moved in: {r.move_in_date}</Text>
          <Text style={styles.metaLine}>
            Rent: {rupees(r.active_rent_plan?.monthly_rent_paise ?? r.monthly_rent_paise ?? 0)}
            /mo · Deposit:{' '}
            {rupees(r.active_rent_plan?.security_deposit_paise ?? 0)}
          </Text>
        </Card>

        {/* Actions */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {isActive && (
            <>
              <Button
                variant="primary"
                iconName="cash-outline"
                label={t('res.record_payment')}
                onPress={() =>
                  router.push({
                    pathname: '/payments/new',
                    params: { tenant_id: r.id, name: r.name },
                  })
                }
              />
              <Button
                variant="secondary"
                iconName="calendar-outline"
                label={r.notice_given_date ? 'Edit notice' : t('res.give_notice')}
                onPress={() => setShowNotice(true)}
              />
            </>
          )}
          <Button
            variant="ghost"
            iconName="logo-whatsapp"
            label="WhatsApp"
            onPress={shareWhatsApp}
          />
        </View>

        {/* Payments history */}
        <Text style={styles.sectionTitle}>{t('res.payments')}</Text>
        {(payments?.items ?? []).length === 0 ? (
          <Empty
            iconName="receipt-outline"
            title="No payments yet"
            hint="Record the first payment from the action above."
          />
        ) : (
          (payments?.items ?? []).map((p) => (
            <Card key={p.id} style={styles.paymentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentTitle}>
                  {rupees(p.amount_paise)}{' '}
                  <Text style={styles.paymentMeta}>· {p.payment_type}</Text>
                </Text>
                <Text style={styles.paymentMeta}>
                  {p.payment_mode}
                  {p.for_month ? ` · ${p.for_month}/${p.for_year}` : ''}
                  {p.paid_to ? ` · ${p.paid_to}` : ''}
                </Text>
              </View>
              <Text style={styles.paymentDate}>{p.collected_at?.slice(0, 10)}</Text>
            </Card>
          ))
        )}
      </ScrollView>

      {showNotice && r && (
        <NoticeModal
          tenantId={r.id}
          tenantName={r.name}
          existing={{
            notice: r.notice_given_date ?? null,
            vacate: r.expected_move_out_date ?? null,
          }}
          onClose={() => setShowNotice(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['resident', r.id] });
            qc.invalidateQueries({ queryKey: ['residents-mobile'] });
            setShowNotice(false);
          }}
        />
      )}
    </Screen>
  );
}

function NoticeModal({
  tenantId,
  tenantName,
  existing,
  onClose,
  onSaved,
}: {
  tenantId: string;
  tenantName: string;
  existing: { notice: string | null; vacate: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [vacate, setVacate] = useState(existing.vacate ?? '');
  const [noticeDate, setNoticeDate] = useState(existing.notice ?? today);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (payload: object) =>
      api.post(`/tenants/${tenantId}/notice`, payload).then((r) => r.data),
  });

  async function submit() {
    setError('');
    if (!vacate) {
      setError('Pick the vacate date');
      return;
    }
    try {
      await mutateAsync({
        expected_move_out_date: vacate,
        notice_given_date: noticeDate,
        notes: notes || undefined,
      });
      onSaved();
    } catch (err) {
      setError(getApiError(err));
    }
  }

  async function clear() {
    setError('');
    try {
      await mutateAsync({ expected_move_out_date: null });
      onSaved();
    } catch (err) {
      setError(getApiError(err));
    }
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalSheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
            <Text style={styles.modalTitle}>{t('res.give_notice')}</Text>
            <View style={{ flex: 1 }} />
            <IconButton name="close" accessibilityLabel="Close" onPress={onClose} />
          </View>
          <Text style={styles.modalSub}>{tenantName}</Text>

          <Field
            label="Notice given on"
            placeholder="YYYY-MM-DD"
            value={noticeDate}
            onChangeText={setNoticeDate}
          />
          <Field
            label="Vacating on"
            placeholder="YYYY-MM-DD"
            value={vacate}
            onChangeText={setVacate}
          />
          <Field
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Reason / handover"
          />

          {!!error && (
            <Text style={{ color: colors.danger, marginBottom: space.sm }}>{error}</Text>
          )}

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {existing.vacate && (
              <Button
                variant="ghost"
                iconName="trash-outline"
                label="Clear"
                onPress={clear}
                loading={isPending}
                style={{ flex: 1 }}
              />
            )}
            <Button
              variant="primary"
              iconName="checkmark-outline"
              label={t('common.save')}
              onPress={submit}
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
  metaLine: { color: colors.textMuted, fontSize: fontSize.small },
  sectionTitle: {
    fontSize: fontSize.h3,
    fontWeight: '700',
    color: colors.text,
    marginTop: space.md,
  },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  paymentTitle: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  paymentMeta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  paymentDate: { fontSize: fontSize.caption, color: colors.textDim },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    padding: space.lg,
    paddingBottom: space.xxl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  modalTitle: { fontSize: fontSize.h2, fontWeight: '700', color: colors.text },
  modalSub: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: space.md },
});

// Suppress unused-icon warning — re-exported here for future tabs
export { Ionicons as _Ionicons };
