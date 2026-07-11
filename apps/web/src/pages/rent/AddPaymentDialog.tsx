import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenants } from '@/hooks/useTenants';
import { useRecordPayment, type PaymentMode, type PaymentType } from '@/hooks/usePayments';
import PaidPersonSelect from '@/components/PaidPersonSelect';
import { useToast } from '@/hooks/useToast';
import { rupeesToPaise, monthName } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'] as const;

const schema = z
  .object({
    tenant_id: z.string().optional(),
    payment_type: z.enum([
      'RENT', 'ADVANCE', 'DEPOSIT', 'REFUND', 'OTHER_CHARGE', 'FOOD', 'POWER',
    ]),
    amount_rupees: z.coerce.number().positive('Amount required'),
    for_month: z.coerce.number().int().min(1).max(12).optional(),
    for_year: z.coerce.number().int().min(2000).max(2100).optional(),
    for_days: z.coerce.number().int().min(0).max(31).optional(),
    payment_mode: z.enum(PAYMENT_MODES),
    paid_to: z.string().optional(),
    collected_at: z.string().min(1, 'Date required'),
    notes: z.string().optional(),
  })
  .refine(
    (d) => d.payment_type === 'POWER' || (d.tenant_id && d.tenant_id.length > 0),
    { message: 'Pick a tenant', path: ['tenant_id'] },
  );

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the tenant (e.g. from tenant detail page Advance tab) */
  defaultTenantId?: string;
  /** Pre-fill the payment type (e.g. ADVANCE for advance flow) */
  defaultType?: PaymentType;
  title?: string;
  description?: string;
}

export default function AddPaymentDialog({
  open,
  onClose,
  defaultTenantId,
  defaultType = 'RENT',
  title = 'Add Payment',
  description = 'Record a payment that doesn\'t fit the standard monthly rent flow — daily stays, partial advances, ad-hoc refunds, etc.',
}: Props) {
  const { selectedPropertyId } = useAuthStore();
  const { data: tenantsData } = useTenants({
    property_id: selectedPropertyId ?? undefined,
    status: 'ALL',
    limit: 500,
  });
  const tenants = tenantsData?.items ?? [];

  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);

  const { mutateAsync, isPending } = useRecordPayment();
  const { toast } = useToast();
  const [tenantSearch, setTenantSearch] = useState('');

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
      tenant_id: defaultTenantId,
      payment_type: defaultType,
      payment_mode: 'CASH',
      for_month: today.getMonth() + 1,
      for_year: today.getFullYear(),
      collected_at: ymd,
    },
  });

  // Re-apply defaults when dialog re-opens
  useEffect(() => {
    if (open) {
      reset({
        tenant_id: defaultTenantId,
        payment_type: defaultType,
        payment_mode: 'CASH',
        for_month: today.getMonth() + 1,
        for_year: today.getFullYear(),
        collected_at: ymd,
        amount_rupees: undefined,
        for_days: undefined,
        paid_to: '',
        notes: '',
      });
      setTenantSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredTenants = useMemo(() => {
    if (!tenantSearch) return tenants.slice(0, 50);
    const s = tenantSearch.toLowerCase();
    return tenants
      .filter(
        (t) =>
          t.name.toLowerCase().includes(s) ||
          (t.phone ?? '').includes(s) ||
          (t.room_number ?? '').toLowerCase().includes(s),
      )
      .slice(0, 50);
  }, [tenants, tenantSearch]);

  const selectedTenantId = watch('tenant_id');
  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);
  const paymentType = watch('payment_type');
  const isRent = paymentType === 'RENT';
  const isPower = paymentType === 'POWER';

  async function onSubmit(data: FormData) {
    try {
      await mutateAsync({
        tenant_id: isPower ? undefined : data.tenant_id,
        property_id: isPower ? selectedPropertyId ?? undefined : undefined,
        amount_paise: rupeesToPaise(data.amount_rupees),
        payment_type: data.payment_type,
        payment_mode: data.payment_mode,
        for_month: isPower ? undefined : data.for_month,
        for_year: isPower ? undefined : data.for_year,
        for_days: data.for_days,
        paid_to: data.paid_to?.trim() || undefined,
        collected_at: data.collected_at,
        notes: data.notes || undefined,
      });
      toast({
        title: isPower ? 'Power recharge recorded' : 'Payment recorded',
        description: isPower
          ? `Power meter — ₹${data.amount_rupees}`
          : `${selectedTenant?.name ?? 'Tenant'} — ₹${data.amount_rupees}`,
      });
      reset();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not record payment';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {!isPower && (
          <div>
            <Label>Tenant *</Label>
            {selectedTenant ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{selectedTenant.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedTenant.room_number
                      ? `${selectedTenant.room_number}·${selectedTenant.bed_label ?? ''}`
                      : 'No room assigned'}{' '}
                    · {selectedTenant.phone}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setValue('tenant_id', '')}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Search tenant by name / phone / room..."
                    className="pl-9 h-9"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                  />
                </div>
                {tenantSearch && (
                  <div className="mt-1 max-h-44 overflow-y-auto rounded-md border bg-card">
                    {filteredTenants.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/30"
                        onClick={() => {
                          setValue('tenant_id', t.id, { shouldValidate: true });
                          setTenantSearch('');
                        }}
                      >
                        <div>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.room_number
                              ? `${t.room_number}·${t.bed_label ?? ''}`
                              : '—'}{' '}
                            · {t.phone}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {t.status}
                        </span>
                      </button>
                    ))}
                    {filteredTenants.length === 0 && (
                      <p className="px-3 py-3 text-xs text-muted-foreground">No matches.</p>
                    )}
                  </div>
                )}
              </>
            )}
            {errors.tenant_id && (
              <p className="mt-1 text-xs text-destructive">{errors.tenant_id.message}</p>
            )}
          </div>
          )}
          {isPower && (
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Property-level recharge — tenant not tracked. Counts toward the
              property's cash inflow.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type *</Label>
              <Select
                value={watch('payment_type')}
                onValueChange={(v) => setValue('payment_type', v as PaymentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RENT">Rent</SelectItem>
                  <SelectItem value="ADVANCE">Advance — Maintenance</SelectItem>
                  <SelectItem value="DEPOSIT">Advance — Security Deposit</SelectItem>
                  <SelectItem value="REFUND">Refund</SelectItem>
                  <SelectItem value="OTHER_CHARGE">Other charge</SelectItem>
                  <SelectItem value="POWER">Power-meter recharge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                step="1"
                placeholder="0"
                {...register('amount_rupees')}
              />
              {errors.amount_rupees && (
                <p className="mt-1 text-xs text-destructive">{errors.amount_rupees.message}</p>
              )}
            </div>
          </div>

          {!isPower && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Month *</Label>
              <Select
                value={String(watch('for_month'))}
                onValueChange={(v) => setValue('for_month', Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {monthName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year *</Label>
              <Input type="number" {...register('for_year')} />
            </div>
            <div>
              <Label>Days {isRent ? '*' : ''}</Label>
              <Input
                type="number"
                min={0}
                max={31}
                placeholder={isRent ? '30' : '—'}
                {...register('for_days')}
              />
            </div>
          </div>
          )}

          <div>
            <Label>Collected on *</Label>
            <Input type="date" {...register('collected_at')} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Determines which fiscal month this lands in (period is set by the
              property's close date).
            </p>
            {errors.collected_at && (
              <p className="mt-1 text-xs text-destructive">{errors.collected_at.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mode</Label>
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
              <Label>Paid to / by</Label>
              <PaidPersonSelect
                value={watch('paid_to') ?? ''}
                onChange={(v) => setValue('paid_to', v, { shouldValidate: true })}
                propertyId={selectedPropertyId ?? undefined}
                placeholder={
                  paymentType === 'REFUND'
                    ? 'Refund paid by…'
                    : isPower
                    ? 'Who collected…'
                    : 'Select collector…'
                }
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Input {...register('notes')} placeholder="e.g. Daily stay 5 days" />
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
