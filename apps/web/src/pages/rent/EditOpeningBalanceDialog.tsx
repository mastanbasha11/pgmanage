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
import { monthName, rupeesToPaise } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  month: number;
  year: number;
  currentPaise: number;
}

export default function EditOpeningBalanceDialog({
  open,
  onClose,
  propertyId,
  month,
  year,
  currentPaise,
}: Props) {
  const [rupees, setRupees] = useState(String(Math.round(currentPaise / 100)));
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (open) setRupees(String(Math.round(currentPaise / 100)));
  }, [open, currentPaise]);

  const save = useMutation({
    mutationFn: (paise: number) =>
      api
        .put(`/properties/${propertyId}/billing-period/${year}/${month}`, {
          opening_balance_paise: paise,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rent-ledger'] });
      qc.invalidateQueries({ queryKey: ['billing-period'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast({ title: 'Opening balance saved' });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not save opening balance';
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    },
  });

  function submit() {
    const n = Number(rupees);
    if (Number.isNaN(n) || n < 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    save.mutate(rupeesToPaise(n));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Opening balance</DialogTitle>
          <DialogDescription>
            Cash kept aside at the start of {monthName(month)} {year} before
            profit-sharing — carry-forward from the previous month. Counts
            toward Total Received.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount (₹)</Label>
            <Input
              autoFocus
              type="number"
              step="1"
              min={0}
              value={rupees}
              onChange={(e) => setRupees(e.target.value)}
              placeholder="50000"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
