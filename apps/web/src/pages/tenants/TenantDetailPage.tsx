import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  IndianRupee,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant, useTenantLedger, useCheckout } from '@/hooks/useTenants';
import { usePayments } from '@/hooks/usePayments';
import {
  formatPaise,
  formatDate,
  formatDatetime,
  monthName,
  statusBadgeVariant,
} from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showCheckout, setShowCheckout] = useState(false);

  const { data: tenant, isLoading } = useTenant(id!);
  const { data: ledger } = useTenantLedger(id!);
  const { data: paymentsData } = usePayments({ tenant_id: id });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-40 rounded-lg bg-muted" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="py-16 text-center text-muted-foreground">Tenant not found.</div>
    );
  }

  const isActive = tenant.status === 'ACTIVE' || tenant.is_active;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
            <p className="text-sm text-muted-foreground">Tenant Details</p>
          </div>
        </div>
        {isActive && (
          <Button variant="outline" onClick={() => setShowCheckout(true)} className="gap-2">
            <LogOut className="h-4 w-4" />
            Check Out
          </Button>
        )}
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{tenant.phone}</span>
            </div>
            {tenant.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{tenant.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Moved in {formatDate(tenant.move_in_date)}</span>
            </div>
            {tenant.monthly_rent_paise !== undefined && (
              <div className="flex items-center gap-2 text-sm">
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
                <span>{formatPaise(tenant.monthly_rent_paise)}/month</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : tenant.status ?? 'Checked Out'}
            </Badge>
            {tenant.id_type && (
              <Badge variant="outline" className="gap-1">
                <ShieldAlert className="h-3 w-3" /> {tenant.id_type}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Rent Ledger</TabsTrigger>
          <TabsTrigger value="payments">
            Payments ({paymentsData?.items.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="mt-4">
          {ledger?.entries?.length ? (
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Period
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Due
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Paid
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Outstanding
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ledger.entries.map(
                    (e: {
                      id: string;
                      month: number;
                      year: number;
                      amount_due_paise: number;
                      amount_paid_paise: number;
                      outstanding_paise: number;
                      status: string;
                    }) => (
                      <tr key={e.id}>
                        <td className="px-4 py-3 font-medium">
                          {monthName(e.month)} {e.year}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatPaise(e.amount_due_paise)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
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
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground text-sm">
              No ledger entries yet. Generate the monthly ledger from the Rent &amp; Payments page.
            </div>
          )}

          {ledger && (
            <div className="mt-3 text-sm text-right text-muted-foreground">
              Total outstanding:{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {formatPaise(ledger.total_due_paise ?? 0)}
              </span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {paymentsData && paymentsData.items.length > 0 ? (
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      For
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Mode
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paymentsData.items.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDatetime(p.collected_at)}
                      </td>
                      <td className="px-4 py-3">
                        {p.for_month && p.for_year ? (
                          <span>
                            {monthName(p.for_month)} {p.for_year}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {p.payment_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.payment_mode}
                        {p.reference_number ? ` · ${p.reference_number}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatPaise(p.amount_paise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground text-sm">
              No payments recorded yet.
            </div>
          )}
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="pt-6 grid gap-4 sm:grid-cols-2 text-sm">
              {tenant.emergency_contact_name && (
                <Field
                  label="Emergency contact"
                  value={`${tenant.emergency_contact_name} (${tenant.emergency_contact_relation})`}
                />
              )}
              {tenant.emergency_contact_phone && (
                <Field label="Emergency phone" value={tenant.emergency_contact_phone} />
              )}
              {tenant.id_number && <Field label="ID number" value={tenant.id_number} />}
              {tenant.occupation && <Field label="Occupation" value={tenant.occupation} />}
              {tenant.hometown && <Field label="Hometown" value={tenant.hometown} />}
              {tenant.expected_move_out_date && (
                <Field
                  label="Expected move-out"
                  value={formatDate(tenant.expected_move_out_date)}
                />
              )}
              {tenant.permanent_address && (
                <Field
                  label="Permanent address"
                  value={tenant.permanent_address}
                  className="sm:col-span-2"
                />
              )}
              {tenant.notes && (
                <Field label="Notes" value={tenant.notes} className="sm:col-span-2" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CheckoutDialog
        open={showCheckout}
        onClose={() => setShowCheckout(false)}
        tenantId={tenant.id}
        tenantName={tenant.name}
      />
    </div>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function CheckoutDialog({
  open,
  onClose,
  tenantId,
  tenantName,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundRupees, setRefundRupees] = useState('');
  const [notes, setNotes] = useState('');
  const { mutateAsync, isPending } = useCheckout(tenantId);
  const { toast } = useToast();

  async function submit() {
    try {
      await mutateAsync({
        actual_move_out_date: date,
        refund_amount_paise: refundRupees ? Math.round(Number(refundRupees) * 100) : 0,
        notes: notes || undefined,
      });
      toast({ title: 'Tenant checked out', description: `${tenantName} checkout recorded.` });
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to check out tenant.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check out {tenantName}</DialogTitle>
          <DialogDescription>
            This frees the bed and finalises the tenant's stay. Settle dues separately on the rent
            page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Move-out date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Refund deposit (₹)</Label>
            <Input
              type="number"
              value={refundRupees}
              onChange={(e) => setRefundRupees(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for checkout / handover info"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? 'Saving...' : 'Confirm Checkout'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
