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
import * as ImagePicker from 'expo-image-picker';

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
  // Editable profile fields the Edit dialog touches.
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  occupation?: string;
  employer_name?: string;
  hometown?: string;
  permanent_address?: string;
  id_type?: string;
  id_number?: string;
  id_proof_url?: string;
  vehicle_type?: 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER';
  vehicle_registration?: string | null;
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
  const { canRecordPayments } = useAppStore();
  const [showNotice, setShowNotice] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [idUploading, setIdUploading] = useState(false);

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
          {isActive && canRecordPayments() && (
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
          )}
          {isActive && (
            <Button
              variant="secondary"
              iconName="calendar-outline"
              label={r.notice_given_date ? 'Edit notice' : t('res.give_notice')}
              onPress={() => setShowNotice(true)}
            />
          )}
          <Button
            variant="secondary"
            iconName="create-outline"
            label="Edit"
            onPress={() => setShowEdit(true)}
          />
          <Button
            variant="secondary"
            iconName="cloud-upload-outline"
            label="Upload ID"
            onPress={uploadIdProof}
            loading={idUploading}
          />
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

      {showEdit && r && (
        <EditTenantModal
          tenant={r}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['resident', r.id] });
            qc.invalidateQueries({ queryKey: ['residents-mobile'] });
            setShowEdit(false);
          }}
        />
      )}
    </Screen>
  );

  /**
   * Aadhar / ID-proof upload. Uses expo-image-picker for camera-or-gallery
   * choice; we POST the selected file as multipart/form-data to the
   * existing /tenants/{id}/id-proof endpoint the web uses.
   */
  async function uploadIdProof() {
    if (!r) return;
    try {
      setIdUploading(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alertOnce('Photo permission denied — enable it in Settings to upload.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsMultipleSelection: false,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      const form = new FormData();
      // RN's FormData accepts the {uri, name, type} blob descriptor.
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? `id-${r.id}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      await api.post(`/tenants/${r.id}/id-proof`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      qc.invalidateQueries({ queryKey: ['resident', r.id] });
      alertOnce('ID proof uploaded.');
    } catch (err) {
      alertOnce(getApiError(err));
    } finally {
      setIdUploading(false);
    }
  }
}

function alertOnce(msg: string) {
  // Tiny wrapper so the resident page doesn't depend on Alert in two places.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native').Alert.alert(msg);
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

// ── Edit Tenant ────────────────────────────────────────────────────────────

function EditTenantModal({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: ResidentDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Mirrors EditTenantDialog on the web — same field set, same endpoint,
  // just laid out for one column on phone.
  const [name, setName] = useState(tenant.name);
  const [phone, setPhone] = useState(tenant.phone);
  const [email, setEmail] = useState(tenant.email ?? '');
  const [idType, setIdType] = useState(tenant.id_type ?? 'AADHAR');
  const [idNumber, setIdNumber] = useState(tenant.id_number ?? '');
  const [emergencyName, setEmergencyName] = useState(tenant.emergency_contact_name ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(tenant.emergency_contact_phone ?? '');
  const [emergencyRelation, setEmergencyRelation] = useState(
    tenant.emergency_contact_relation ?? '',
  );
  const [occupation, setOccupation] = useState(tenant.occupation ?? '');
  const [hometown, setHometown] = useState(tenant.hometown ?? '');
  const [permanentAddress, setPermanentAddress] = useState(tenant.permanent_address ?? '');
  const [vehicleType, setVehicleType] = useState<'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER'>(
    tenant.vehicle_type ?? 'NONE',
  );
  const [vehicleRegistration, setVehicleRegistration] = useState(
    tenant.vehicle_registration ?? '',
  );
  const [expectedMoveOut, setExpectedMoveOut] = useState(tenant.expected_move_out_date ?? '');
  const [error, setError] = useState('');

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (body: object) => api.patch(`/tenants/${tenant.id}`, body).then((r) => r.data),
  });

  async function save() {
    setError('');
    if (vehicleType !== 'NONE' && !vehicleRegistration.trim()) {
      setError('Vehicle registration is required when a vehicle type is set.');
      return;
    }
    try {
      await mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        id_type: idType,
        id_number: idNumber.trim() || null,
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
        emergency_contact_relation: emergencyRelation.trim() || null,
        occupation: occupation.trim() || null,
        hometown: hometown.trim() || null,
        permanent_address: permanentAddress.trim() || null,
        vehicle_type: vehicleType,
        vehicle_registration:
          vehicleType === 'NONE' ? null : vehicleRegistration.trim().toUpperCase(),
        expected_move_out_date: expectedMoveOut || null,
      });
      onSaved();
    } catch (err) {
      setError(getApiError(err));
    }
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={editStyles.modalBg}>
        <View style={editStyles.modalSheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
            <Text style={editStyles.title}>Edit resident</Text>
            <View style={{ flex: 1 }} />
            <IconButton name="close" accessibilityLabel="Close" onPress={onClose} />
          </View>

          <ScrollView style={{ maxHeight: '78%' }}>
            <Field label="Full name" value={name} onChangeText={setName} required />
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              required
            />
            <Field
              label="Email (optional)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="ID type (AADHAR / PASSPORT / DRIVING_LICENSE / OTHER)"
              value={idType}
              onChangeText={setIdType}
              autoCapitalize="characters"
            />
            <Field label="ID number" value={idNumber} onChangeText={setIdNumber} />

            <Text style={editStyles.section}>Emergency contact</Text>
            <Field label="Name" value={emergencyName} onChangeText={setEmergencyName} />
            <Field
              label="Phone"
              value={emergencyPhone}
              onChangeText={setEmergencyPhone}
              keyboardType="phone-pad"
            />
            <Field
              label="Relation"
              value={emergencyRelation}
              onChangeText={setEmergencyRelation}
              placeholder="Father, Mother…"
            />

            <Text style={editStyles.section}>Vehicle (for gate security)</Text>
            <Field
              label="Type (NONE / TWO_WHEELER / FOUR_WHEELER)"
              value={vehicleType}
              onChangeText={(v) => {
                const upper = (v.trim().toUpperCase() as typeof vehicleType) || 'NONE';
                setVehicleType(upper === 'TWO_WHEELER' || upper === 'FOUR_WHEELER' ? upper : 'NONE');
                if (upper === 'NONE') setVehicleRegistration('');
              }}
              autoCapitalize="characters"
            />
            {vehicleType !== 'NONE' && (
              <Field
                label="Registration number"
                placeholder="KA 01 AB 1234"
                value={vehicleRegistration}
                onChangeText={setVehicleRegistration}
                autoCapitalize="characters"
              />
            )}

            <Text style={editStyles.section}>Other</Text>
            <Field label="Occupation" value={occupation} onChangeText={setOccupation} />
            <Field label="Hometown" value={hometown} onChangeText={setHometown} />
            <Field
              label="Permanent address"
              value={permanentAddress}
              onChangeText={setPermanentAddress}
            />
            <Field
              label="Expected move-out date"
              placeholder="YYYY-MM-DD"
              value={expectedMoveOut}
              onChangeText={setExpectedMoveOut}
            />
          </ScrollView>

          {!!error && <Text style={{ color: colors.danger, marginVertical: space.sm }}>{error}</Text>}

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button variant="ghost" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
            <Button
              variant="primary"
              iconName="checkmark-outline"
              label={isPending ? 'Saving…' : 'Save changes'}
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

const editStyles = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    padding: space.lg,
    paddingBottom: space.xxl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
  },
  title: { fontSize: fontSize.h2, fontWeight: '700', color: colors.text },
  section: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: space.md,
    marginBottom: space.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
