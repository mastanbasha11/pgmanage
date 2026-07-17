import { useEffect, useState } from 'react';
import {
  Plus,
  Check,
  X,
  Wallet,
  Pencil,
  Trash2,
  ImagePlus,
  Image as ImageIcon,
  Eye,
  Repeat,
  Search,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  NameAvatar,
  Pill,
  RankBars,
  SectionCard,
  Track,
  type PillTone,
} from '@/components/ui/redesign';
import { useCashflow } from '@/hooks/useDashboard';

/** Stable category colors — index-matched with ExpenseDonut's palette order. */
const CAT_COLORS = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#98a0ad'];

/** 12-month expense trend — simple SVG bar chart, no chart-lib dependency. */
function ExpenseTrend({ points }: { points: { month: string; value: number }[] }) {
  const W = 560;
  const H = 170;
  const pad = { l: 46, r: 8, t: 10, b: 24 };
  const max = Math.max(...points.map((p) => p.value), 1);
  const bw = (W - pad.l - pad.r) / points.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((f) => {
        const y = pad.t + (1 - f) * (H - pad.t - pad.b);
        return (
          <g key={f}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#e9edf4" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#98a0ad">
              ₹{((max * f) / 100000).toFixed(1)}L
            </text>
          </g>
        );
      })}
      {points.map((p, i) => {
        const h = (p.value / max) * (H - pad.t - pad.b);
        const x = pad.l + i * bw + bw * 0.18;
        const isLast = i === points.length - 1;
        return (
          <g key={i}>
            <rect
              x={x}
              y={H - pad.b - h}
              width={bw * 0.64}
              height={Math.max(2, h)}
              rx="3"
              fill={isLast ? '#dc2626' : '#e34948'}
              opacity={isLast ? 1 : 0.55}
            >
              <title>{`${p.month} · ₹${Math.round(p.value / 100).toLocaleString('en-IN')}`}</title>
            </rect>
            {i % 2 === 0 && (
              <text
                x={x + bw * 0.32}
                y={H - 8}
                textAnchor="middle"
                fontSize="9"
                fill="#98a0ad"
              >
                {p.month}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ExpenseDonut } from '@/components/charts/ExpenseDonut';
import {
  useExpenses,
  useExpenseSummary,
  useExpenseCategories,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useUploadReceipt,
  useDeleteReceipt,
  useApproveExpense,
  type Expense,
} from '@/hooks/useExpenses';
import { useAuthStore } from '@/store/auth';
import PaidPersonSelect from '@/components/PaidPersonSelect';
import {
  formatPaise,
  formatDate,
  currentMonthYear,
  rupeesToPaise,
} from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';

const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'] as const;
type PaymentMode = (typeof PAYMENT_MODES)[number];

/**
 * Month-over-month change chip. Green when spending dropped, red when it rose,
 * grey when there's nothing to compare against (previous period was zero).
 * < ₹100 absolute change is a shrug — render as flat.
 */
function MoMBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) {
    return (
      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
        new
      </span>
    );
  }
  const delta = current - previous;
  if (Math.abs(delta) < 10_000) {
    return (
      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
        flat
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const rising = delta > 0;
  return (
    <span
      className={
        rising
          ? 'rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700'
          : 'rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700'
      }
      title={
        rising
          ? `Up ₹${Math.round(delta / 100).toLocaleString('en-IN')} vs previous month`
          : `Down ₹${Math.round(-delta / 100).toLocaleString('en-IN')} vs previous month`
      }
    >
      {rising ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

const schema = z.object({
  category_id: z.string().uuid('Select a category'),
  description: z.string().min(2, 'Description required'),
  vendor_name: z.string().optional(),
  paid_by: z.string().optional(),
  amount_rupees: z.coerce.number().positive('Amount required'),
  purchase_date: z.string().min(1, 'Date required'),
  payment_mode: z.enum(PAYMENT_MODES).default('CASH'),
  reference_number: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

// ── Receipt thumbnail (auth-protected fetch → blob URL) ───────────────────────

function ReceiptThumb({
  expenseId,
  onOpen,
}: {
  expenseId: string;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let blob: string | null = null;
    (async () => {
      try {
        const resp = await api.get(`/expenses/${expenseId}/receipt`, {
          responseType: 'blob',
        });
        if (cancelled) return;
        blob = URL.createObjectURL(resp.data);
        setSrc(blob);
      } catch {
        // missing — leave null
      }
    })();
    return () => {
      cancelled = true;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [expenseId]);

  if (!src) {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative inline-block h-9 w-9 overflow-hidden rounded border bg-card"
    >
      <img src={src} alt="receipt" className="h-full w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 text-transparent group-hover:text-white transition-all">
        <Eye className="h-4 w-4" />
      </span>
    </button>
  );
}

function ReceiptViewer({
  expenseId,
  onClose,
}: {
  expenseId: string | null;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!expenseId) return;
    let cancelled = false;
    let blob: string | null = null;
    (async () => {
      try {
        const resp = await api.get(`/expenses/${expenseId}/receipt`, {
          responseType: 'blob',
        });
        if (cancelled) return;
        blob = URL.createObjectURL(resp.data);
        setSrc(blob);
      } catch {
        setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [expenseId]);

  return (
    <Dialog open={!!expenseId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>
        {src ? (
          <img
            src={src}
            alt="receipt"
            className="mx-auto max-h-[70vh] w-auto rounded border"
          />
        ) : (
          <p className="text-center text-sm text-muted-foreground py-8">
            No receipt available.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Add/Edit dialog ───────────────────────────────────────────────────────────

function ExpenseDialog({
  open,
  onClose,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  /** If set → edit mode. If null → create mode. */
  expense: Expense | null;
}) {
  const isEdit = !!expense;
  const { selectedPropertyId } = useAuthStore();
  const { data: cats } = useExpenseCategories(selectedPropertyId ?? undefined);
  const create = useCreateExpense();
  const update = useUpdateExpense(expense?.id ?? '');
  const upload = useUploadReceipt();
  const { toast } = useToast();
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      payment_mode: 'CASH',
      purchase_date: new Date().toISOString().slice(0, 10),
    },
  });

  useEffect(() => {
    if (open && expense) {
      reset({
        category_id: expense.category_id ?? '',
        description: expense.description ?? '',
        vendor_name: expense.vendor_name ?? '',
        paid_by: expense.paid_by ?? '',
        amount_rupees: expense.amount_paise / 100,
        purchase_date: expense.purchase_date.slice(0, 10),
        payment_mode: ((expense.payment_mode as PaymentMode) ?? 'CASH'),
        reference_number: expense.reference_number ?? '',
      });
    } else if (open && !expense) {
      reset({
        payment_mode: 'CASH',
        purchase_date: new Date().toISOString().slice(0, 10),
      });
    }
    if (open) setPendingFile(null);
  }, [open, expense, reset]);

  async function onSubmit(data: FormData) {
    if (!selectedPropertyId && !isEdit) {
      toast({
        title: 'No property selected',
        description: 'Pick a property from the sidebar first.',
        variant: 'destructive',
      });
      return;
    }
    try {
      let id = expense?.id;
      if (isEdit) {
        await update.mutateAsync({
          category_id: data.category_id,
          description: data.description,
          vendor_name: data.vendor_name || undefined,
          paid_by: data.paid_by || undefined,
          amount_paise: rupeesToPaise(data.amount_rupees),
          purchase_date: data.purchase_date,
          payment_mode: data.payment_mode,
          reference_number: data.reference_number || undefined,
        });
      } else {
        const res = await create.mutateAsync({
          category_id: data.category_id,
          description: data.description,
          vendor_name: data.vendor_name || undefined,
          paid_by: data.paid_by || undefined,
          amount_paise: rupeesToPaise(data.amount_rupees),
          purchase_date: data.purchase_date,
          property_id: selectedPropertyId!,
          payment_mode: data.payment_mode,
          reference_number: data.reference_number || undefined,
        });
        id = res.expense_id;
      }
      // Upload receipt if user picked one
      if (pendingFile && id) {
        await upload.mutateAsync({ id, file: pendingFile });
      }
      toast({ title: isEdit ? 'Expense updated' : 'Expense added' });
      reset();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not save expense.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update fields and / or replace the receipt.' : 'Record a new spend.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Category *</Label>
            <Select
              value={watch('category_id') ?? ''}
              onValueChange={(v) => setValue('category_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {cats?.items?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category_id && (
              <p className="text-xs text-destructive mt-1">{errors.category_id.message}</p>
            )}
          </div>
          <div>
            <Label>Description *</Label>
            <Input {...register('description')} placeholder="Monthly electricity bill" />
            {errors.description && (
              <p className="text-xs text-destructive mt-1">{errors.description.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹) *</Label>
              <Input {...register('amount_rupees')} type="number" placeholder="500" />
              {errors.amount_rupees && (
                <p className="text-xs text-destructive mt-1">{errors.amount_rupees.message}</p>
              )}
            </div>
            <div>
              <Label>Date *</Label>
              <Input {...register('purchase_date')} type="date" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vendor</Label>
              <Input {...register('vendor_name')} placeholder="BESCOM / Reliance" />
            </div>
            <div>
              <Label>Paid by</Label>
              <PaidPersonSelect
                value={watch('paid_by') ?? ''}
                onChange={(v) => setValue('paid_by', v, { shouldValidate: true })}
                propertyId={selectedPropertyId ?? undefined}
                placeholder="Who paid…"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <Input {...register('reference_number')} placeholder="Optional" />
            </div>
          </div>
          <div>
            <Label>Receipt (optional)</Label>
            <label
              htmlFor="receipt-input"
              className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
            >
              <ImagePlus className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">
                {pendingFile?.name ?? (expense?.receipt_path ? 'Replace existing receipt' : 'Choose image')}
              </span>
              <input
                id="receipt-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Auto-compressed to JPEG ~85% quality, max 1600px wide. Stored on the
              server + nightly backup to S3.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEdit ? 'Save changes' : 'Add expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }),
}));
const NOW = new Date().getFullYear();
const YEARS = [NOW - 1, NOW, NOW + 1];

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
type ModeFilter = 'ALL' | 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';

export default function ExpensesPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const { selectedPropertyId, canApproveExpenses, user } = useAuthStore();
  const isOwnerOrPartner = user?.role === 'OWNER' || user?.role === 'PARTNER';
  const cmy = currentMonthYear();
  const [month, setMonth] = useState(cmy.month);
  const [year, setYear] = useState(cmy.year);

  // Filter / search state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [paidByFilter, setPaidByFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('ALL');

  // 300ms debounce on free-text search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data: filterCats } = useExpenseCategories(selectedPropertyId ?? undefined);
  const { data: expenses, isLoading } = useExpenses({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
    approval_status: statusFilter === 'ALL' ? undefined : statusFilter,
    category_id: categoryFilter === 'ALL' ? undefined : categoryFilter,
    paid_by: paidByFilter === 'ALL' ? undefined : paidByFilter,
    payment_mode: modeFilter === 'ALL' ? undefined : modeFilter,
    q: debouncedSearch || undefined,
  });
  // Summary card aggregates the whole period (unfiltered) — keeping it that
  // way means the by-person and recurring-items panels stay useful as a
  // reference even when the table is filtered down.
  const { data: summary } = useExpenseSummary({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
  });

  const hasActiveFilters =
    debouncedSearch !== '' ||
    categoryFilter !== 'ALL' ||
    paidByFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    modeFilter !== 'ALL';

  function clearFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setCategoryFilter('ALL');
    setPaidByFilter('ALL');
    setStatusFilter('ALL');
    setModeFilter('ALL');
  }

  const { mutateAsync: approve } = useApproveExpense();
  const { mutateAsync: del } = useDeleteExpense();
  const { mutateAsync: deleteReceipt } = useDeleteReceipt();
  const { toast } = useToast();

  async function handleApprove(id: string, approved: boolean) {
    try {
      const reason = approved ? undefined : window.prompt('Reason for rejection?') ?? undefined;
      if (!approved && !reason) return;
      await approve({ id, approved, rejection_reason: reason });
      toast({ title: approved ? 'Expense approved' : 'Expense rejected' });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Action failed.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  async function handleDelete(e: Expense) {
    if (!window.confirm(`Delete "${e.description}" (${formatPaise(e.amount_paise)})?`)) return;
    try {
      await del(e.id);
      toast({ title: 'Expense removed' });
    } catch {
      toast({ title: 'Failed', variant: 'destructive' });
    }
  }

  async function handleDeleteReceipt(e: Expense) {
    if (!window.confirm('Remove the receipt image?')) return;
    try {
      await deleteReceipt(e.id);
      toast({ title: 'Receipt removed' });
    } catch {
      toast({ title: 'Failed', variant: 'destructive' });
    }
  }

  const items = expenses?.items ?? [];

  // ── KPI + graph inputs (all from real data) ───────────────────────────────
  const pendingRows = items.filter((e) => (e.status ?? e.approval_status) === 'PENDING');
  const topCategory = summary?.items?.[0] ?? null;
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const daysElapsed = Math.max(
    1,
    isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate(),
  );
  const { data: cashflowData } = useCashflow(selectedPropertyId ?? undefined);
  const trendPoints = (cashflowData?.items ?? []).map((p) => ({
    month: p.month,
    value: p.expenses_paise,
  }));

  return (
    <>
      <div className="mx-auto max-w-[1280px] space-y-4">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3.5">
          <div>
            <h1 className="text-[21px] font-extrabold tracking-tight">Expenses</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {MONTHS.find((mm) => mm.value === month)?.label} {year} · total{' '}
              <span className="tnum font-extrabold text-foreground">
                {formatPaise(summary?.total_paise ?? 0)}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <Button size="sm" className="h-9 gap-2 rounded-xl font-bold" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          </div>
        </div>

        {/* Search + filters — kept from the old page (mock dropped them), restyled */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
          <div className="relative min-w-[220px] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search description, vendor, paid by, UTR..."
              className="h-9 rounded-full pl-8 text-xs font-semibold"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-40 rounded-full text-xs font-bold">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {filterCats?.items?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isOwnerOrPartner && (
            <Select value={paidByFilter} onValueChange={setPaidByFilter}>
              <SelectTrigger className="h-9 w-36 rounded-full text-xs font-bold">
                <SelectValue placeholder="Paid by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All payers</SelectItem>
                {(summary?.by_person ?? [])
                  .filter((p) => p.person && p.person !== 'Unattributed')
                  .map((p) => (
                    <SelectItem key={p.person} value={p.person}>
                      {p.person}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="h-9 w-32 rounded-full text-xs font-bold">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={modeFilter}
            onValueChange={(v) => setModeFilter(v as ModeFilter)}
          >
            <SelectTrigger className="h-9 w-32 rounded-full text-xs font-bold">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All modes</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
              <SelectItem value="CARD">Card</SelectItem>
              <SelectItem value="CHEQUE">Cheque</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 rounded-full font-bold">
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {/* KPI row — computed from real summary + loaded rows */}
        {summary && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs font-bold text-muted-foreground">Total spent</div>
              <p className="tnum mt-1.5 text-[21px] font-extrabold tracking-tight">
                {formatPaise(summary.total_paise ?? 0)}
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#98a0ad]">
                <MoMBadge
                  current={summary.total_paise ?? 0}
                  previous={(summary.previous_items ?? []).reduce(
                    (a, c) => a + c.total_paise,
                    0,
                  )}
                />
                vs previous month
              </div>
            </div>
            <div
              className={`rounded-2xl border p-4 shadow-sm ${
                pendingRows.length > 0
                  ? 'border-[#f3d59b] bg-[#fffdf6]'
                  : 'border-border bg-card'
              }`}
            >
              <div className="text-xs font-bold text-muted-foreground">Pending approval</div>
              <p
                className={`tnum mt-1.5 text-[21px] font-extrabold tracking-tight ${
                  pendingRows.length > 0 ? 'text-[#b45309]' : ''
                }`}
              >
                {pendingRows.length}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[#98a0ad]">
                {pendingRows.length > 0
                  ? `${formatPaise(pendingRows.reduce((a, e) => a + e.amount_paise, 0))} waiting on you`
                  : 'nothing waiting'}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs font-bold text-muted-foreground">Top category</div>
              <p className="mt-1.5 truncate text-[21px] font-extrabold tracking-tight">
                {topCategory?.category_name ?? '—'}
              </p>
              <p className="tnum mt-1 text-[11px] font-semibold text-[#98a0ad]">
                {topCategory ? formatPaise(topCategory.total_paise) : 'no spend yet'}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs font-bold text-muted-foreground">Avg spend / day</div>
              <p className="tnum mt-1.5 text-[21px] font-extrabold tracking-tight">
                {formatPaise(Math.round((summary.total_paise ?? 0) / daysElapsed))}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[#98a0ad]">
                over {daysElapsed} day{daysElapsed === 1 ? '' : 's'} this month
              </p>
            </div>
          </div>
        )}

        {/* Graphs row — donut + track bars, and the 12-month trend */}
        <div className="grid gap-3.5 lg:grid-cols-2">
          {(summary?.items?.length ?? 0) > 0 && (
            <SectionCard
              title="🧾 Where the money went"
              sub="By category · bars are share of this month's total · badges compare vs last month."
            >
              <div className="flex items-center gap-5">
                <ExpenseDonut data={summary!.items} />
                <div className="min-w-0 flex-1 space-y-2.5">
                  {summary!.items.slice(0, 7).map((c, i) => {
                    const prev =
                      summary!.previous_items?.find(
                        (p) => p.category_name === c.category_name,
                      )?.total_paise ?? 0;
                    const pct =
                      (summary!.total_paise ?? 0) > 0
                        ? (c.total_paise / summary!.total_paise) * 100
                        : 0;
                    const color = CAT_COLORS[i % CAT_COLORS.length];
                    return (
                      <div key={c.category_name}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 font-bold">
                            <span
                              className="h-2.5 w-2.5 flex-none rounded-[3px]"
                              style={{ background: color }}
                            />
                            <span className="truncate">{c.category_name}</span>
                          </span>
                          <span className="flex flex-none items-center gap-1.5">
                            <span className="tnum font-extrabold">
                              {formatPaise(c.total_paise)}
                            </span>
                            <MoMBadge current={c.total_paise} previous={prev} />
                          </span>
                        </div>
                        <Track pct={pct} color={color} className="mt-1 h-[5px]" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="📉 Spend trend"
            sub="Total expenses per month · last 12 months."
          >
            {trendPoints.length > 1 ? (
              <ExpenseTrend points={trendPoints} />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Not enough history yet.
              </div>
            )}
          </SectionCard>
        </div>

        {isOwnerOrPartner && (summary?.by_person?.length ?? 0) > 0 && (
          <SectionCard
            title="👥 Spend by person"
            sub="Approved spend logged against each staff member this month."
          >
            <RankBars
              labelWidth={180}
              rows={summary!.by_person!.map((p, i) => ({
                label: p.person,
                sub: `${p.count} expense${p.count === 1 ? '' : 's'} · ${
                  (summary!.total_paise ?? 0) > 0
                    ? Math.round((p.total_paise / summary!.total_paise) * 100)
                    : 0
                }%`,
                value: p.total_paise,
                display: formatPaise(p.total_paise),
                color: ['#dc2626', '#e34948', '#eb6834', '#eda100', '#e87ba4', '#98a0ad', '#c7ccd6'][
                  i % 7
                ],
              }))}
            />
          </SectionCard>
        )}

        {(summary?.recurring_items?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Repeat className="h-4 w-4 text-accent" />
                Recurring items
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Spend on common items (matched against the description). One expense can
                count toward multiple buckets, so totals here can exceed the period total.
                Badges compare against the previous month.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {summary!.recurring_items!.map((r) => {
                  const prev =
                    summary!.previous_recurring_items?.find((p) => p.item === r.item)
                      ?.total_paise ?? 0;
                  return (
                    <div
                      key={r.item}
                      className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.item}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.count}{' '}
                          {r.count === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        <p className="font-semibold tabular-nums">
                          {formatPaise(r.total_paise)}
                        </p>
                        <MoMBadge current={r.total_paise} previous={prev} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">
              {hasActiveFilters
                ? 'No expenses match the current filters.'
                : `No expenses for ${MONTHS.find((mm) => mm.value === month)?.label} ${year}`}
            </p>
            {hasActiveFilters ? (
              <Button variant="outline" className="mt-4 gap-2" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear filters
              </Button>
            ) : (
              <Button className="mt-4 gap-2" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4" />
                Record your first expense
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[#fbfcfe]">
                  {[
                    ['Description', 'text-left', ''],
                    ['Category', 'text-left', 'hidden sm:table-cell'],
                    ['Date', 'text-left', 'hidden md:table-cell'],
                    ['Paid by', 'text-left', 'hidden lg:table-cell'],
                    ['Receipt', 'text-center', ''],
                    ['Amount', 'text-right', ''],
                    ['Status', 'text-center', ''],
                    ['', 'text-left', ''],
                  ].map(([h, align, extra], i) => (
                    <th
                      key={i}
                      className={`px-3 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] ${align} ${extra}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9edf4]">
                {items.map((e) => (
                  <tr
                    key={e.id}
                    className={
                      (e.status ?? e.approval_status) === 'PENDING'
                        ? 'bg-[#fffdf4] hover:bg-[#fdf8e8]'
                        : 'hover:bg-muted/30'
                    }
                  >
                    <td className="px-3 py-2.5">
                      <p className="text-[12.5px] font-bold">{e.description}</p>
                      {e.vendor_name && (
                        <p className="text-[11px] font-semibold text-[#98a0ad]">{e.vendor_name}</p>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[11.5px] font-semibold text-muted-foreground sm:table-cell">
                      {e.category_name}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[11.5px] font-semibold text-muted-foreground md:table-cell">
                      {formatDate(e.purchase_date ?? e.expense_date)}
                    </td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      {e.paid_by ? (
                        <span className="inline-flex items-center gap-1.5">
                          <NameAvatar name={e.paid_by} size={22} />
                          <span className="text-[11.5px] font-bold">{e.paid_by}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {e.receipt_path ? (
                        <ReceiptThumb
                          expenseId={e.id}
                          onOpen={() => setViewingReceipt(e.id)}
                        />
                      ) : (
                        <Pill tone="a" dot={false} className="text-[10px]">
                          add receipt
                        </Pill>
                      )}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-[12.5px] font-extrabold">
                      {formatPaise(e.amount_paise)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Pill
                        tone={
                          ((e.status ?? e.approval_status) === 'APPROVED'
                            ? 'g'
                            : (e.status ?? e.approval_status) === 'PENDING'
                              ? 'a'
                              : 'r') as PillTone
                        }
                      >
                        {(e.status ?? e.approval_status ?? '').charAt(0) +
                          (e.status ?? e.approval_status ?? '').slice(1).toLowerCase()}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {canApproveExpenses() &&
                          (e.status ?? e.approval_status) === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-green-600"
                                onClick={() => handleApprove(e.id, true)}
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive"
                                onClick={() => handleApprove(e.id, false)}
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditing(e)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {e.receipt_path && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() => handleDeleteReceipt(e)}
                            title="Remove receipt"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={() => handleDelete(e)}
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

      <ExpenseDialog open={showAdd} onClose={() => setShowAdd(false)} expense={null} />
      <ExpenseDialog open={!!editing} onClose={() => setEditing(null)} expense={editing} />
      <ReceiptViewer expenseId={viewingReceipt} onClose={() => setViewingReceipt(null)} />
    </>
  );
}
