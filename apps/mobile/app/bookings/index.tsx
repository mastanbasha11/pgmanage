/**
 * Bookings — daily stays + advance bookings for the property.
 * Month/year picker + kind filter + list; FAB → add booking.
 */
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Screen,
  Header,
  Card,
  Loading,
  Empty,
  Chip,
  ChipStrip,
  Fab,
  Row,
  StatusPill,
  Sheet,
  Field,
  MoneyField,
  DateField,
  Select,
  Textarea,
  Button,
  IconButton,
  ConfirmDialog,
  Section,
  rupees,
  formatDateHuman,
} from '../../components/ui';
import { useAppStore } from '../../lib/store';
import {
  useBookings,
  useCreateBooking,
  useDeleteBooking,
  useUpdateBooking,
  type Booking,
  type BookingKind,
  type CreateBookingPayload,
} from '../../lib/hooks/bookings';
import { getApiError } from '../../lib/api';
import { colors, radius, space, type as fontSize } from '../../lib/theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function nowMY() {
  const d = new Date();
  return { m: d.getMonth() + 1, y: d.getFullYear() };
}

export default function BookingsPage() {
  const router = useRouter();
  const { selectedPropertyId } = useAppStore();
  const [{ m: month, y: year }, setMY] = useState(nowMY);
  const [kind, setKind] = useState<BookingKind | 'ALL'>('ALL');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState<Booking | null>(null);

  const bookings = useBookings({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
    kind,
  });
  const del = useDeleteBooking();

  const items = bookings.data?.items ?? [];
  const totalPaise = items.reduce((a, b) => a + b.amount_paise, 0);
  const dailyPaise = items.filter((b) => b.kind === 'DAILY').reduce((a, b) => a + b.amount_paise, 0);
  const advancePaise = items.filter((b) => b.kind === 'ADVANCE').reduce((a, b) => a + b.amount_paise, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm }}>
        <Header title="Bookings" subtitle={`${items.length} · ${rupees(totalPaise)}`} onBack={() => router.back()} />
        <ChipStrip>
          {MONTHS.map((m, i) => (
            <Chip key={m} label={m} active={i + 1 === month} onPress={() => setMY({ m: i + 1, y: year })} />
          ))}
          <Chip label={String(year)} iconName="calendar-outline" onPress={() => setMY({ m: month, y: year - 1 })} />
        </ChipStrip>
        <View style={{ height: space.sm }} />
        <Row gap={space.xs} wrap>
          <Chip label="All" active={kind === 'ALL'} onPress={() => setKind('ALL')} count={items.length} />
          <Chip label="Daily" active={kind === 'DAILY'} onPress={() => setKind('DAILY')} />
          <Chip label="Advance" active={kind === 'ADVANCE'} onPress={() => setKind('ADVANCE')} />
        </Row>
      </View>

      {bookings.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
          refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={bookings.refetch} tintColor={colors.accent} />}
        >
          <Row gap={space.sm} style={{ marginBottom: space.md }}>
            <SumTile label="Daily stays" value={rupees(dailyPaise)} tone="info" />
            <SumTile label="Advance" value={rupees(advancePaise)} tone="warn" />
          </Row>

          {items.length === 0 ? (
            <Empty title="No bookings this month" iconName="calendar-outline" hint="Tap + to record one" />
          ) : (
            items.map((b) => (
              <Card key={b.id} style={{ marginBottom: space.sm }}>
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{b.guest_name}</Text>
                    <Text style={styles.meta}>
                      {b.room_label ?? '—'} · {b.guest_phone ?? ''}
                    </Text>
                    <Row gap={space.xs} style={{ marginTop: space.xs }}>
                      <StatusPill label={b.kind} tone={b.kind === 'DAILY' ? 'info' : 'warn'} />
                      {b.check_in && (
                        <StatusPill label={formatDateHuman(b.check_in)} tone="neutral" />
                      )}
                    </Row>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amount}>{rupees(b.amount_paise)}</Text>
                    <Row gap={4} style={{ marginTop: 4 }}>
                      <IconButton
                        name="pencil"
                        accessibilityLabel="Edit"
                        onPress={() => setEditing(b)}
                        size={18}
                      />
                      <IconButton
                        name="trash-outline"
                        color={colors.danger}
                        accessibilityLabel="Delete"
                        onPress={() => setDeleting(b)}
                        size={18}
                      />
                    </Row>
                  </View>
                </Row>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      <Fab name="add" accessibilityLabel="Add booking" onPress={() => setAddOpen(true)} />

      {addOpen && (
        <BookingSheet
          onClose={() => setAddOpen(false)}
        />
      )}
      {editing && (
        <BookingSheet
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) {
            try {
              await del.mutateAsync(deleting.id);
              setDeleting(null);
            } catch (e) {
              Alert.alert('Delete failed', getApiError(e));
            }
          }
        }}
        title={`Delete booking for ${deleting?.guest_name}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={del.isPending}
      />
    </View>
  );
}

function SumTile({ label, value, tone }: { label: string; value: string; tone: 'info' | 'warn' }) {
  const bg = tone === 'info' ? colors.infoBg : colors.warnBg;
  const fg = tone === 'info' ? colors.info : colors.warn;
  return (
    <View style={[styles.sum, { backgroundColor: bg }]}>
      <Text style={[styles.sumVal, { color: fg }]}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

// ── Add / Edit sheet ────────────────────────────────────────────────────────

function BookingSheet({
  initial,
  onClose,
}: {
  initial?: Booking;
  onClose: () => void;
}) {
  const { selectedPropertyId } = useAppStore();
  const create = useCreateBooking();
  const update = useUpdateBooking();

  const [guestName, setGuestName] = useState(initial?.guest_name ?? '');
  const [guestPhone, setGuestPhone] = useState(initial?.guest_phone ?? '');
  const [roomLabel, setRoomLabel] = useState(initial?.room_label ?? '');
  const [kind, setKind] = useState<BookingKind>(initial?.kind ?? 'DAILY');
  const [amount, setAmount] = useState(initial?.amount_paise ?? 0);
  const [checkIn, setCheckIn] = useState<string | null>(initial?.check_in ?? new Date().toISOString().slice(0, 10));
  const [checkOut, setCheckOut] = useState<string | null>(initial?.check_out ?? null);
  const [mode, setMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE'>(
    (initial?.payment_mode as 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE') ?? 'UPI',
  );
  const [ref, setRef] = useState(initial?.reference_number ?? '');
  const [paidTo, setPaidTo] = useState(initial?.paid_to ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const submit = async () => {
    if (!selectedPropertyId) return;
    if (!guestName.trim() || !amount) {
      Alert.alert('Missing', 'Guest name + amount are required.');
      return;
    }
    const payload: CreateBookingPayload = {
      property_id: selectedPropertyId,
      guest_name: guestName.trim(),
      guest_phone: guestPhone.trim() || undefined,
      room_label: roomLabel.trim() || undefined,
      kind,
      amount_paise: amount,
      check_in: checkIn ?? undefined,
      check_out: checkOut ?? undefined,
      payment_mode: mode,
      reference_number: ref.trim() || undefined,
      paid_to: paidTo.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch (e) {
      Alert.alert('Save failed', getApiError(e));
    }
  };

  return (
    <Sheet open onClose={onClose} title={initial ? 'Edit booking' : 'Add booking'}>
      <Field label="Guest name" required value={guestName} onChangeText={setGuestName} placeholder="Ravi Kumar" />
      <Field label="Phone" value={guestPhone} onChangeText={setGuestPhone} keyboardType="phone-pad" />
      <Field label="Room label" value={roomLabel} onChangeText={setRoomLabel} placeholder="e.g. 303-A" />
      <Text style={{ fontSize: fontSize.small, fontWeight: '600', color: colors.textMuted, marginBottom: 4 }}>
        Kind
      </Text>
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Chip label="Daily stay" active={kind === 'DAILY'} onPress={() => setKind('DAILY')} />
        <Chip label="Advance" active={kind === 'ADVANCE'} onPress={() => setKind('ADVANCE')} />
      </Row>
      <MoneyField label="Amount" required valuePaise={amount} onChangeAmount={setAmount} />
      <DateField label="Check-in" value={checkIn} onChange={setCheckIn} />
      {kind === 'DAILY' && (
        <DateField label="Check-out" value={checkOut} onChange={setCheckOut} />
      )}
      <Select<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE'>
        label="Payment mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'CASH', label: 'Cash' },
          { value: 'UPI', label: 'UPI' },
          { value: 'BANK_TRANSFER', label: 'Bank transfer' },
          { value: 'CARD', label: 'Card' },
          { value: 'CHEQUE', label: 'Cheque' },
        ]}
      />
      <Field label="Reference #" value={ref} onChangeText={setRef} />
      <Field label="Paid to (staff)" value={paidTo} onChangeText={setPaidTo} />
      <Textarea label="Notes" value={notes} onChangeText={setNotes} rows={3} />
      <Button
        label={initial ? 'Update booking' : 'Add booking'}
        onPress={submit}
        loading={create.isPending || update.isPending}
        block
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sum: { flex: 1, padding: space.md, borderRadius: radius.md },
  sumVal: { fontSize: fontSize.h2, fontWeight: '800' },
  sumLabel: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600', marginTop: 2 },

  name: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: fontSize.h3, fontWeight: '800', color: colors.accent },
});
