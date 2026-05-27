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
  const hasTenant =
    showTenant && !!entry.tenant_id && Boolean(entry.tenant_name || entry.tenant_phone);

  if (!hasTenant && changeEntries.length === 0 && !isLogin) return null;

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
