import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  CalendarClock,
  IndianRupee,
  LogOut,
  ShieldAlert,
  Pencil,
  BedDouble,
  Undo2,
  Wallet,
  FileUp,
  FileText,
  Image as ImageIcon,
  Eye,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TenantMessagesThread from './TenantMessagesThread';
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
import {
  useTenant,
  useTenantLedger,
  useCheckout,
  useRecheckin,
  useGiveNotice,
  useUpdateTenant,
  useRecordRefund,
  useUploadIdProof,
  useDeleteIdProof,
  type RecheckinPayload,
  type NoticePayload,
} from '@/hooks/useTenants';
import { useVacantBeds } from '@/hooks/useTenants';
import { api } from '@/lib/api';
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
import TenantTimeline from '@/components/tenants/TenantTimeline';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showDepositEdit, setShowDepositEdit] = useState(false);
  const [showRecheckin, setShowRecheckin] = useState(false);
  const [showNotice, setShowNotice] = useState(false);

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
          <Button variant="outline" onClick={() => setShowEdit(true)} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {isActive && (
            <Button variant="outline" onClick={() => setShowNotice(true)} className="gap-2">
              <CalendarClock className="h-4 w-4" />
              {tenant.notice_given_date ? 'Edit notice' : 'Give notice'}
            </Button>
          )}
          {isActive && (
            <Button variant="outline" onClick={() => setShowCheckout(true)} className="gap-2">
              <LogOut className="h-4 w-4" />
              Check Out
            </Button>
          )}
          {!isActive && (
            <Button variant="outline" onClick={() => setShowRecheckin(true)} className="gap-2">
              <BedDouble className="h-4 w-4" />
              Re-check in
            </Button>
          )}
          {!isActive && (
            <Button onClick={() => setShowRefund(true)} className="gap-2">
              <Undo2 className="h-4 w-4" />
              Record refund
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

          {isActive && tenant.notice_given_date && tenant.expected_move_out_date && (
            <NoticeBanner
              noticeGivenDate={tenant.notice_given_date}
              vacateDate={tenant.expected_move_out_date}
              onEdit={() => setShowNotice(true)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-accent" />
              <h2 className="text-base font-semibold">Deposit &amp; Advance</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-8"
              onClick={() => setShowDepositEdit(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {tenant.active_rent_plan
                ? 'Edit deposit & advance'
                : 'Add deposit & advance'}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Security deposit"
              value={formatPaise(tenant.active_rent_plan?.security_deposit_paise ?? 0)}
            />
            <Field
              label="Refundable advance"
              value={formatPaise(tenant.active_rent_plan?.advance_paid_paise ?? 0)}
            />
            <Field
              label="Non-refundable advance"
              value={formatPaise(
                tenant.active_rent_plan?.non_refundable_advance_paise ?? 0,
              )}
            />
            {!isActive ? (
              <Field
                label="Refunded so far"
                value={formatPaise(tenant.refunded_paise ?? 0)}
              />
            ) : (
              <Field
                label="Total held (refundable)"
                value={formatPaise(
                  (tenant.active_rent_plan?.security_deposit_paise ?? 0) +
                    (tenant.active_rent_plan?.advance_paid_paise ?? 0),
                )}
              />
            )}
          </div>
          {!isActive && (
            <p className="mt-3 text-xs text-muted-foreground">
              Use <strong>Record refund</strong> above to log the deposit refund (multiple
              entries are fine if you split it across days or modes). Each entry shows up in
              the Payments tab as a REFUND.
            </p>
          )}
        </CardContent>
      </Card>

      <IdProofCard
        tenantId={tenant.id}
        idProofPath={tenant.id_proof_path ?? null}
      />

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Rent Ledger</TabsTrigger>
          <TabsTrigger value="payments">
            Payments ({paymentsData?.items.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Paid to
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
                      <td className="px-4 py-3">
                        {p.paid_to ? (
                          <Badge variant="outline" className="text-[10px]">
                            {p.paid_to}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
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

        <TabsContent value="messages" className="mt-4">
          <TenantMessagesThread tenantId={tenant.id} tenantName={tenant.name} />
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
              {tenant.vehicle_type && tenant.vehicle_type !== 'NONE' && (
                <Field
                  label="Vehicle"
                  value={`${
                    tenant.vehicle_type === 'TWO_WHEELER'
                      ? 'Two-wheeler'
                      : 'Four-wheeler'
                  } · ${tenant.vehicle_registration ?? '—'}`}
                />
              )}
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

        <TabsContent value="timeline" className="mt-4">
          <TenantTimeline tenantId={tenant.id} />
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
      <RefundDialog
        open={showRefund}
        onClose={() => setShowRefund(false)}
        tenantId={tenant.id}
        tenantName={tenant.name}
      />
      <DepositAdvanceDialog
        open={showDepositEdit}
        onClose={() => setShowDepositEdit(false)}
        tenantId={tenant.id}
        tenantName={tenant.name}
        current={tenant.active_rent_plan ?? null}
      />
      <RecheckinDialog
        open={showRecheckin}
        onClose={() => setShowRecheckin(false)}
        tenantId={tenant.id}
        tenantName={tenant.name}
        previousPropertyId={tenant.property_id}
        previousRent={tenant.active_rent_plan ?? null}
      />
      <NoticeDialog
        open={showNotice}
        onClose={() => setShowNotice(false)}
        tenantId={tenant.id}
        tenantName={tenant.name}
        existingNoticeDate={tenant.notice_given_date ?? null}
        existingVacateDate={tenant.expected_move_out_date ?? null}
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

function RefundDialog({
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
  const [amountRupees, setAmountRupees] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [mode, setMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE'>(
    'CASH',
  );
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const { mutateAsync, isPending } = useRecordRefund(tenantId);
  const { toast } = useToast();

  async function submit() {
    const amt = Number(amountRupees);
    if (!amt || amt <= 0) {
      toast({ title: 'Enter a refund amount', variant: 'destructive' });
      return;
    }
    try {
      await mutateAsync({
        refund_date: date,
        refund_amount_paise: Math.round(amt * 100),
        refund_paid_by: paidBy.trim() || undefined,
        payment_mode: mode,
        reference_number: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast({
        title: 'Refund recorded',
        description: `₹${amt.toLocaleString('en-IN')} refunded to ${tenantName}.`,
      });
      setAmountRupees('');
      setPaidBy('');
      setReference('');
      setNotes('');
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message ?? 'Failed to record refund.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record refund — {tenantName}</DialogTitle>
          <DialogDescription>
            Logs a REFUND payment row. You can record multiple refunds (e.g. cash now, UPI
            later) and they'll add up in the Payments tab.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Refund date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Paid by</Label>
              <Input
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                placeholder="e.g. Mastan"
              />
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'] as const).map(
                    (m) => (
                      <SelectItem key={m} value={m}>
                        {m.replace(/_/g, ' ')}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Reference / UTR</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason / handover info"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DepositAdvanceDialog({
  open,
  onClose,
  tenantId,
  tenantName,
  current,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  current: {
    security_deposit_paise?: number;
    advance_paid_paise?: number;
    non_refundable_advance_paise?: number;
  } | null;
}) {
  const update = useUpdateTenant(tenantId);
  const { toast } = useToast();
  const toRupees = (paise: number | undefined) =>
    paise != null && paise !== 0 ? String(paise / 100) : '';
  const [deposit, setDeposit] = useState(toRupees(current?.security_deposit_paise));
  const [refundable, setRefundable] = useState(toRupees(current?.advance_paid_paise));
  const [nonRefundable, setNonRefundable] = useState(
    toRupees(current?.non_refundable_advance_paise),
  );

  // Reset to current values whenever the dialog is reopened
  useEffect(() => {
    if (open) {
      setDeposit(toRupees(current?.security_deposit_paise));
      setRefundable(toRupees(current?.advance_paid_paise));
      setNonRefundable(toRupees(current?.non_refundable_advance_paise));
    }
  }, [
    open,
    current?.security_deposit_paise,
    current?.advance_paid_paise,
    current?.non_refundable_advance_paise,
  ]);

  async function submit() {
    try {
      const payload: Record<string, number> = {};
      const origDeposit = toRupees(current?.security_deposit_paise);
      const origRefundable = toRupees(current?.advance_paid_paise);
      const origNonRefundable = toRupees(current?.non_refundable_advance_paise);
      if (deposit !== origDeposit) {
        payload.security_deposit_paise = Math.round(Number(deposit || 0) * 100);
      }
      if (refundable !== origRefundable) {
        payload.advance_paid_paise = Math.round(Number(refundable || 0) * 100);
      }
      if (nonRefundable !== origNonRefundable) {
        payload.non_refundable_advance_paise = Math.round(
          Number(nonRefundable || 0) * 100,
        );
      }
      if (Object.keys(payload).length === 0) {
        toast({ title: 'No changes' });
        onClose();
        return;
      }
      await update.mutateAsync(payload);
      toast({ title: 'Deposit & advance saved' });
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message ?? 'Update failed';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deposit &amp; advance — {tenantName}</DialogTitle>
          <DialogDescription>
            Refundable amounts are returned (less dues) at checkout. Non-refundable
            advance is a one-time joining/maintenance fee that the PG keeps.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Security deposit (₹)</Label>
            <Input
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="0"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Refundable. Held against damage / dues.
            </p>
          </div>
          <div>
            <Label>Refundable advance (₹)</Label>
            <Input
              type="number"
              value={refundable}
              onChange={(e) => setRefundable(e.target.value)}
              placeholder="0"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Refundable. Adjusted at checkout against any unpaid rent.
            </p>
          </div>
          <div>
            <Label>Non-refundable advance (₹)</Label>
            <Input
              type="number"
              value={nonRefundable}
              onChange={(e) => setNonRefundable(e.target.value)}
              placeholder="0"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Joining fee / one-time charge. Not returned at checkout.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IdProofCard({
  tenantId,
  idProofPath,
}: {
  tenantId: string;
  idProofPath: string | null;
}) {
  const upload = useUploadIdProof();
  const del = useDeleteIdProof(tenantId);
  const { toast } = useToast();
  const [showViewer, setShowViewer] = useState(false);

  const isPdf = !!idProofPath && idProofPath.toLowerCase().endsWith('.pdf');

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      await upload.mutateAsync({ id: tenantId, file: f });
      toast({ title: idProofPath ? 'ID proof replaced' : 'ID proof uploaded' });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response
          ?.data?.error?.message ?? 'Could not upload ID proof';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  async function onRemove() {
    if (!window.confirm('Remove the ID proof?')) return;
    try {
      await del.mutateAsync();
      toast({ title: 'ID proof removed' });
    } catch {
      toast({ title: 'Failed', variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {isPdf ? (
              <FileText className="h-4 w-4 text-accent" />
            ) : (
              <ImageIcon className="h-4 w-4 text-accent" />
            )}
            <div>
              <p className="font-medium text-sm">ID proof</p>
              <p className="text-xs text-muted-foreground">
                {idProofPath
                  ? `Aadhar / address proof on file (${isPdf ? 'PDF' : 'image'})`
                  : 'No file attached yet'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {idProofPath && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setShowViewer(true)}
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </Button>
            )}
            <label
              htmlFor="tenant-id-proof-input"
              className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent/10 cursor-pointer"
            >
              <FileUp className="h-3.5 w-3.5" />
              {idProofPath ? 'Replace' : 'Upload'}
              <input
                id="tenant-id-proof-input"
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={onPick}
              />
            </label>
            {idProofPath && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-2 text-destructive"
                onClick={onRemove}
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
      <IdProofViewer
        tenantId={showViewer ? tenantId : null}
        isPdf={isPdf}
        onClose={() => setShowViewer(false)}
      />
    </Card>
  );
}

function IdProofViewer({
  tenantId,
  isPdf,
  onClose,
}: {
  tenantId: string | null;
  isPdf: boolean;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let blob: string | null = null;
    (async () => {
      try {
        const resp = await api.get(`/tenants/${tenantId}/id-proof`, {
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
  }, [tenantId]);

  return (
    <Dialog open={!!tenantId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>ID proof</DialogTitle>
        </DialogHeader>
        {src ? (
          isPdf ? (
            <iframe src={src} title="id-proof" className="h-[75vh] w-full rounded border" />
          ) : (
            <img
              src={src}
              alt="id-proof"
              className="mx-auto max-h-[75vh] w-auto rounded border"
            />
          )
        ) : (
          <p className="text-center text-sm text-muted-foreground py-8">
            No ID proof available.
          </p>
        )}
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
  vehicle_type?: 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER';
  vehicle_registration?: string;
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
    vehicle_type: (tenant.vehicle_type ?? 'NONE') as 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER',
    vehicle_registration: tenant.vehicle_registration ?? '',
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
        vehicle_type: tenant.vehicle_type,
        vehicle_registration: tenant.vehicle_registration,
        expected_move_out_date: tenant.expected_move_out_date,
        notes: tenant.notes,
      };
      for (const [k, v] of Object.entries(form)) {
        if (v !== '' && v !== orig[k]) payload[k] = v;
      }
      // Switching to NONE explicitly clears the plate so the row doesn't
      // keep a stale reading.
      if (form.vehicle_type === 'NONE' && tenant.vehicle_registration) {
        payload.vehicle_registration = undefined;
        payload.vehicle_type = 'NONE';
      }
      // Refuse to ship "TWO_WHEELER + blank plate" combos client-side.
      if (form.vehicle_type !== 'NONE' && !form.vehicle_registration.trim()) {
        toast({
          title: 'Registration required',
          description: 'Enter the vehicle registration number.',
          variant: 'destructive',
        });
        return;
      }
      if (payload.vehicle_registration) {
        payload.vehicle_registration = payload.vehicle_registration.trim().toUpperCase();
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
          <hr className="my-2" />
          <p className="text-xs font-medium text-muted-foreground">Vehicle (for gate security)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select
                value={form.vehicle_type}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    vehicle_type: v as 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER',
                    // Clear plate immediately on switch-to-none so the user
                    // sees the UI reflect the eventual server state.
                    vehicle_registration: v === 'NONE' ? '' : form.vehicle_registration,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No vehicle</SelectItem>
                  <SelectItem value="TWO_WHEELER">Two-wheeler</SelectItem>
                  <SelectItem value="FOUR_WHEELER">Four-wheeler</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.vehicle_type !== 'NONE' && (
              <div>
                <Label className="text-xs">Registration number</Label>
                <Input
                  value={form.vehicle_registration}
                  onChange={(e) =>
                    setForm({ ...form, vehicle_registration: e.target.value })
                  }
                  placeholder="KA 01 AB 1234"
                  autoCapitalize="characters"
                  className="uppercase"
                />
              </div>
            )}
          </div>
          <hr className="my-2" />
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

function RecheckinDialog({
  open,
  onClose,
  tenantId,
  tenantName,
  previousPropertyId,
  previousRent,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  previousPropertyId?: string;
  previousRent: {
    monthly_rent_paise?: number;
    security_deposit_paise?: number;
    advance_paid_paise?: number;
    non_refundable_advance_paise?: number;
    food_included?: boolean;
    food_charges_paise?: number;
    billing_day?: number;
  } | null;
}) {
  // Suggest the same property the tenant left from. Owner can still pick a
  // different bed in the same property; we don't show a property-switcher
  // here yet — cross-property rejoin is rare and can be done later if needed.
  // Only fetch vacant beds when the dialog is open — we leave the hook itself
  // gated on propertyId; passing undefined when closed kills the request.
  const { data: vacantData } = useVacantBeds(open ? previousPropertyId : undefined);
  const vacantBeds = vacantData?.items?.filter((b) => b.status !== 'UPCOMING') ?? [];

  const todayISO = new Date().toISOString().slice(0, 10);
  const [bedId, setBedId] = useState('');
  const [moveInDate, setMoveInDate] = useState(todayISO);
  const [expectedMoveOut, setExpectedMoveOut] = useState('');
  // Carry over the tenant's previous rent terms by default — owner can override.
  const [monthlyRent, setMonthlyRent] = useState(
    previousRent?.monthly_rent_paise ? String(previousRent.monthly_rent_paise / 100) : '',
  );
  const [deposit, setDeposit] = useState(
    previousRent?.security_deposit_paise ? String(previousRent.security_deposit_paise / 100) : '',
  );
  const [advance, setAdvance] = useState(
    previousRent?.advance_paid_paise ? String(previousRent.advance_paid_paise / 100) : '0',
  );
  const [billingDay, setBillingDay] = useState(String(previousRent?.billing_day ?? 1));

  // Reset form when re-opened.
  useEffect(() => {
    if (open) {
      setBedId('');
      setMoveInDate(todayISO);
      setExpectedMoveOut('');
      setMonthlyRent(
        previousRent?.monthly_rent_paise ? String(previousRent.monthly_rent_paise / 100) : '',
      );
      setDeposit(
        previousRent?.security_deposit_paise ? String(previousRent.security_deposit_paise / 100) : '',
      );
      setAdvance(
        previousRent?.advance_paid_paise ? String(previousRent.advance_paid_paise / 100) : '0',
      );
      setBillingDay(String(previousRent?.billing_day ?? 1));
    }
  }, [open, previousRent, todayISO]);

  const { mutateAsync, isPending } = useRecheckin(tenantId);
  const { toast } = useToast();
  const navigate = useNavigate();

  async function onSubmit() {
    if (!bedId) {
      toast({ title: 'Pick a bed', variant: 'destructive' });
      return;
    }
    const rentNum = Number(monthlyRent);
    if (!Number.isFinite(rentNum) || rentNum <= 0) {
      toast({ title: 'Enter monthly rent', variant: 'destructive' });
      return;
    }
    const payload: RecheckinPayload = {
      bed_id: bedId,
      move_in_date: moveInDate,
      expected_move_out_date: expectedMoveOut || undefined,
      rent_plan: {
        monthly_rent_paise: Math.round(rentNum * 100),
        security_deposit_paise: Math.round((Number(deposit) || 0) * 100),
        advance_paid_paise: Math.round((Number(advance) || 0) * 100),
        non_refundable_advance_paise: previousRent?.non_refundable_advance_paise ?? 0,
        food_included: previousRent?.food_included ?? false,
        food_charges_paise: previousRent?.food_charges_paise ?? 0,
        billing_day: Number(billingDay) || 1,
        effective_from: moveInDate,
      },
    };
    try {
      await mutateAsync(payload);
      toast({ title: 'Re-checked in', description: `${tenantName} is back as ACTIVE.` });
      onClose();
      // The tenant page reloads fine on its own thanks to query invalidation;
      // a refresh just shortens the perceived delay.
      navigate(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to re-check in';
      toast({ title: 'Could not re-check in', description: msg, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-check in {tenantName}</DialogTitle>
          <DialogDescription>
            Keeps the tenant's history (past payments, ledger, audit). Assigns a
            new bed and starts a fresh rent plan from the move-in date below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Bed</Label>
            <Select value={bedId} onValueChange={setBedId}>
              <SelectTrigger>
                <SelectValue placeholder={vacantBeds.length ? 'Choose a vacant bed' : 'No vacant beds'} />
              </SelectTrigger>
              <SelectContent>
                {vacantBeds.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.floor_name} · Room {b.room_number} · Bed {b.bed_label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Move-in date</Label>
              <Input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
            </div>
            <div>
              <Label>Expected move-out (optional)</Label>
              <Input
                type="date"
                value={expectedMoveOut}
                onChange={(e) => setExpectedMoveOut(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monthly rent (₹)</Label>
              <Input
                inputMode="numeric"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                placeholder="9000"
              />
            </div>
            <div>
              <Label>Billing day</Label>
              <Input
                inputMode="numeric"
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <Label>Security deposit (₹)</Label>
              <Input
                inputMode="numeric"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="4500"
              />
            </div>
            <div>
              <Label>Refundable advance (₹)</Label>
              <Input
                inputMode="numeric"
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? 'Re-checking in…' : 'Confirm re-check in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoticeBanner({
  noticeGivenDate,
  vacateDate,
  onEdit,
}: {
  noticeGivenDate: string;
  vacateDate: string;
  onEdit: () => void;
}) {
  // Days from now → vacate. Negative → already past (rare; just shown for safety).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const vacate = new Date(vacateDate);
  const daysToVacate = Math.round((vacate.getTime() - today.getTime()) / 86400000);
  const noticeWindow = Math.round(
    (vacate.getTime() - new Date(noticeGivenDate).getTime()) / 86400000,
  );
  const relative =
    daysToVacate < 0
      ? `${-daysToVacate}d overdue`
      : daysToVacate === 0
        ? 'today'
        : daysToVacate === 1
          ? 'tomorrow'
          : `in ${daysToVacate} days`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm">
      <CalendarClock className="h-4 w-4 text-amber-700 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-amber-900">
          Notice to vacate · leaving {relative} ({formatDate(vacateDate)})
        </div>
        <div className="text-xs text-amber-800/80">
          Notice given on {formatDate(noticeGivenDate)} · {noticeWindow}-day notice window
        </div>
      </div>
      <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={onEdit}>
        Edit notice
      </Button>
    </div>
  );
}

function NoticeDialog({
  open,
  onClose,
  tenantId,
  tenantName,
  existingNoticeDate,
  existingVacateDate,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  existingNoticeDate: string | null;
  existingVacateDate: string | null;
}) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [vacateDate, setVacateDate] = useState(existingVacateDate ?? '');
  const [noticeDate, setNoticeDate] = useState(existingNoticeDate ?? todayISO);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setVacateDate(existingVacateDate ?? '');
      setNoticeDate(existingNoticeDate ?? todayISO);
      setNotes('');
    }
  }, [open, existingNoticeDate, existingVacateDate, todayISO]);

  const { mutateAsync, isPending } = useGiveNotice(tenantId);
  const { toast } = useToast();

  async function onSubmit() {
    if (!vacateDate) {
      toast({ title: 'Pick the vacate date', variant: 'destructive' });
      return;
    }
    const payload: NoticePayload = {
      expected_move_out_date: vacateDate,
      notice_given_date: noticeDate || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      await mutateAsync(payload);
      toast({
        title: 'Notice recorded',
        description: `${tenantName} vacating on ${vacateDate}.`,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record notice';
      toast({ title: 'Could not record notice', description: msg, variant: 'destructive' });
    }
  }

  async function onClear() {
    try {
      // expected_move_out_date=null → backend clears both fields.
      await mutateAsync({ expected_move_out_date: null });
      toast({
        title: 'Notice cleared',
        description: `${tenantName}'s notice removed.`,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear notice';
      toast({ title: 'Could not clear notice', description: msg, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existingVacateDate ? 'Edit notice to vacate' : 'Record notice to vacate'}
          </DialogTitle>
          <DialogDescription>
            Capture when {tenantName} told us they're leaving. The bed will appear under the
            property's <em>Upcoming vacancies</em> automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Notice given on</Label>
            <Input
              type="date"
              value={noticeDate}
              onChange={(e) => setNoticeDate(e.target.value)}
              max={todayISO}
            />
          </div>
          <div>
            <Label>Vacating on</Label>
            <Input
              type="date"
              value={vacateDate}
              onChange={(e) => setVacateDate(e.target.value)}
              min={todayISO}
            />
          </div>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Input
            placeholder="Reason / handover info"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {existingVacateDate && (
            <Button
              variant="outline"
              onClick={onClear}
              disabled={isPending}
              className="mr-auto text-rose-700"
            >
              Clear notice
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save notice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
