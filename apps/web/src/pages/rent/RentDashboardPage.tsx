import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IndianRupee, RefreshCw, AlertCircle, TrendingUp, Wallet, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  type PaymentMode,
} from '@/hooks/usePayments';
import { useAuthStore } from '@/store/auth';
import {
  formatPaise,
  monthName,
  statusBadgeVariant,
  currentMonthYear,
  rupeesToPaise,
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
  outstanding_paise: number;
  status: string;
}

const paymentSchema = z.object({
  amount_rupees: z.coerce.number().positive('Amount must be > 0'),
  payment_mode: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE']),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
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
    defaultValues: { payment_mode: 'CASH' },
  });

  if (!entry) return null;

  async function submit(data: PaymentFormData) {
    if (!entry) return;
    try {
      await mutateAsync({
        tenant_id: entry.tenant_id,
        amount_paise: rupeesToPaise(data.amount_rupees),
        payment_type: 'RENT',
        payment_mode: data.payment_mode,
        for_month: entry.month,
        for_year: entry.year,
        reference_number: data.reference_number || undefined,
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
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm flex justify-between">
            <span className="text-muted-foreground">Outstanding</span>
            <span className="font-semibold text-destructive">
              {formatPaise(entry.outstanding_paise)}
            </span>
          </div>

          <div>
            <Label>Amount (₹) *</Label>
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
            <Label>Payment Mode *</Label>
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

          <div>
            <Label>Reference / UTR (optional)</Label>
            <Input
              {...register('reference_number')}
              placeholder="UPI ref / cheque number"
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
  const { selectedPropertyId } = useAuthStore();
  const { month: cm, year: cy } = currentMonthYear();
  const [month, setMonth] = useState(cm);
  const [year, setYear] = useState(cy);
  const [payingEntry, setPayingEntry] = useState<LedgerEntry | null>(null);
  const { toast } = useToast();

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
  const totalDue = entries.reduce((s, e) => s + e.amount_due_paise, 0);
  const totalPaid = entries.reduce((s, e) => s + e.amount_paid_paise, 0);
  const totalOutstanding = entries.reduce((s, e) => s + e.outstanding_paise, 0);
  const collectionPct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Rent &amp; Payments</h1>
            <p className="text-sm text-muted-foreground">
              Track collection for {monthName(month)} {year}
            </p>
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
          </div>
        </div>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Expected" value={formatPaise(totalDue)} icon={TrendingUp} />
          <StatCard
            label="Collected"
            value={formatPaise(totalPaid)}
            icon={Wallet}
            tone="success"
          />
          <StatCard
            label="Outstanding"
            value={formatPaise(totalOutstanding)}
            icon={Receipt}
            tone={totalOutstanding > 0 ? 'destructive' : 'success'}
          />
          <StatCard label="Collection rate" value={`${collectionPct}%`} icon={TrendingUp} />
        </div>

        {/* Progress bar */}
        {totalDue > 0 && (
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
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Tenant
                    </th>
                    <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground sm:table-cell">
                      Due
                    </th>
                    <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground md:table-cell">
                      Paid
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Outstanding
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{e.tenant_name}</td>
                      <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell tabular-nums">
                        {formatPaise(e.amount_due_paise)}
                      </td>
                      <td className="hidden px-4 py-3 text-right md:table-cell tabular-nums">
                        {formatPaise(e.amount_paid_paise)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {e.outstanding_paise > 0 ? (
                          <span className="text-destructive font-medium">
                            {formatPaise(e.outstanding_paise)}
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs font-medium">Clear</span>
                        )}
                      </td>
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
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        No ledger entries for {monthName(month)} {year}.{' '}
                        <button
                          type="button"
                          className="text-accent font-medium hover:underline"
                          onClick={handleGenerate}
                        >
                          Click Generate
                        </button>{' '}
                        to create them.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
      </div>

      <RecordPaymentDialog entry={payingEntry} onClose={() => setPayingEntry(null)} />
    </>
  );
}
