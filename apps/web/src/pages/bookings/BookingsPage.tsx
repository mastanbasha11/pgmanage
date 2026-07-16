import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Plus,
  Pencil,
  Trash2,
  CalendarCheck,
  Search,
  X,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useBookings,
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
  type Booking,
  type BookingKind,
  type PaymentMode,
} from '@/hooks/useBookings';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/useToast';
import {
  formatPaise,
  formatDate,
  currentMonthYear,
  rupeesToPaise,
} from '@/lib/utils';

const PAYMENT_MODES: PaymentMode[] = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'];
const KINDS: { value: BookingKind; label: string; hint: string }[] = [
  {
    value: 'DAILY',
    label: 'Daily stay',
    hint: 'Short stay (e.g. someone paid per day for a few nights)',
  },
  {
    value: 'ADVANCE',
    label: 'Advance booking',
    hint: 'Future tenant booking — money taken now, move-in later',
  },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }),
}));
const NOW = new Date().getFullYear();
const YEARS = [NOW - 1, NOW, NOW + 1];

interface FormState {
  property_id: string;
  guest_name: string;
  guest_phone: string;
  room_label: string;
  kind: BookingKind;
  amount_rupees: string;
  check_in_date: string;
  check_out_date: string;
  payment_mode: PaymentMode;
  reference_number: string;
  collected_at: string;
  paid_to: string;
  notes: string;
}

function emptyForm(propertyId: string | null): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    property_id: propertyId ?? '',
    guest_name: '',
    guest_phone: '',
    room_label: '',
    kind: 'ADVANCE',
    amount_rupees: '',
    check_in_date: today,
    check_out_date: '',
    payment_mode: 'CASH',
    reference_number: '',
    collected_at: today,
    paid_to: '',
    notes: '',
  };
}

function BookingDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Booking | null;
}) {
  const isEdit = !!editing;
  const { selectedPropertyId } = useAuthStore();
  const create = useCreateBooking();
  const update = useUpdateBooking(editing?.id ?? '');
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm(selectedPropertyId));

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        property_id: editing.property_id,
        guest_name: editing.guest_name,
        guest_phone: editing.guest_phone ?? '',
        room_label: editing.room_label,
        kind: editing.kind,
        amount_rupees: String(editing.amount_paise / 100),
        check_in_date: editing.check_in_date.slice(0, 10),
        check_out_date: editing.check_out_date?.slice(0, 10) ?? '',
        payment_mode: editing.payment_mode,
        reference_number: editing.reference_number ?? '',
        collected_at: editing.collected_at.slice(0, 10),
        paid_to: editing.paid_to ?? '',
        notes: editing.notes ?? '',
      });
    } else {
      setForm(emptyForm(selectedPropertyId));
    }
  }, [open, editing, selectedPropertyId]);

  async function submit() {
    const amt = Number(form.amount_rupees);
    if (!form.guest_name.trim()) {
      toast({ title: 'Guest name required', variant: 'destructive' });
      return;
    }
    if (!form.room_label.trim()) {
      toast({ title: 'Room / bed label required', variant: 'destructive' });
      return;
    }
    if (!amt || amt <= 0) {
      toast({ title: 'Enter an amount', variant: 'destructive' });
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync({
          guest_name: form.guest_name.trim(),
          guest_phone: form.guest_phone.trim() || undefined,
          room_label: form.room_label.trim(),
          kind: form.kind,
          amount_paise: rupeesToPaise(amt),
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date || undefined,
          payment_mode: form.payment_mode,
          reference_number: form.reference_number.trim() || undefined,
          collected_at: form.collected_at,
          paid_to: form.paid_to.trim() || undefined,
          notes: form.notes.trim() || undefined,
        });
        toast({ title: 'Booking updated' });
      } else {
        if (!form.property_id) {
          toast({
            title: 'Pick a property in the sidebar first',
            variant: 'destructive',
          });
          return;
        }
        await create.mutateAsync({
          property_id: form.property_id,
          guest_name: form.guest_name.trim(),
          guest_phone: form.guest_phone.trim() || undefined,
          room_label: form.room_label.trim(),
          kind: form.kind,
          amount_paise: rupeesToPaise(amt),
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date || undefined,
          payment_mode: form.payment_mode,
          reference_number: form.reference_number.trim() || undefined,
          collected_at: form.collected_at,
          paid_to: form.paid_to.trim() || undefined,
          notes: form.notes.trim() || undefined,
        });
        toast({ title: 'Booking added' });
      }
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message ?? 'Could not save booking.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  const kindHint = KINDS.find((k) => k.value === form.kind)?.hint;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit booking' : 'Add booking'}</DialogTitle>
          <DialogDescription>
            Capture rent from a guest who isn't a regular tenant — e.g. a daily stay,
            or an advance for a future move-in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label>Type *</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => setForm({ ...form, kind: v as BookingKind })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kindHint && (
              <p className="mt-1 text-[11px] text-muted-foreground">{kindHint}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Guest name *</Label>
              <Input
                value={form.guest_name}
                onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.guest_phone}
                onChange={(e) => setForm({ ...form, guest_phone: e.target.value })}
                placeholder="+91…"
              />
            </div>
          </div>
          <div>
            <Label>Room / bed label *</Label>
            <Input
              value={form.room_label}
              onChange={(e) => setForm({ ...form, room_label: e.target.value })}
              placeholder="e.g. 706 · Bed A or Room 502"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Free text — used only for your reference, doesn't link to a bed record.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                value={form.amount_rupees}
                onChange={(e) => setForm({ ...form, amount_rupees: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Paid to *</Label>
              <Input
                value={form.paid_to}
                onChange={(e) => setForm({ ...form, paid_to: e.target.value })}
                placeholder="e.g. Mastan / Harshi / Mohan"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Person who actually received the cash
              </p>
            </div>
          </div>
          <div>
            <Label>Money received on *</Label>
            <Input
              type="date"
              value={form.collected_at}
              onChange={(e) => setForm({ ...form, collected_at: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{form.kind === 'ADVANCE' ? 'Planned move-in' : 'Check-in'} *</Label>
              <Input
                type="date"
                value={form.check_in_date}
                onChange={(e) => setForm({ ...form, check_in_date: e.target.value })}
              />
            </div>
            <div>
              <Label>{form.kind === 'ADVANCE' ? 'Planned move-out' : 'Check-out'}</Label>
              <Input
                type="date"
                value={form.check_out_date}
                onChange={(e) => setForm({ ...form, check_out_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment mode</Label>
              <Select
                value={form.payment_mode}
                onValueChange={(v) =>
                  setForm({ ...form, payment_mode: v as PaymentMode })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference / UTR</Label>
              <Input
                value={form.reference_number}
                onChange={(e) =>
                  setForm({ ...form, reference_number: e.target.value })
                }
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional details"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {(create.isPending || update.isPending)
              ? 'Saving...'
              : isEdit
                ? 'Save changes'
                : 'Add booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BookingsPage() {
  const { selectedPropertyId } = useAuthStore();
  const cmy = currentMonthYear();
  const [month, setMonth] = useState(cmy.month);
  const [year, setYear] = useState(cmy.year);
  const [kindFilter, setKindFilter] = useState<'ALL' | BookingKind>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const { toast } = useToast();
  const del = useDeleteBooking();

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading } = useBookings({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
    kind: kindFilter === 'ALL' ? undefined : kindFilter,
    q: debouncedSearch || undefined,
  });

  // Fetch the property's fiscal period (settlement_day-based) so the period
  // shown above the KPIs matches the window the backend uses to filter
  // bookings — see project-period-attribution-rule.
  const { data: period } = useQuery<{
    period_start: string;
    period_end: string;
    settlement_day: number;
    overridden: boolean;
  }>({
    queryKey: ['billing-period', selectedPropertyId, year, month],
    queryFn: () =>
      api
        .get(`/properties/${selectedPropertyId}/billing-period/${year}/${month}`)
        .then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const items = data?.items ?? [];

  async function handleDelete(b: Booking) {
    if (
      !window.confirm(
        `Delete booking for "${b.guest_name}" (${formatPaise(b.amount_paise)})?`,
      )
    )
      return;
    try {
      await del.mutateAsync(b.id);
      toast({ title: 'Booking removed' });
    } catch {
      toast({ title: 'Failed', variant: 'destructive' });
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Daily stays and advance bookings — guests who aren't (yet) regular tenants.</span>
              {period && (
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs">
                  <CalendarDays className="h-3 w-3" />
                  Period: {new Date(period.period_start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {' – '}
                  {new Date(period.period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {period.overridden && (
                    <span className="ml-1 text-[10px] uppercase text-amber-600">override</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add booking
            </Button>
          </div>
        </div>

        {/* Summary KPIs — amounts received from each booking kind (no ADR;
            actual money in is what the owner tracks). */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-bold text-muted-foreground">Total this period</div>
            <p className="tnum mt-1.5 text-[21px] font-extrabold tracking-tight">
              {formatPaise(data?.total_paise ?? 0)}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-[#98a0ad]">
              {data?.count ?? 0} {(data?.count ?? 0) === 1 ? 'booking' : 'bookings'}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-bold text-muted-foreground">
              Received — daily stays
            </div>
            <p className="tnum mt-1.5 text-[21px] font-extrabold tracking-tight">
              {formatPaise(data?.daily_paise ?? 0)}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-[#98a0ad]">
              guests paying per night
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-bold text-muted-foreground">
              Received — advance bookings
            </div>
            <p className="tnum mt-1.5 text-[21px] font-extrabold tracking-tight">
              {formatPaise(data?.advance_paise ?? 0)}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-[#98a0ad]">
              tokens for upcoming move-ins
            </p>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search guest, phone, room..."
              className="h-9 pl-8"
            />
          </div>
          <Select
            value={kindFilter}
            onValueChange={(v) => setKindFilter(v as 'ALL' | BookingKind)}
          >
            <SelectTrigger className="w-44 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="DAILY">Daily stays</SelectItem>
              <SelectItem value="ADVANCE">Advance bookings</SelectItem>
            </SelectContent>
          </Select>
          {(searchInput || kindFilter !== 'ALL') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1"
              onClick={() => {
                setSearchInput('');
                setDebouncedSearch('');
                setKindFilter('ALL');
              }}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <CalendarCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No bookings for this period.</p>
            <Button className="mt-4 gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add booking
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[#fbfcfe]">
                  <th className="px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad]">
                    Guest
                  </th>
                  <th className="hidden px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] sm:table-cell">
                    Room
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad]">
                    Type
                  </th>
                  <th className="hidden px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] md:table-cell">
                    Stay
                  </th>
                  <th className="hidden px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] lg:table-cell">
                    Received
                  </th>
                  <th className="hidden px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] lg:table-cell">
                    Paid to
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad]">
                    Amount
                  </th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.guest_name}</p>
                      {b.guest_phone && (
                        <p className="text-xs text-muted-foreground">{b.guest_phone}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {b.room_label}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={b.kind === 'ADVANCE' ? 'default' : 'outline'}>
                        {b.kind === 'ADVANCE' ? 'Advance' : 'Daily'}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {formatDate(b.check_in_date)}
                      {b.check_out_date ? ` → ${formatDate(b.check_out_date)}` : ''}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {formatDate(b.collected_at)} · {b.payment_mode}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {b.paid_to ? (
                        <Badge variant="outline" className="text-[10px]">
                          {b.paid_to}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatPaise(b.amount_paise)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditing(b)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={() => handleDelete(b)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BookingDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        editing={null}
      />
      <BookingDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        editing={editing}
      />
    </>
  );
}
