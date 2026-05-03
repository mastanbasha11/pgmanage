import { useState } from 'react';
import { Plus, Check, X, Wallet } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  useApproveExpense,
} from '@/hooks/useExpenses';
import { useAuthStore } from '@/store/auth';
import {
  formatPaise,
  formatDate,
  statusBadgeVariant,
  currentMonthYear,
  rupeesToPaise,
} from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'] as const;
type PaymentMode = (typeof PAYMENT_MODES)[number];

const schema = z.object({
  category_id: z.string().uuid('Select a category'),
  description: z.string().min(2, 'Description required'),
  vendor_name: z.string().optional(),
  amount_rupees: z.coerce.number().positive('Amount required'),
  purchase_date: z.string().min(1, 'Date required'),
  payment_mode: z.enum(PAYMENT_MODES).default('CASH'),
  reference_number: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { selectedPropertyId } = useAuthStore();
  const { data: cats } = useExpenseCategories(selectedPropertyId ?? undefined);
  const { mutateAsync, isPending } = useCreateExpense();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      payment_mode: 'CASH',
      purchase_date: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(data: FormData) {
    if (!selectedPropertyId) {
      toast({
        title: 'No property selected',
        description: 'Pick a property from the sidebar first.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await mutateAsync({
        category_id: data.category_id,
        description: data.description,
        vendor_name: data.vendor_name || undefined,
        amount_paise: rupeesToPaise(data.amount_rupees),
        purchase_date: data.purchase_date,
        property_id: selectedPropertyId,
        payment_mode: data.payment_mode,
        reference_number: data.reference_number || undefined,
      });
      toast({ title: 'Expense added', description: data.description });
      reset();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not add expense.';
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>Record a new spend for this property.</DialogDescription>
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
                <p className="text-xs text-destructive mt-1">
                  {errors.amount_rupees.message}
                </p>
              )}
            </div>
            <div>
              <Label>Date *</Label>
              <Input {...register('purchase_date')} type="date" />
              {errors.purchase_date && (
                <p className="text-xs text-destructive mt-1">{errors.purchase_date.message}</p>
              )}
            </div>
          </div>
          <div>
            <Label>Vendor (optional)</Label>
            <Input {...register('vendor_name')} placeholder="BESCOM / Reliance" />
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
              <Input {...register('reference_number')} placeholder="UPI ref / cheque no" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : 'Add expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpensesPage() {
  const [showAdd, setShowAdd] = useState(false);
  const { selectedPropertyId, canApproveExpenses } = useAuthStore();
  const { month, year } = currentMonthYear();

  const { data: expenses, isLoading } = useExpenses({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
  });
  const { data: summary } = useExpenseSummary({
    property_id: selectedPropertyId ?? undefined,
    month,
    year,
  });

  const { mutateAsync: approve } = useApproveExpense();
  const { toast } = useToast();

  async function handleApprove(id: string, approved: boolean) {
    try {
      const reason = approved ? undefined : window.prompt('Reason for rejection?') ?? undefined;
      if (!approved && !reason) return; // user cancelled
      await approve({ id, approved, rejection_reason: reason });
      toast({ title: approved ? 'Expense approved' : 'Expense rejected' });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Action failed.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  const items = expenses?.items ?? [];

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
            <p className="text-sm text-muted-foreground">
              Total this month:{' '}
              <span className="font-semibold text-foreground">
                {formatPaise(summary?.total_paise ?? 0)}
              </span>
            </p>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        </div>

        {/* Donut chart */}
        {(summary?.items?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Breakdown by category</CardTitle>
            </CardHeader>
            <CardContent>
              <ExpenseDonut data={summary!.items} />
            </CardContent>
          </Card>
        )}

        {/* Expense list */}
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
            <p className="font-medium">No expenses recorded this month</p>
            <Button className="mt-4 gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Record your first expense
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Description
                  </th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground sm:table-cell">
                    Category
                  </th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground md:table-cell">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Status
                  </th>
                  {canApproveExpenses() && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.description}</p>
                      {e.vendor_name && (
                        <p className="text-xs text-muted-foreground">{e.vendor_name}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {e.category_name}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {formatDate(e.purchase_date ?? e.expense_date)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatPaise(e.amount_paise)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusBadgeVariant(e.status ?? e.approval_status)}>
                        {e.status ?? e.approval_status}
                      </Badge>
                    </td>
                    {canApproveExpenses() && (
                      <td className="px-4 py-3 text-right">
                        {(e.status ?? e.approval_status) === 'PENDING' && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleApprove(e.id, true)}
                              title="Approve"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                              onClick={() => handleApprove(e.id, false)}
                              title="Reject"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddExpenseDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </>
  );
}
