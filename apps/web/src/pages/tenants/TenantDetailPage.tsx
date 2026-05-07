import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  IndianRupee,
  LogOut,
  ShieldAlert,
  Pencil,
  BedDouble,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenant, useTenantLedger, useCheckout, useUpdateTenant } from '@/hooks/useTenants';
import { usePayments } from '@/hooks/usePayments';
import {
  formatPaise,
  formatDate,
  formatDatetime,
  monthName,
  statusBadgeVariant,
  shortRoomType,
} from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

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
        <div className="flex items-center gap-2">
          {isActive && (
            <Button variant="outline" onClick={() => setShowEdit(true)} className="gap-2">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {isActive && (
            <Button variant="outline" onClick={() => setShowCheckout(true)} className="gap-2">
              <LogOut className="h-4 w-4" />
              Check Out
            </Button>
          )}
        </div>
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
            {tenant.room_number && (
              <Badge variant="outline" className="gap-1">
                <BedDouble className="h-3 w-3" />
                {tenant.floor_name ? `${tenant.floor_name} · ` : ''}Room {tenant.room_number}
                {tenant.bed_label ? ` · Bed ${tenant.bed_label}` : ''}
                {tenant.room_type ? ` (${shortRoomType(tenant.room_type)})` : ''}
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
      <EditTenantDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        tenant={tenant}
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
  const [refundPaidBy, setRefundPaidBy] = useState('');
  const [notes, setNotes] = useState('');
  const { mutateAsync, isPending } = useCheckout(tenantId);
  const { toast } = useToast();

  async function submit() {
    try {
      await mutateAsync({
        actual_move_out_date: date,
        refund_amount_paise: refundRupees ? Math.round(Number(refundRupees) * 100) : 0,
        refund_paid_by: refundPaidBy.trim() || undefined,
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
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Refund Paid By</Label>
              <Input
                value={refundPaidBy}
                onChange={(e) => setRefundPaidBy(e.target.value)}
                placeholder="e.g. Mastan"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave refund details blank now and add them later from the tenant page.
          </p>
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

interface EditableTenant {
  id: string;
  name: string;
  phone: string;
  email?: string;
  id_type?: string;
  id_number?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  occupation?: string;
  hometown?: string;
  permanent_address?: string;
  expected_move_out_date?: string;
  notes?: string;
}

function EditTenantDialog({
  open,
  onClose,
  tenant,
}: {
  open: boolean;
  onClose: () => void;
  tenant: EditableTenant;
}) {
  const update = useUpdateTenant(tenant.id);
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: tenant.name,
    phone: tenant.phone,
    email: tenant.email ?? '',
    id_type: (tenant.id_type as 'AADHAR' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER') ?? 'AADHAR',
    id_number: tenant.id_number ?? '',
    emergency_contact_name: tenant.emergency_contact_name ?? '',
    emergency_contact_phone: tenant.emergency_contact_phone ?? '',
    emergency_contact_relation: tenant.emergency_contact_relation ?? '',
    occupation: tenant.occupation ?? '',
    hometown: tenant.hometown ?? '',
    permanent_address: tenant.permanent_address ?? '',
    expected_move_out_date: tenant.expected_move_out_date ?? '',
    notes: tenant.notes ?? '',
  });

  async function submit() {
    try {
      // Only send changed fields
      const payload: Record<string, string | undefined> = {};
      const orig: Record<string, string | undefined> = {
        name: tenant.name,
        phone: tenant.phone,
        email: tenant.email,
        id_type: tenant.id_type,
        id_number: tenant.id_number,
        emergency_contact_name: tenant.emergency_contact_name,
        emergency_contact_phone: tenant.emergency_contact_phone,
        emergency_contact_relation: tenant.emergency_contact_relation,
        occupation: tenant.occupation,
        hometown: tenant.hometown,
        permanent_address: tenant.permanent_address,
        expected_move_out_date: tenant.expected_move_out_date,
        notes: tenant.notes,
      };
      for (const [k, v] of Object.entries(form)) {
        if (v !== '' && v !== orig[k]) payload[k] = v;
      }
      if (Object.keys(payload).length === 0) {
        toast({ title: 'No changes' });
        onClose();
        return;
      }
      await update.mutateAsync(payload);
      toast({ title: 'Tenant updated' });
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Update failed';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit tenant</DialogTitle>
          <DialogDescription>
            Updates basic profile info. To change bed assignment or rent, check the tenant out and
            re-check in (we'll add a "move bed" flow later).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone *</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ID Type</Label>
              <Select
                value={form.id_type}
                onValueChange={(v) =>
                  setForm({ ...form, id_type: v as typeof form.id_type })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['AADHAR', 'PASSPORT', 'DRIVING_LICENSE', 'OTHER'] as const).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ID Number</Label>
              <Input
                value={form.id_number}
                onChange={(e) => setForm({ ...form, id_number: e.target.value })}
              />
            </div>
          </div>
          <hr className="my-2" />
          <p className="text-xs font-medium text-muted-foreground">Emergency contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={form.emergency_contact_name}
                onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input
                value={form.emergency_contact_phone}
                onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Relation</Label>
            <Input
              value={form.emergency_contact_relation}
              onChange={(e) => setForm({ ...form, emergency_contact_relation: e.target.value })}
            />
          </div>
          <hr className="my-2" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Occupation</Label>
              <Input
                value={form.occupation}
                onChange={(e) => setForm({ ...form, occupation: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Hometown</Label>
              <Input
                value={form.hometown}
                onChange={(e) => setForm({ ...form, hometown: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Permanent address</Label>
            <Input
              value={form.permanent_address}
              onChange={(e) => setForm({ ...form, permanent_address: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Expected move-out</Label>
            <Input
              type="date"
              value={form.expected_move_out_date}
              onChange={(e) => setForm({ ...form, expected_move_out_date: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
