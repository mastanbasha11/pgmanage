import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  IndianRupee,
  RefreshCw,
  Plus,
  CalendarDays,
  Pencil,
  Trash2,
  MessageCircle,
} from 'lucide-react';
import AddPaymentDialog from './AddPaymentDialog';
import EditCloseDateDialog from './EditCloseDateDialog';
import EditOpeningBalanceDialog from './EditOpeningBalanceDialog';
import PaidPersonSelect from '@/components/PaidPersonSelect';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useRentLedger,
  useOverdue,
  useGenerateLedger,
  useRecordPayment,
  useUpdatePayment,
  useDeletePayment,
  type PaymentMode,
} from '@/hooks/usePayments';
import { useAuthStore } from '@/store/auth';
import {
  formatPaise,
  monthName,
  currentMonthYear,
  rupeesToPaise,
  shortRoomType,
} from '@/lib/utils';
import {
  FilterChip,
  NameAvatar,
  PageHeader,
  Pill,
  RankBars,
  RoomBadge,
  SectionCard,
  Track,
  type PillTone,
} from '@/components/ui/redesign';
import { useToast } from '@/hooks/useToast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName(i + 1) }));
const NOW = new Date().getFullYear();
const YEARS = [NOW - 1, NOW, NOW + 1];

interface LedgerEntry {
  id: string;
  tenant_id: string;
  tenant_name: string;
  phone?: string | null;
  month: number;
  year: number;
  amount_due_paise: number;
  amount_paid_paise: number;
  discount_paise: number;
  outstanding_paise: number;
  status: string;
  bed_label?: string;
  room_number?: string;
  floor_name?: string;
  floor_number?: number;
  room_type?: string;
  collected_by?: string[] | null;
  /** ISO timestamp of the most-recent payment toward this row, if any. */
  paid_on?: string | null;
}

type LedgerStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'ALL';
type RentTab = 'tenants' | 'payments' | 'refunds';

/**
 * Compose a WhatsApp deep-link that pre-fills the overdue-reminder message.
 * We build the text client-side (rather than triggering the Meta template) so
 * the owner can review + tweak before sending — this is the manual, ad-hoc
 * path. Digits-only phone; strip +/spaces so both "9876543210" and
 * "+91 98765 43210" work.
 */
function buildOverdueWhatsappUrl(e: LedgerEntry): string {
  const phone = (e.phone ?? '').replace(/\D/g, '');
  const rupees = Math.round(e.outstanding_paise / 100).toLocaleString('en-IN');
  const period = `${monthName(e.month)} ${e.year}`;
  const name = e.tenant_name.trim();
  const msg =
    `Hi ${name}, a friendly reminder that your rent for ${period} is still ` +
    `outstanding — ₹${rupees}. Please clear it at the earliest. Thanks!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

interface Transaction {
  id: string;
  paid_on: string;
  collected_at: string;
  amount_paise: number;
  payment_type: 'RENT' | 'ADVANCE' | 'DEPOSIT' | 'FOOD' | 'OTHER_CHARGE' | 'REFUND' | 'POWER';
  payment_mode: string;
  for_month?: number | null;
  for_year?: number | null;
  reference_number?: string | null;
  notes?: string | null;
  collector: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_phone?: string | null;
  room_number?: string | null;
  bed_label?: string | null;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

const paymentSchema = z.object({
  amount_rupees: z.coerce.number().min(0, 'Amount must be ≥ 0'),
  discount_rupees: z.coerce.number().min(0).default(0),
  for_days: z.coerce.number().int().min(0).max(31).optional(),
  payment_mode: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE']),
  paid_to: z.string().optional(),
  notes: z.string().optional(),
}).refine((d) => (d.amount_rupees ?? 0) + (d.discount_rupees ?? 0) > 0, {
  message: 'Enter an amount or a discount',
  path: ['amount_rupees'],
});

type PaymentFormData = z.infer<typeof paymentSchema>;

function RecordPaymentDialog({
  entry,
  onClose,
}: {
  entry: LedgerEntry | null;
  onClose: () => void;
}) {
  const { mutateAsync, isPending } = useRecordPayment();
  const { toast } = useToast();
  const { selectedPropertyId } = useAuthStore();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_mode: 'CASH',
      discount_rupees: 0,
      for_days: entry ? daysInMonth(entry.month, entry.year) : undefined,
    },
  });

  if (!entry) return null;

  async function submit(data: PaymentFormData) {
    if (!entry) return;
    try {
      await mutateAsync({
        tenant_id: entry.tenant_id,
        amount_paise: rupeesToPaise(data.amount_rupees ?? 0),
        discount_paise: rupeesToPaise(data.discount_rupees ?? 0),
        for_days: data.for_days,
        payment_type: 'RENT',
        payment_mode: data.payment_mode,
        for_month: entry.month,
        for_year: entry.year,
        paid_to: data.paid_to?.trim() || undefined,
        notes: data.notes || undefined,
      });
      toast({
        title: 'Payment recorded',
        description: `${entry.tenant_name} — ${monthName(entry.month)} ${entry.year}`,
      });
      reset();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not record payment.';
      toast({
        title: 'Failed to record payment',
        description: message,
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            {entry.tenant_name} — {monthName(entry.month)} {entry.year}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm grid grid-cols-3 gap-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Due</p>
              <p className="font-semibold tabular-nums">{formatPaise(entry.amount_due_paise)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Already settled</p>
              <p className="font-semibold tabular-nums">
                {formatPaise((entry.amount_paid_paise ?? 0) + (entry.discount_paise ?? 0))}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Outstanding</p>
              <p className="font-semibold tabular-nums text-destructive">
                {formatPaise(entry.outstanding_paise)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount paid (₹)</Label>
              <Input
                type="number"
                step="1"
                autoFocus
                placeholder={String(Math.round(entry.outstanding_paise / 100))}
                {...register('amount_rupees')}
              />
              {errors.amount_rupees && (
                <p className="text-xs text-destructive mt-1">{errors.amount_rupees.message}</p>
              )}
            </div>
            <div>
              <Label>Discount (₹)</Label>
              <Input type="number" step="1" placeholder="0" {...register('discount_rupees')} />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Counts toward closing the rent — paid + discount ≥ due ⇒ PAID
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Days covered</Label>
              <Input
                type="number"
                min={0}
                max={31}
                placeholder={String(daysInMonth(entry.month, entry.year))}
                {...register('for_days')}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Defaults to {daysInMonth(entry.month, entry.year)} days for{' '}
                {monthName(entry.month)} {entry.year}.
              </p>
            </div>
            <div>
              <Label>Payment Mode</Label>
              <Select
                value={watch('payment_mode')}
                onValueChange={(v) => setValue('payment_mode', v as PaymentMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'] as const).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Paid to (optional)</Label>
            <PaidPersonSelect
              value={watch('paid_to') ?? ''}
              onChange={(v) => setValue('paid_to', v, { shouldValidate: true })}
              propertyId={selectedPropertyId ?? undefined}
              placeholder="Who received the cash…"
            />
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Input {...register('notes')} placeholder="Any additional info" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const editPaymentSchema = z.object({
  amount_rupees: z.coerce.number().min(0),
  discount_rupees: z.coerce.number().min(0).default(0),
  payment_mode: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE']),
  paid_to: z.string().optional(),
  collected_at: z.string().min(1, 'Date required'),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});
type EditPaymentFormData = z.infer<typeof editPaymentSchema>;

function EditPaymentDialog({
  txn,
  onClose,
}: {
  txn: Transaction | null;
  onClose: () => void;
}) {
  const { mutateAsync, isPending } = useUpdatePayment();
  const { toast } = useToast();
  const { selectedPropertyId } = useAuthStore();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditPaymentFormData>({
    resolver: zodResolver(editPaymentSchema),
    values: txn
      ? {
          amount_rupees: txn.amount_paise / 100,
          discount_rupees: 0,
          payment_mode: txn.payment_mode as PaymentMode,
          paid_to: txn.collector === 'Unattributed' ? '' : txn.collector,
          collected_at: txn.collected_at.slice(0, 10),
          reference_number: txn.reference_number ?? '',
          notes: txn.notes ?? '',
        }
      : undefined,
  });

  if (!txn) return null;

  async function submit(data: EditPaymentFormData) {
    if (!txn) return;
    try {
      await mutateAsync({
        id: txn.id,
        data: {
          amount_paise: rupeesToPaise(data.amount_rupees),
          payment_mode: data.payment_mode,
          paid_to: data.paid_to?.trim() || undefined,
          collected_at: new Date(data.collected_at + 'T00:00:00').toISOString(),
          reference_number: data.reference_number?.trim() || undefined,
          notes: data.notes?.trim() || undefined,
        },
      });
      toast({ title: 'Payment updated' });
      reset();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not update payment.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={!!txn} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit payment</DialogTitle>
          <DialogDescription>
            {txn.tenant_name} · {txn.payment_type}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹)</Label>
              <Input type="number" step="1" {...register('amount_rupees')} />
              {errors.amount_rupees && (
                <p className="text-xs text-destructive mt-1">{errors.amount_rupees.message}</p>
              )}
            </div>
            <div>
              <Label>Date collected</Label>
              <Input type="date" {...register('collected_at')} />
              {errors.collected_at && (
                <p className="text-xs text-destructive mt-1">{errors.collected_at.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mode</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                {...register('payment_mode')}
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div>
              <Label>Paid to</Label>
              <PaidPersonSelect
                value={watch('paid_to') ?? ''}
                onChange={(v) => setValue('paid_to', v, { shouldValidate: true })}
                propertyId={selectedPropertyId ?? undefined}
                placeholder="Collector name…"
              />
            </div>
          </div>
          <div>
            <Label>Reference / Txn id</Label>
            <Input {...register('reference_number')} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input {...register('notes')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Hero KPI card — mock style: label / big value / foot. */
function StatCard({
  label,
  value,
  foot,
  valueClass,
  children,
  onClick,
}: {
  label: ReactNode;
  value: string;
  foot?: ReactNode;
  valueClass?: string;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${
        onClick ? 'cursor-pointer transition-colors hover:border-accent' : ''
      }`}
      onClick={onClick}
    >
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
      <div className={`tnum mt-1.5 text-[21px] font-extrabold tracking-tight ${valueClass ?? ''}`}>
        {value}
      </div>
      {children}
      {foot && (
        <div className="mt-1 text-[11px] font-semibold text-[#98a0ad]">{foot}</div>
      )}
    </div>
  );
}

interface OverdueItem {
  id: string;
  name: string;
  phone?: string | null;
  months_overdue: number;
  total_outstanding_paise: number;
  oldest_due_date?: string | null;
  bed_label?: string | null;
  room_number?: string | null;
}

export default function RentDashboardPage() {
  const { selectedPropertyId, canAccessFinancials } = useAuthStore();
  const showMoneyTotals = canAccessFinancials();
  const { month: cm, year: cy } = currentMonthYear();
  const [month, setMonth] = useState(cm);
  const [year, setYear] = useState(cy);
  const [statusFilter, setStatusFilter] = useState<LedgerStatus>('ALL');
  const [collectorFilter, setCollectorFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<RentTab>('tenants');
  const [payingEntry, setPayingEntry] = useState<LedgerEntry | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showEditClose, setShowEditClose] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [showOpeningBalance, setShowOpeningBalance] = useState(false);
  const deletePayment = useDeletePayment();
  const { toast } = useToast();

  // Look up fiscal period for current selection (start, end, default close, override?)
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

  const { data: ledger, isLoading } = useRentLedger({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
  });

  const { data: overdue } = useOverdue(selectedPropertyId ?? undefined);
  const { mutateAsync: generateLedger, isPending: generating } = useGenerateLedger();

  async function handleGenerate() {
    if (!selectedPropertyId) {
      toast({
        title: 'No property selected',
        description: 'Pick a property from the sidebar first.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const result = await generateLedger({
        property_id: selectedPropertyId,
        month,
        year,
      });
      toast({
        title: 'Ledger generated',
        description: `${result.entries_created ?? 0} entries created.`,
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to generate ledger.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  const entries: LedgerEntry[] = ledger?.items ?? [];
  // KPIs come straight from the backend's `stats` object — it applies
  // the fiscal-window vs rent-month attribution rule
  // (project-period-attribution-rule) AND uses the per-row clamped sum
  // for Outstanding. The previous code re-derived everything locally
  // from `entries[].amount_paid_paise` (the ledger view), which
  // bypassed the new Collected query AND brought back the
  // aggregate-subtraction Outstanding bug.
  const backendStats = ledger?.stats;
  const totalDue = backendStats?.expected_paise ?? 0;
  const totalPaid = backendStats?.collected_paise ?? 0; // fiscal-window cash
  const totalDiscount = backendStats?.discount_paise ?? 0;
  const totalSettled = backendStats?.settled_paise ?? totalPaid + totalDiscount;
  const totalOutstanding = backendStats?.outstanding_paise ?? 0;
  const advanceReceived = backendStats?.advance_received_paise ?? 0;
  const refundsGiven = backendStats?.refunds_given_paise ?? 0;
  const dailyStays = backendStats?.daily_stays_paise ?? 0;
  const powerReceived = backendStats?.power_received_paise ?? 0;
  const openingBalance = backendStats?.opening_balance_paise ?? 0;
  const stats = {
    expected_paise: totalDue,
    collected_paise: totalPaid,
    discount_paise: totalDiscount,
    settled_paise: totalSettled,
    outstanding_paise: totalOutstanding,
    advance_received_paise: advanceReceived,
    refunds_given_paise: refundsGiven,
  };
  const collectors: Array<{
    collector: string;
    payments: number;
    amount_paise: number;
    rent_paise?: number;
    advance_paise?: number;
  }> = ledger?.collectors ?? [];
  const transactions: Transaction[] = ledger?.transactions ?? [];
  const paymentRows = transactions.filter((t) => t.payment_type !== 'REFUND');
  const refundRows = transactions.filter((t) => t.payment_type === 'REFUND');
  // Group payments by tenant for display. A row counts as a real duplicate
  // only when the SAME tenant has another row with the same payment_type,
  // for_month, for_year AND amount_paise — different types (RENT vs DEPOSIT)
  // or different amounts (full + part) are legitimate separate payments and
  // must NOT be flagged.
  const paymentsByTenant = new Map<string, Transaction[]>();
  for (const t of paymentRows) {
    const key = t.tenant_id ?? '__power__';
    const arr = paymentsByTenant.get(key) ?? [];
    arr.push(t);
    paymentsByTenant.set(key, arr);
  }
  const dupKey = (t: Transaction) =>
    `${t.payment_type}|${t.for_month ?? ''}|${t.for_year ?? ''}|${t.amount_paise}`;
  const dupKeyCounts = new Map<string, number>();
  for (const t of paymentRows) {
    if (!t.tenant_id) continue; // POWER rows aren't per-tenant — skip dup flag
    const k = `${t.tenant_id}|${dupKey(t)}`;
    dupKeyCounts.set(k, (dupKeyCounts.get(k) ?? 0) + 1);
  }
  const isDuplicate = (t: Transaction) =>
    t.tenant_id ? (dupKeyCounts.get(`${t.tenant_id}|${dupKey(t)}`) ?? 0) > 1 : false;
  const groupedPayments = Array.from(paymentsByTenant.values()).sort(
    (a, b) => b.length - a.length || a[0].tenant_name.localeCompare(b[0].tenant_name),
  );
  // Backend's `collection_rate` is a percentage (e.g. 107.0); fall back to
  // a client-side calc if older response shape.
  const collectionPct = Math.round(
    backendStats?.collection_rate ?? (totalDue > 0 ? (totalPaid / totalDue) * 100 : 0),
  );

  // Build the dropdown options for the "Collected by" filter from the entries
  // themselves so it always reflects what's actually visible.
  const collectorOptions = Array.from(
    new Set(entries.flatMap((e) => e.collected_by ?? [])),
  ).sort();

  const filteredEntries = entries.filter((e) => {
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (collectorFilter !== 'ALL') {
      if (!e.collected_by || !e.collected_by.includes(collectorFilter)) return false;
    }
    return true;
  });

  // "Avg days to collect" — mean gap between the fiscal period opening and
  // each row's most-recent payment. Clear replacement for the mock's
  // "DSO / on-time" jargon.
  const paidGaps: number[] = [];
  if (period) {
    const start = Date.parse(period.period_start);
    for (const e of entries) {
      if (e.paid_on) {
        const gap = (Date.parse(e.paid_on) - start) / 86_400_000;
        if (gap >= 0 && gap < 90) paidGaps.push(gap);
      }
    }
  }
  const avgDaysToCollect =
    paidGaps.length > 0
      ? (paidGaps.reduce((a, b) => a + b, 0) / paidGaps.length).toFixed(1)
      : null;

  const overdueItems: OverdueItem[] = overdue?.items ?? [];
  const billedTenants = entries.length;

  return (
    <>
      <div className="mx-auto max-w-[1280px] space-y-4">
        <PageHeader
          title="Rent & Payments"
          sub={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>
                {monthName(month)} {year}
              </span>
              {period && (
                <button
                  type="button"
                  onClick={() => setShowEditClose(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent"
                  title="Edit fiscal close date"
                >
                  <CalendarDays className="h-3 w-3" />
                  Period: {new Date(period.period_start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {' – '}
                  {new Date(period.period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {period.overridden && (
                    <Pill tone="a" dot={false} className="ml-1">
                      OVERRIDE
                    </Pill>
                  )}
                  <Pencil className="h-3 w-3 opacity-60" />
                </button>
              )}
            </span>
          }
          actions={
            <>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-9 w-32 rounded-xl font-bold shadow-sm">
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
                <SelectTrigger className="h-9 w-24 rounded-xl font-bold shadow-sm">
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating || !selectedPropertyId}
                className="h-9 gap-1 rounded-xl font-bold"
              >
                <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                Generate
              </Button>
              <Button
                size="sm"
                className="h-9 gap-1 rounded-xl font-bold"
                onClick={() => setShowAddPayment(true)}
                disabled={!selectedPropertyId}
              >
                <Plus className="h-4 w-4" />
                Add Payment
              </Button>
            </>
          }
        />

        {/* Summary — totals hidden for managers, only progress shown */}
        {showMoneyTotals ? (
          <>
            {/* Hero KPIs — mock row of 4 */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={
                  <span title="Billed rent for this month only — advances & arrears excluded">
                    Expected (this month's rent) ⓘ
                  </span>
                }
                value={formatPaise(stats.expected_paise)}
                foot={`${billedTenants} tenants billed`}
              />
              <StatCard
                label={`Collected — ${monthName(month)} rent`}
                value={formatPaise(stats.collected_paise)}
                foot={
                  <>
                    <b className="text-accent">{collectionPct}%</b> of billed
                    {stats.discount_paise > 0 && (
                      <> · {formatPaise(stats.discount_paise)} discounts</>
                    )}
                  </>
                }
              >
                <Track pct={collectionPct} className="mt-2" />
              </StatCard>
              <StatCard
                label="Outstanding"
                value={formatPaise(stats.outstanding_paise)}
                valueClass={stats.outstanding_paise > 0 ? 'text-destructive' : ''}
                foot={
                  overdueItems.length > 0
                    ? `${overdueItems.length} tenants overdue`
                    : 'all clear'
                }
              />
              <StatCard
                label={
                  <span title="Average gap between the period opening and each tenant's payment — lower means rent comes in faster.">
                    Avg days to collect ⓘ
                  </span>
                }
                value={avgDaysToCollect ? `${avgDaysToCollect} days` : '—'}
                foot={
                  paidGaps.length > 0
                    ? `across ${paidGaps.length} payments this period`
                    : 'no payments yet this period'
                }
              />
            </div>

            {/* Also received this period — proper tiles (bigger than the mock strip) */}
            <SectionCard
              title="Also received this period"
              sub="Everything besides this month's rent that moved through the till."
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: 'Advances', value: advanceReceived, color: '#1baf7a' },
                  { label: 'Daily stays', value: dailyStays, color: '#eda100' },
                  { label: 'Power meters', value: powerReceived, color: '#eb6834' },
                  {
                    label: 'Opening balance',
                    value: openingBalance,
                    color: '#98a0ad',
                    onClick: () => setShowOpeningBalance(true),
                    note: 'click to edit',
                  },
                  {
                    label: 'Refunds given',
                    value: -refundsGiven,
                    color: '#dc2626',
                    negative: refundsGiven > 0,
                  },
                  {
                    label: 'Discounts',
                    value: -stats.discount_paise,
                    color: '#b45309',
                    negative: stats.discount_paise > 0,
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    onClick={m.onClick}
                    className={`flex flex-col gap-1 rounded-xl border border-border bg-card p-3 ${
                      m.onClick ? 'cursor-pointer transition-colors hover:border-accent' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {m.label}
                      </span>
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: m.color }} />
                    </div>
                    <div
                      className={`tnum text-[19px] font-extrabold tracking-tight ${
                        m.negative ? 'text-destructive' : ''
                      }`}
                    >
                      {m.negative ? '−' : ''}
                      {formatPaise(Math.abs(m.value))}
                    </div>
                    {m.note && <div className="text-[10.5px] text-[#98a0ad]">{m.note}</div>}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Collected-by — full width; wide label column so
                "83 payments · adv ₹1,08,000" never wraps mid-word */}
            {collectors.length > 0 && (
              <SectionCard
                title={`💵 Collected by — ${monthName(month)} ${year}`}
                sub="Who received the money this period."
              >
                <RankBars
                  labelWidth={230}
                  rows={collectors.map((c, i) => ({
                    label: c.collector,
                    sub: `${c.payments} payment${c.payments === 1 ? '' : 's'}${
                      (c.advance_paise ?? 0) > 0
                        ? ` · adv ${formatPaise(c.advance_paise ?? 0)}`
                        : ''
                    }`,
                    value: c.amount_paise,
                    display: formatPaise(c.amount_paise),
                    color: ['#2a78d6', '#1baf7a', '#e87ba4', '#eda100', '#eb6834', '#98a0ad'][
                      i % 6
                    ],
                  }))}
                />
              </SectionCard>
            )}
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Collection rate" value={`${collectionPct}%`}>
              <Track pct={collectionPct} className="mt-2" />
            </StatCard>
            <StatCard
              label="Tenants"
              value={`${entries.filter((e) => e.status === 'PAID').length}/${entries.length} paid`}
            />
          </div>
        )}


        {!selectedPropertyId && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Select a property from the sidebar to view its rent ledger.
          </div>
        )}

        {/* Ledger table */}
        {selectedPropertyId &&
          (isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <>
              {/* Tabs — mock style: dark active pill */}
              <div className="flex w-fit gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
                {(
                  [
                    ['tenants', `Tenants (${entries.length})`],
                    ['payments', `Payments (${paymentRows.length})`],
                    ['refunds', `Refunds (${refundRows.length})`],
                  ] as [RentTab, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
                      activeTab === key
                        ? 'bg-[#161b26] text-white'
                        : 'text-[#4a5261] hover:bg-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'tenants' && (
              <>
              {/* Filter chips */}
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['ALL', 'All', entries.length],
                    ['UNPAID', 'Unpaid', entries.filter((e) => e.status === 'UNPAID').length],
                    ['PARTIAL', 'Partial', entries.filter((e) => e.status === 'PARTIAL').length],
                    ['PAID', 'Paid', entries.filter((e) => e.status === 'PAID').length],
                  ] as [LedgerStatus, string, number][]
                ).map(([key, label, count]) => (
                  <FilterChip
                    key={key}
                    active={statusFilter === key}
                    onClick={() => setStatusFilter(key)}
                    count={count}
                  >
                    {label}
                  </FilterChip>
                ))}
                {showMoneyTotals && (
                  <Select value={collectorFilter} onValueChange={setCollectorFilter}>
                    <SelectTrigger className="h-8 w-44 rounded-full text-xs font-bold">
                      <SelectValue placeholder="Collected by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All collectors</SelectItem>
                      {collectorOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {(statusFilter !== 'ALL' || collectorFilter !== 'ALL') && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Showing {filteredEntries.length} of {entries.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('ALL');
                        setCollectorFilter('ALL');
                      }}
                      className="text-xs font-bold text-accent hover:underline"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[#fbfcfe]">
                      <th className="px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad]">
                        Room
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad]">
                        Tenant
                      </th>
                      {showMoneyTotals && (
                        <>
                          <th className="hidden px-3 py-2.5 text-right text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] md:table-cell">
                            Due
                          </th>
                          <th className="hidden px-3 py-2.5 text-right text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] lg:table-cell">
                            Paid
                          </th>
                          <th className="hidden px-3 py-2.5 text-right text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] lg:table-cell">
                            Discount
                          </th>
                          <th className="hidden px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] lg:table-cell">
                            Paid on · by
                          </th>
                        </>
                      )}
                      <th className="px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad]">
                        Status
                      </th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e9edf4]">
                    {filteredEntries.map((e) => (
                      <tr
                        key={e.id}
                        className={
                          e.status === 'UNPAID'
                            ? 'bg-[#fdf6f6] hover:bg-[#fbeeee]'
                            : e.status === 'PARTIAL'
                              ? 'bg-[#fffdf4] hover:bg-[#fdf8e8]'
                              : 'hover:bg-muted/30'
                        }
                      >
                        <td className="px-3 py-2.5">
                          {e.room_number ? (
                            <div className="flex items-center gap-1.5">
                              <RoomBadge room={e.room_number} bed={e.bed_label ?? undefined} />
                              {e.room_type && (
                                <span className="hidden rounded-md border border-[#f3d59b] bg-[#fff6e2] px-1.5 py-px text-[10.5px] font-bold text-[#92600b] xl:inline-flex">
                                  {shortRoomType(e.room_type)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <NameAvatar name={e.tenant_name} size={26} />
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px] font-bold">{e.tenant_name}</p>
                              {e.outstanding_paise > 0 && (
                                <p className="tnum text-[11px] font-semibold text-destructive">
                                  {formatPaise(e.outstanding_paise)} left
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        {showMoneyTotals && (
                          <>
                            <td className="tnum hidden px-3 py-2.5 text-right text-[12.5px] text-muted-foreground md:table-cell">
                              {formatPaise(e.amount_due_paise)}
                            </td>
                            <td className="tnum hidden px-3 py-2.5 text-right text-[12.5px] font-bold lg:table-cell">
                              {e.amount_paid_paise > 0 ? (
                                formatPaise(e.amount_paid_paise)
                              ) : (
                                <span className="font-normal text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="tnum hidden px-3 py-2.5 text-right text-[12.5px] lg:table-cell">
                              {e.discount_paise > 0 ? (
                                <span className="font-bold text-[#15803d]">
                                  {formatPaise(e.discount_paise)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="hidden px-3 py-2.5 text-[11px] font-semibold text-[#98a0ad] lg:table-cell">
                              {e.paid_on ? (
                                <>
                                  {new Date(e.paid_on).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                  })}
                                  {e.collected_by && e.collected_by.length > 0 && (
                                    <> · {e.collected_by.join(', ')}</>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2.5">
                          <Pill
                            tone={
                              (
                                {
                                  PAID: 'g',
                                  PARTIAL: 'a',
                                  UNPAID: 'r',
                                } as Record<string, PillTone>
                              )[e.status] ?? 's'
                            }
                          >
                            {e.status === 'UNPAID'
                              ? 'Overdue'
                              : e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                          </Pill>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {e.status !== 'PAID' && (
                            <div className="inline-flex items-center gap-1">
                              {e.phone && (
                                <a
                                  href={buildOverdueWhatsappUrl(e)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#c8ecd5] text-[#15803d] hover:bg-[#eafaf0]"
                                  title={`Send WhatsApp reminder to ${e.tenant_name}`}
                                  onClick={(ev) => ev.stopPropagation()}
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg text-xs font-bold"
                                onClick={() => setPayingEntry(e)}
                              >
                                <IndianRupee className="mr-1 h-3 w-3" />
                                Pay
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredEntries.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                          {entries.length === 0 ? (
                            <>
                              No ledger entries for {monthName(month)} {year}.{' '}
                              <button
                                type="button"
                                className="font-bold text-accent hover:underline"
                                onClick={handleGenerate}
                              >
                                Click Generate
                              </button>{' '}
                              to create them.
                            </>
                          ) : (
                            <>No entries match the current filter.</>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>
              )}

              {activeTab === 'payments' && (
                <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[#fbfcfe]">
                        {['Date', 'Tenant', 'Room', 'Amount', 'Type', 'Mode', 'For', 'Collected by', ''].map(
                          (h, i) => (
                            <th
                              key={i}
                              className={`px-3 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] ${
                                h === 'Amount' ? 'text-right' : 'text-left'
                              }`}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {groupedPayments.map((group) => {
                        const dupRowsInGroup = group.filter(isDuplicate);
                        const firstDupId = dupRowsInGroup[0]?.id;
                        return group.map((t) => {
                          const isDup = isDuplicate(t);
                          return (
                            <tr
                              key={t.id}
                              className={
                                isDup
                                  ? 'bg-amber-50/60 hover:bg-amber-100/60'
                                  : 'hover:bg-muted/30'
                              }
                            >
                              <td className="px-4 py-3 text-xs tabular-nums">
                                {new Date(t.paid_on).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: '2-digit',
                                })}
                              </td>
                              <td className="px-4 py-3 font-medium">
                                {t.tenant_name}
                                {isDup && t.id === firstDupId && (
                                  <Badge variant="outline" className="ml-2 text-[10px] border-amber-400 text-amber-700">
                                    duplicate
                                  </Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                                {t.room_number ? (
                                  <>
                                    {t.room_number}
                                    {t.bed_label && <span>·{t.bed_label}</span>}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-medium tabular-nums">
                                {formatPaise(t.amount_paise)}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <Badge variant="outline" className="text-[10px]">{t.payment_type}</Badge>
                              </td>
                              <td className="px-4 py-3 text-xs">{t.payment_mode}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {t.for_month && t.for_year ? (
                                  `${monthName(t.for_month).slice(0, 3)} ${t.for_year}`
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs">{t.collector}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  title="Edit payment"
                                  onClick={() => setEditingTxn(t)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  title="Delete payment"
                                  onClick={() => {
                                    if (!window.confirm(
                                      `Delete ${formatPaise(t.amount_paise)} payment for ${t.tenant_name}?`
                                    )) return;
                                    deletePayment.mutate(t.id, {
                                      onSuccess: () =>
                                        toast({ title: 'Payment deleted' }),
                                      onError: (err: unknown) => {
                                        const msg =
                                          (err as { response?: { data?: { error?: { message?: string } } } })
                                            ?.response?.data?.error?.message ?? 'Delete failed.';
                                        toast({ title: 'Failed', description: msg, variant: 'destructive' });
                                      },
                                    });
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        });
                      })}
                      {paymentRows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                            No payments collected in this fiscal window.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'refunds' && (
                <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[#fbfcfe]">
                        {['Date', 'Tenant', 'Room', 'Amount', 'Mode', 'Notes', 'Paid by', ''].map(
                          (h, i) => (
                            <th
                              key={i}
                              className={`px-3 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] ${
                                h === 'Amount' ? 'text-right' : 'text-left'
                              }`}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {refundRows.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-xs tabular-nums">
                            {new Date(t.paid_on).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3 font-medium">{t.tenant_name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                            {t.room_number ? (
                              <>
                                {t.room_number}
                                {t.bed_label && <span>·{t.bed_label}</span>}
                              </>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-rose-700 tabular-nums">
                            -{formatPaise(t.amount_paise)}
                          </td>
                          <td className="px-4 py-3 text-xs">{t.payment_mode}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {t.notes ?? <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">{t.collector}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Edit refund"
                              onClick={() => setEditingTxn(t)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              title="Delete refund"
                              onClick={() => {
                                if (!window.confirm(
                                  `Delete ${formatPaise(t.amount_paise)} refund for ${t.tenant_name}?`
                                )) return;
                                deletePayment.mutate(t.id, {
                                  onSuccess: () => toast({ title: 'Refund deleted' }),
                                  onError: (err: unknown) => {
                                    const msg =
                                      (err as { response?: { data?: { error?: { message?: string } } } })
                                        ?.response?.data?.error?.message ?? 'Delete failed.';
                                    toast({ title: 'Failed', description: msg, variant: 'destructive' });
                                  },
                                });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {refundRows.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                            No refunds issued in this fiscal window.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ))}
      </div>

      <RecordPaymentDialog entry={payingEntry} onClose={() => setPayingEntry(null)} />
      <AddPaymentDialog open={showAddPayment} onClose={() => setShowAddPayment(false)} />
      <EditPaymentDialog txn={editingTxn} onClose={() => setEditingTxn(null)} />
      {selectedPropertyId && (
        <EditOpeningBalanceDialog
          open={showOpeningBalance}
          onClose={() => setShowOpeningBalance(false)}
          propertyId={selectedPropertyId}
          month={month}
          year={year}
          currentPaise={openingBalance}
        />
      )}
      {selectedPropertyId && period && (
        <EditCloseDateDialog
          open={showEditClose}
          onClose={() => setShowEditClose(false)}
          propertyId={selectedPropertyId}
          month={month}
          year={year}
          currentClose={period.overridden ? period.period_end : null}
          defaultClose={period.period_end}
        />
      )}
    </>
  );
}
