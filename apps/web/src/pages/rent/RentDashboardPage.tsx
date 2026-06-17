import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  IndianRupee,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Wallet,
  Receipt,
  Tag,
  Users,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Pencil,
  Trash2,
  Zap,
  CalendarRange,
  PiggyBank,
} from 'lucide-react';
import AddPaymentDialog from './AddPaymentDialog';
import EditCloseDateDialog from './EditCloseDateDialog';
import EditOpeningBalanceDialog from './EditOpeningBalanceDialog';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  statusBadgeVariant,
  currentMonthYear,
  rupeesToPaise,
  shortRoomType,
} from '@/lib/utils';
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
            <Input {...register('paid_to')} placeholder="Who received the cash, e.g. Suresh" />
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
  const {
    register,
    handleSubmit,
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
              <Input placeholder="Collector name" {...register('paid_to')} />
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

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  tone?: 'default' | 'success' | 'destructive';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-green-600 bg-green-50'
      : tone === 'destructive'
      ? 'text-destructive bg-destructive/10'
      : 'text-accent bg-accent/10';
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${toneClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
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

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Rent &amp; Payments</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Track collection for {monthName(month)} {year}</span>
              {period && (
                <button
                  type="button"
                  onClick={() => setShowEditClose(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs hover:border-accent hover:text-accent transition-colors"
                  title="Edit fiscal close date"
                >
                  <CalendarDays className="h-3 w-3" />
                  Period: {new Date(period.period_start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {' – '}
                  {new Date(period.period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {period.overridden && (
                    <span className="ml-1 text-[10px] uppercase text-amber-600">override</span>
                  )}
                  <Pencil className="h-3 w-3 opacity-60" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-36">
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
              <SelectTrigger className="w-24">
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
              className="gap-1"
            >
              <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
              Generate
            </Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={() => setShowAddPayment(true)}
              disabled={!selectedPropertyId}
            >
              <Plus className="h-4 w-4" />
              Add Payment
            </Button>
          </div>
        </div>

        {/* Summary — totals hidden for managers, only progress shown */}
        {showMoneyTotals ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Expected"
                value={formatPaise(stats.expected_paise)}
                icon={TrendingUp}
              />
              <StatCard
                label="Collected"
                value={formatPaise(stats.collected_paise)}
                icon={Wallet}
                tone="success"
              />
              <StatCard
                label="Discount given"
                value={formatPaise(stats.discount_paise)}
                icon={Tag}
                tone={stats.discount_paise > 0 ? 'success' : 'default'}
              />
              <StatCard
                label="Outstanding"
                value={formatPaise(stats.outstanding_paise)}
                icon={Receipt}
                tone={stats.outstanding_paise > 0 ? 'destructive' : 'success'}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Advance received"
                value={formatPaise(advanceReceived)}
                icon={ArrowDownToLine}
                tone={advanceReceived > 0 ? 'success' : 'default'}
              />
              <StatCard
                label="Refunds given"
                value={formatPaise(refundsGiven)}
                icon={ArrowUpFromLine}
                tone={refundsGiven > 0 ? 'destructive' : 'default'}
              />
              <StatCard
                label="Collection rate"
                value={`${collectionPct}%`}
                icon={TrendingUp}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Daily stays"
                value={formatPaise(dailyStays)}
                icon={CalendarRange}
                tone={dailyStays > 0 ? 'success' : 'default'}
              />
              <StatCard
                label="Power meters"
                value={formatPaise(powerReceived)}
                icon={Zap}
                tone={powerReceived > 0 ? 'success' : 'default'}
              />
              <Card className="cursor-pointer hover:border-accent" onClick={() => setShowOpeningBalance(true)}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Opening balance</p>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <PiggyBank className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatPaise(openingBalance)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Carry-forward from previous month · Click to edit
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Collected by breakdown */}
            {collectors.length > 0 && (
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-sm font-medium">
                      Collected by — {monthName(month)} {year}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {collectors.map((c) => {
                      const rent = c.rent_paise ?? c.amount_paise;
                      const adv = c.advance_paise ?? 0;
                      return (
                        <div
                          key={c.collector}
                          className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{c.collector}</p>
                            <p className="text-[11px] text-muted-foreground">
                              <span>Rent {formatPaise(rent)}</span>
                              {adv > 0 && (
                                <span className="ml-2">· Advance {formatPaise(adv)}</span>
                              )}
                            </p>
                          </div>
                          <p className="font-semibold tabular-nums">
                            {formatPaise(c.amount_paise)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Collection rate" value={`${collectionPct}%`} icon={TrendingUp} />
            <StatCard
              label="Tenants"
              value={`${entries.filter((e) => e.status === 'PAID').length}/${entries.length} paid`}
              icon={Wallet}
              tone="success"
            />
          </div>
        )}

        {/* Progress bar */}
        {stats.expected_paise > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Collection progress</span>
              <span className="font-medium text-foreground">{collectionPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(collectionPct, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Overdue banner */}
        {(overdue?.items?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>{overdue.items.length}</strong> tenants have overdue rent from previous
              months.
            </span>
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
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RentTab)}>
                <TabsList>
                  <TabsTrigger value="tenants">Tenants ({entries.length})</TabsTrigger>
                  <TabsTrigger value="payments">
                    Payments ({paymentRows.length})
                  </TabsTrigger>
                  <TabsTrigger value="refunds">
                    Refunds ({refundRows.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {activeTab === 'tenants' && (
              <>
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground mr-1">Filter:</p>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as LedgerStatus)}
                >
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    <SelectItem value="UNPAID">Unpaid</SelectItem>
                    <SelectItem value="PARTIAL">Partial</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                  </SelectContent>
                </Select>
                {showMoneyTotals && (
                  <Select value={collectorFilter} onValueChange={setCollectorFilter}>
                    <SelectTrigger className="h-8 w-44 text-xs">
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
                      className="text-xs text-accent font-medium hover:underline"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Room
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Tenant
                      </th>
                      {showMoneyTotals && (
                        <>
                          <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground md:table-cell">
                            Due
                          </th>
                          <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground lg:table-cell">
                            Paid
                          </th>
                          <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground lg:table-cell">
                            Discount
                          </th>
                          <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground lg:table-cell">
                            Paid on
                          </th>
                          <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground xl:table-cell">
                            Collected by
                          </th>
                        </>
                      )}
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-sm">
                          {e.room_number ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center justify-center min-w-[2.25rem] rounded-md bg-accent/10 px-1.5 py-0.5 text-accent font-bold tabular-nums">
                                {e.room_number}
                              </span>
                              {e.bed_label && (
                                <span className="text-muted-foreground tabular-nums">
                                  ·{e.bed_label}
                                </span>
                              )}
                              {e.room_type && (
                                <Badge variant="outline" className="text-[10px] px-1 h-4 ml-0.5">
                                  {shortRoomType(e.room_type)}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {e.tenant_name}
                          {e.outstanding_paise > 0 && (
                            <p className="text-[11px] text-destructive">
                              {formatPaise(e.outstanding_paise)} outstanding
                            </p>
                          )}
                        </td>
                        {showMoneyTotals && (
                          <>
                            <td className="hidden px-4 py-3 text-right text-muted-foreground md:table-cell tabular-nums">
                              {formatPaise(e.amount_due_paise)}
                            </td>
                            <td className="hidden px-4 py-3 text-right lg:table-cell tabular-nums">
                              {formatPaise(e.amount_paid_paise)}
                            </td>
                            <td className="hidden px-4 py-3 text-right lg:table-cell tabular-nums">
                              {e.discount_paise > 0 ? (
                                <span className="text-emerald-600 font-medium">
                                  {formatPaise(e.discount_paise)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="hidden px-4 py-3 lg:table-cell text-xs text-muted-foreground tabular-nums">
                              {e.paid_on ? (
                                new Date(e.paid_on).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                })
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="hidden px-4 py-3 xl:table-cell text-xs">
                              {e.collected_by && e.collected_by.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {e.collected_by.map((c) => (
                                    <Badge
                                      key={c}
                                      variant="outline"
                                      className="text-[10px] px-1.5 h-4"
                                    >
                                      {c}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusBadgeVariant(e.status)}>{e.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {e.status !== 'PAID' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setPayingEntry(e)}
                            >
                              <IndianRupee className="h-3 w-3 mr-1" />
                              Pay
                            </Button>
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
                                className="text-accent font-medium hover:underline"
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
                <div className="overflow-hidden rounded-lg border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tenant</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Room</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mode</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">For</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Collected by</th>
                        <th className="px-4 py-3" />
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
                <div className="overflow-hidden rounded-lg border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tenant</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Room</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mode</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notes</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Paid by</th>
                        <th className="px-4 py-3" />
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
