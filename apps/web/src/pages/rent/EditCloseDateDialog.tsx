import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { formatDate, monthName } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  month: number;
  year: number;
  /** Current close date (override) for this month, ISO date string or null. */
  currentClose: string | null;
  /** Effective close date if no override is set (computed from settlement_day). */
  defaultClose: string;
}

/**
 * Lets the partner update or clear the per-month close date for the
 * Rent & Payments / Expenses fiscal period.
 */
export default function EditCloseDateDialog({
  open,
  onClose,
  propertyId,
  month,
  year,
  currentClose,
  defaultClose,
}: Props) {
  const [closeDate, setCloseDate] = useState(currentClose ?? defaultClose);
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (open) setCloseDate(currentClose ?? defaultClose);
  }, [open, currentClose, defaultClose]);

  const save = useMutation({
    mutationFn: () =>
      api
        .put(`/properties/${propertyId}/billing-period/${year}/${month}`, {
          close_date: closeDate,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
      qc.invalidateQueries({ queryKey: ['rent-overdue'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['billing-period'] });
    },
  });

  const clear = useMutation({
    mutationFn: () =>
      api
        .delete(`/properties/${propertyId}/billing-period/${year}/${month}`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
      qc.invalidateQueries({ queryKey: ['rent-overdue'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['billing-period'] });
    },
  });

  async function onSave() {
    try {
      await save.mutateAsync();
      toast({
        title: 'Close date saved',
        description: `${monthName(month)} ${year} now closes on ${formatDate(closeDate)}.`,
      });
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to save';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  async function onClear() {
    if (!window.confirm('Clear this override and use the default settlement day?'))
      return;
    try {
      await clear.mutateAsync();
      toast({ title: 'Override cleared' });
      onClose();
    } catch {
      toast({ title: 'Failed', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Close date — {monthName(month)} {year}
          </DialogTitle>
          <DialogDescription>
            Whatever's collected/spent on or before this date counts toward{' '}
            {monthName(month)} {year}. Anything after rolls into the next fiscal month.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label>Close date</Label>
            <Input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Default (from settlement day) is <strong>{formatDate(defaultClose)}</strong>.
              Override here if the partners actually closed on a different date.
            </p>
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={!currentClose || clear.isPending}
            onClick={onClear}
          >
            Clear override
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Save close date'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
