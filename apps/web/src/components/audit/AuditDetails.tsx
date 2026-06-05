import { formatPaise } from '@/lib/utils';
import type { AuditLogEntry, FieldChange } from '@/hooks/useAuditLogs';

/**
 * Renders the expanded detail block for an audit/activity entry:
 *  - tenant name + phone (for tenant-related rows, when `showTenant`),
 *  - the explicit login timestamp for auth logins,
 *  - the before/after diff of any changed fields (metadata.changes).
 *
 * Shared by the global Audit Logs feed and the per-tenant Timeline.
 */

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  id_type: 'ID type',
  id_number: 'ID number',
  emergency_contact_name: 'Emergency name',
  emergency_contact_phone: 'Emergency phone',
  emergency_contact_relation: 'Relation',
  occupation: 'Occupation',
  hometown: 'Hometown',
  permanent_address: 'Address',
  expected_move_out_date: 'Move-out date',
  notes: 'Notes',
  security_deposit_paise: 'Security deposit',
  advance_paid_paise: 'Refundable advance',
  non_refundable_advance_paise: 'Non-refundable advance',
  status: 'Status',
  amount_paise: 'Amount',
};

const PAISE_FIELDS = new Set([
  'security_deposit_paise',
  'advance_paid_paise',
  'non_refundable_advance_paise',
  'amount_paise',
  'budget_min_paise',
  'budget_max_paise',
]);

const labelOf = (f: string) => FIELD_LABELS[f] ?? f.replace(/_paise$/, '').replace(/_/g, ' ');

function fmtVal(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (PAISE_FIELDS.has(field) && typeof v === 'number') return formatPaise(v);
  return String(v);
}

function istFull(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** For payment_recorded / advance_recorded, which metadata keys to show
 *  in the expanded audit detail and how to label / format them. Keep the
 *  order intentional — most important first. `always: true` means the row
 *  is rendered with "—" when the value is missing (so the slot is visible
 *  and you notice when something wasn't recorded). */
const PAYMENT_ATTRS: Array<{
  key: string;
  label: string;
  paise?: boolean;
  always?: boolean;
}> = [
  { key: 'amount_paise', label: 'Amount', paise: true, always: true },
  { key: 'payment_type', label: 'Type', always: true },
  { key: 'payment_mode', label: 'Mode', always: true },
  { key: 'paid_to', label: 'Paid to / by', always: true },
  { key: 'reference_number', label: 'Reference #' },
  { key: 'upi_id', label: 'UPI id' },
  { key: 'discount_paise', label: 'Discount', paise: true },
  { key: 'for_days', label: 'For days' },
  { key: 'for_month', label: 'For month' },
  { key: 'for_year', label: 'For year' },
  { key: 'notes', label: 'Notes' },
];

const PAYMENT_EVENTS = new Set(['payment_recorded', 'advance_recorded']);

export default function AuditDetails({
  entry,
  showTenant = true,
}: {
  entry: AuditLogEntry;
  showTenant?: boolean;
}) {
  const rawChanges = (entry.metadata?.changes ?? null) as Record<string, FieldChange> | null;
  const changeEntries =
    rawChanges && typeof rawChanges === 'object' ? Object.entries(rawChanges) : [];
  const isLogin = entry.event_type === 'user_login';
  const isPayment = PAYMENT_EVENTS.has(entry.event_type);
  const hasTenant =
    showTenant && !!entry.tenant_id && Boolean(entry.tenant_name || entry.tenant_phone);

  // Payment-attribute rows we'll render. `always: true` fields show "—" when
  // the metadata is missing so the user can see at a glance what wasn't
  // captured at recording time (e.g. forgot to fill "Paid to / by").
  const paymentRows = isPayment
    ? PAYMENT_ATTRS.flatMap(({ key, label, paise, always }) => {
        const v = entry.metadata?.[key];
        const isBlank = v === null || v === undefined || v === '';
        if (isBlank && !always) return [];
        const display = isBlank
          ? '—'
          : paise && typeof v === 'number'
            ? formatPaise(v)
            : String(v);
        return [{ label, value: display }];
      })
    : [];

  if (!hasTenant && changeEntries.length === 0 && !isLogin && paymentRows.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-md border bg-muted/30 p-2.5 text-xs">
      {hasTenant && (
        <div>
          <span className="text-muted-foreground">Tenant: </span>
          <span className="font-medium text-foreground">{entry.tenant_name ?? '—'}</span>
          {entry.tenant_phone && (
            <span className="text-muted-foreground"> · {entry.tenant_phone}</span>
          )}
        </div>
      )}

      {isLogin && (
        <div className="text-muted-foreground">
          Login time:{' '}
          <span className="font-medium text-foreground">{istFull(entry.created_at)} IST</span>
        </div>
      )}

      {paymentRows.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground">Payment details:</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
            {paymentRows.map(({ label, value }) => (
              <li key={label} className="flex flex-wrap items-baseline gap-1">
                <span className="text-muted-foreground">{label}:</span>
                <span className="font-medium text-foreground">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {changeEntries.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground">Changed fields:</p>
          <ul className="space-y-1">
            {changeEntries.map(([field, ch]) => (
              <li key={field} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{labelOf(field)}:</span>
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 line-through">
                  {fmtVal(field, ch?.old)}
                </span>
                <span aria-hidden className="text-muted-foreground">→</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                  {fmtVal(field, ch?.new)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
