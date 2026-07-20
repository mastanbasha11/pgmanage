/**
 * Bookings — daily stays + advance bookings for the property.
 * Month/year picker + kind tabs + list; FAB → add booking.
 *
 * Restyled to the redesign mock: three KPI tiles (total / daily / advance),
 * a Daily-vs-Advance segmented control, an amber notice for advance bookings
 * with no bed assigned, and bordered pill rows. There is deliberately NO
 * average-daily-rate KPI — actual money in is what the owner tracks.
 */
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Header,
  Loading,
  Empty,
  Chip,
  ChipStrip,
  Fab,
  Row,
  Segmented,
  Sheet,
  Field,
  MoneyField,
  DateField,
  Select,
  Textarea,
  Button,
  IconButton,
  ConfirmDialog,
  Avatar,
  rupees,
  formatDateHuman,
} from '../../components/ui';
import { KpiTile, NoticeCard, Pill, RoomBadge } from '../../components/redesign';
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
import { colors, radius, space, type as fontSize, TOUCH_TARGET } from '../../lib/theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type KindFilter = 'ALL' | BookingKind;

function nowMY() {
  const d = new Date();
  return { m: d.getMonth() + 1, y: d.getFullYear() };
}

export default function BookingsPage() {
  const router = useRouter();
  const { selectedPropertyId } = useAppStore();
  const [{ m: month, y: year }, setMY] = useState(nowMY);
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState<Booking | null>(null);

  // Filtered query — drives the list only.
  const bookings = useBookings({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
    kind: kind === 'ALL' ? undefined : kind,
    q: search.trim() || undefined,
  });

  // KPI totals deliberately ignore the kind tabs and the search box. The
  // backend applies both to its aggregate query too, so reusing the filtered
  // response here made "Received — advance bookings" read ₹0 the moment you
  // tapped the "Daily stays" tab — and the client-side sum it used before also
  // under-reported, because the returned page is LIMIT-capped. The headline is
  // "what came in this period", which does not change based on which list you
  // happen to be looking at.
  const totalsQ = useBookings({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
  });
  const totals = totalsQ.data;

  const del = useDeleteBooking();

  const items = bookings.data?.items ?? [];

  // Advance bookings still waiting on a bed — the owner needs to pick one from
  // vacancies before the guest turns up.
  const unassignedAdvance = items.filter((b) => b.kind === 'ADVANCE' && !b.room_label?.trim());

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm }}>
        <Header
          title="Bookings"
          subtitle={`${totals?.count ?? 0} this period · ${rupees(totals?.total_paise ?? 0)}`}
          onBack={() => router.back()}
        />
        <ChipStrip>
          {MONTHS.map((m, i) => (
            <Chip key={m} label={m} active={i + 1 === month} onPress={() => setMY({ m: i + 1, y: year })} />
          ))}
          <Chip label={String(year)} iconName="calendar-outline" onPress={() => setMY({ m: month, y: year - 1 })} />
        </ChipStrip>
        <View style={{ height: space.sm }} />
        <Segmented<KindFilter>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'DAILY', label: 'Daily stays' },
            { value: 'ADVANCE', label: 'Advance' },
          ]}
        />
        <View style={{ height: space.sm }} />
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={17} color={colors.textDim} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search guest, phone, room…"
            placeholderTextColor={colors.textDim}
            returnKeyType="search"
          />
          {!!search && (
            <IconButton name="close-circle" accessibilityLabel="Clear search" size={18} onPress={() => setSearch('')} />
          )}
        </View>
      </View>

      {bookings.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={bookings.isRefetching}
              onRefresh={() => {
                bookings.refetch();
                totalsQ.refetch();
              }}
              tintColor={colors.accent}
            />
          }
        >
          {/* KPI tiles — read straight off the response aggregates (paise). */}
          <Row gap={space.sm} align="stretch" style={{ marginBottom: space.sm }}>
            <KpiTile
              label="Total this period"
              value={rupees(totals?.total_paise ?? 0)}
              foot={`${totals?.count ?? 0} ${(totals?.count ?? 0) === 1 ? 'booking' : 'bookings'}`}
            />
          </Row>
          <Row gap={space.sm} align="stretch" style={{ marginBottom: space.md }}>
            <KpiTile
              label="Received — daily stays"
              value={rupees(totals?.daily_paise ?? 0)}
              foot="guests paying per night"
            />
            <KpiTile
              label="Received — advance bookings"
              value={rupees(totals?.advance_paise ?? 0)}
              foot="tokens for upcoming move-ins"
            />
          </Row>

          {unassignedAdvance.length > 0 && (
            <NoticeCard tone="warn" style={{ marginBottom: space.md }}>
              <Row justify="space-between" align="flex-start" gap={space.sm}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.noticeTitle}>
                    {unassignedAdvance.length} advance booking
                    {unassignedAdvance.length === 1 ? '' : 's'} with no bed assigned
                  </Text>
                  <Text style={styles.noticeBody} numberOfLines={2}>
                    {unassignedAdvance.map((b) => b.guest_name).join(', ')} — pick a bed before they
                    move in.
                  </Text>
                </View>
              </Row>
              <Button
                label="Assign from vacancies"
                variant="secondary"
                size="sm"
                iconName="bed-outline"
                onPress={() => router.push('/tabs/rooms')}
                style={{ marginTop: space.sm, alignSelf: 'flex-start' }}
              />
            </NoticeCard>
          )}

          {items.length === 0 ? (
            <Empty
              title="No bookings this period"
              iconName="calendar-outline"
              hint={search.trim() ? 'Try a different search.' : 'Tap + to record one'}
            />
          ) : (
            items.map((b) => (
              <View key={b.id} style={styles.card}>
                <Row justify="space-between" align="flex-start" gap={space.sm}>
                  {b.room_label?.trim() ? (
                    <RoomBadge
                      room={b.room_label}
                      sub={b.kind === 'DAILY' ? 'guest' : undefined}
                      tone={b.kind === 'ADVANCE' ? 'a' : 'g'}
                    />
                  ) : (
                    <View style={styles.roomEmpty}>
                      <Text style={styles.roomEmptyText}>—</Text>
                    </View>
                  )}
                  <Avatar name={b.guest_name} size={30} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {b.guest_name}
                    </Text>
                    {!!b.guest_phone && (
                      <Text style={styles.meta} numberOfLines={1}>
                        {b.guest_phone}
                      </Text>
                    )}
                    <Row gap={5} wrap style={{ marginTop: 4 }}>
                      <Pill
                        label={b.kind === 'ADVANCE' ? 'Advance' : 'Daily'}
                        tone={b.kind === 'ADVANCE' ? 'a' : 'b'}
                        dot
                      />
                      {!!b.check_in && (
                        <Pill
                          label={
                            b.check_out
                              ? `${formatDateHuman(b.check_in)} → ${formatDateHuman(b.check_out)}`
                              : formatDateHuman(b.check_in)
                          }
                          tone="s"
                        />
                      )}
                      {!!b.paid_to && <Pill label={`to ${b.paid_to}`} tone="s" />}
                    </Row>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amount}>{rupees(b.amount_paise)}</Text>
                    {!!b.payment_mode && <Text style={styles.mode}>{b.payment_mode}</Text>}
                    <Row gap={0} style={{ marginTop: 2 }}>
                      <IconButton
                        name="pencil"
                        accessibilityLabel="Edit"
                        onPress={() => setEditing(b)}
                        size={16}
                      />
                      <IconButton
                        name="trash-outline"
                        color={colors.danger}
                        accessibilityLabel="Delete"
                        onPress={() => setDeleting(b)}
                        size={16}
                      />
                    </Row>
                  </View>
                </Row>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Fab name="add" accessibilityLabel="Add booking" onPress={() => setAddOpen(true)} />

      {addOpen && <BookingSheet onClose={() => setAddOpen(false)} />}
      {editing && <BookingSheet initial={editing} onClose={() => setEditing(null)} />}

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
      <View style={{ marginBottom: space.md }}>
        <Segmented<BookingKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'DAILY', label: 'Daily stay' },
            { value: 'ADVANCE', label: 'Advance' },
          ]}
        />
      </View>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    fontSize: fontSize.body,
    color: colors.text,
  },

  noticeTitle: { fontSize: 12.5, fontWeight: '800', color: colors.warn },
  noticeBody: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginTop: 3 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    marginBottom: space.sm,
  },
  roomEmpty: {
    minWidth: 38,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.neutralBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomEmptyText: { fontSize: 12.5, fontWeight: '800', color: colors.textDim },

  name: { fontSize: 13.5, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  meta: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  mode: { fontSize: 9.5, fontWeight: '700', color: colors.textDim, marginTop: 1 },
});
