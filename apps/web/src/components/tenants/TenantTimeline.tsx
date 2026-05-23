import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  LogIn,
  LogOut,
  IndianRupee,
  Wallet,
  Undo2,
  Pencil,
  FileUp,
  MessageSquareWarning,
  CircleDot,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatPaise } from '@/lib/utils';
import { useTenantTimeline, type AuditLogEntry } from '@/hooks/useAuditLogs';

interface NodeStyle {
  Icon: LucideIcon;
  dot: string; // bg + text for the node marker
}

const EVENT_STYLE: Record<string, NodeStyle> = {
  tenant_checkin: { Icon: LogIn, dot: 'bg-teal-100 text-teal-700 ring-teal-200' },
  tenant_checkout: { Icon: LogOut, dot: 'bg-red-100 text-red-700 ring-red-200' },
  payment_recorded: { Icon: IndianRupee, dot: 'bg-teal-100 text-teal-700 ring-teal-200' },
  advance_recorded: { Icon: Wallet, dot: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  refund_issued: { Icon: Undo2, dot: 'bg-orange-100 text-orange-700 ring-orange-200' },
  tenant_profile_updated: { Icon: Pencil, dot: 'bg-blue-100 text-blue-700 ring-blue-200' },
  tenant_id_uploaded: { Icon: FileUp, dot: 'bg-slate-100 text-slate-600 ring-slate-200' },
  complaint_updated: { Icon: MessageSquareWarning, dot: 'bg-red-100 text-red-700 ring-red-200' },
};

const FALLBACK: NodeStyle = { Icon: CircleDot, dot: 'bg-slate-100 text-slate-500 ring-slate-200' };

function istFull(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

export default function TenantTimeline({ tenantId }: { tenantId: string }) {
  const { data: events, isLoading } = useTenantTimeline(tenantId);

  const summary = useMemo(() => {
    if (!events || events.length === 0) return null;
    // API returns newest-first; the oldest event is the start of the record.
    const oldest = events[events.length - 1];
    const checkin = [...events].reverse().find((e) => e.event_type === 'tenant_checkin');
    const checkout = events.find((e) => e.event_type === 'tenant_checkout');
    const since = checkin?.created_at ?? oldest.created_at;

    const payEvents = events.filter(
      (e) => e.event_type === 'payment_recorded' || e.event_type === 'advance_recorded',
    );
    const collectedPaise = payEvents.reduce((sum, e) => sum + num(e.metadata.amount_paise), 0);

    const end = checkout ? new Date(checkout.created_at) : new Date();
    const months = Math.max(
      1,
      Math.round((end.getTime() - new Date(since).getTime()) / (1000 * 60 * 60 * 24 * 30)),
    );

    return {
      since,
      months,
      isActive: !checkout,
      paymentCount: payEvents.length,
      collectedPaise,
    };
  }, [events]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        No recorded activity for this tenant yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact summary header */}
      {summary && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">
            Tenant since {new Date(summary.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span className="text-muted-foreground">
            {' · '}
            {summary.months} {summary.months === 1 ? 'month' : 'months'}
            {' · '}
            {summary.paymentCount} {summary.paymentCount === 1 ? 'payment' : 'payments'}
            {' · '}
            {formatPaise(summary.collectedPaise)} collected
          </span>
        </div>
      )}

      {/* Vertical timeline */}
      <ol className="relative space-y-5 border-l border-border pl-6">
        {events.map((e) => (
          <TimelineNode key={e.id} entry={e} />
        ))}

        {/* Terminal marker */}
        {summary?.isActive ? (
          <li className="relative">
            <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full bg-accent ring-4 ring-accent/20">
              <CheckCircle2 className="h-3 w-3 text-accent-foreground" />
            </span>
            <p className="text-xs font-medium text-accent">Active tenant</p>
          </li>
        ) : (
          <li className="relative">
            <span className="absolute -left-[31px] h-5 w-5 rounded-full bg-red-500 ring-4 ring-red-100" />
            <p className="text-xs font-medium text-muted-foreground">Tenancy ended</p>
          </li>
        )}
      </ol>
    </div>
  );
}

function TimelineNode({ entry }: { entry: AuditLogEntry }) {
  const style = EVENT_STYLE[entry.event_type] ?? FALLBACK;
  const { Icon } = style;
  const amount = num(entry.metadata.amount_paise);

  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background',
          style.dot,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="rounded-lg border bg-card px-3 py-2">
        <p className="text-sm font-medium leading-snug">{entry.description}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span title={istFull(entry.created_at)} className="cursor-default">
            {istFull(entry.created_at)}
          </span>
          <span aria-hidden>·</span>
          <span>{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}</span>
          {amount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-foreground tabular-nums">{formatPaise(amount)}</span>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
