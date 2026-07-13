import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Send,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Mail,
  CheckCheck,
  Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useNotifications,
  type NotificationEntry,
  type NotificationFilters,
} from '@/hooks/useNotifications';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MessageCircle } from 'lucide-react';

const STATUS_META: Record<
  NotificationEntry['status'],
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  SENT: { label: 'Sent', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  FAILED: { label: 'Failed', cls: 'bg-red-100 text-red-700', Icon: XCircle },
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-700', Icon: Clock },
};

// Meta delivery receipt (sent → delivered → read, or failed).
const DELIVERY_META: Record<string, { label: string; cls: string; Icon: typeof Check }> = {
  sent: { label: 'Sent', cls: 'text-muted-foreground', Icon: Check },
  delivered: { label: 'Delivered', cls: 'text-emerald-600', Icon: CheckCheck },
  read: { label: 'Read', cls: 'text-teal-600', Icon: CheckCheck },
  failed: { label: 'Failed', cls: 'text-red-600', Icon: XCircle },
};

function channelIcon(channel: NotificationEntry['channel']) {
  if (channel === 'WHATSAPP') return MessageSquare;
  if (channel === 'EMAIL') return Mail;
  return Send;
}

function fmt(ts: string | null): string {
  return ts ? format(new Date(ts), 'd MMM yyyy, HH:mm') : '—';
}

const PAGE_SIZE = 50;

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function MessageLogPage() {
  const [status, setStatus] = useState<string>('all');
  const [channel, setChannel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<NotificationEntry | null>(null);

  // Outbound-only list — inbound replies are surfaced as a "Replied" chip on
  // the outbound row they most likely responded to, and rendered inline via
  // hover / in the detail dialog.
  const filters: NotificationFilters = {
    page,
    page_size: PAGE_SIZE,
    direction: 'outbound',
    status: status === 'all' ? undefined : status,
    channel: channel === 'all' ? undefined : channel,
    search: search.trim() || undefined,
  };

  const { data, isLoading, isError } = useNotifications(filters);
  const items = data?.items ?? [];

  // Pull the inbound side once for the same window so we can attach replies
  // to their outbound. Bounded by page_size like the outbound query.
  const { data: inboundData } = useNotifications({
    direction: 'inbound',
    channel: channel === 'all' ? undefined : channel,
    page_size: PAGE_SIZE,
    page: 1,
  });
  const inbound = inboundData?.items ?? [];

  /**
   * For a given outbound row, find inbound messages from the same tenant that
   * arrived AFTER this outbound went out and BEFORE the next outbound to
   * that tenant landed (WhatsApp session-window logic — the reply almost
   * certainly belongs to the most recent outbound before it).
   */
  function repliesFor(row: NotificationEntry): NotificationEntry[] {
    if (!row.recipient_id) return [];
    const sentAt = new Date(row.sent_at ?? row.created_at ?? 0).getTime();
    const laterOutboundsSameTenant = items
      .filter((o) => o.recipient_id === row.recipient_id && o.id !== row.id)
      .map((o) => new Date(o.sent_at ?? o.created_at ?? 0).getTime())
      .filter((t) => t > sentAt);
    const cutoff = laterOutboundsSameTenant.length
      ? Math.min(...laterOutboundsSameTenant)
      : Infinity;
    return inbound
      .filter((r) => r.recipient_id === row.recipient_id)
      .filter((r) => {
        const t = new Date(r.sent_at ?? r.created_at ?? 0).getTime();
        return t > sentAt && t < cutoff;
      })
      .sort(
        (a, b) =>
          new Date(a.sent_at ?? a.created_at ?? 0).getTime() -
          new Date(b.sent_at ?? b.created_at ?? 0).getTime(),
      );
  }

  return (
    <TooltipProvider delayDuration={150}>
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Message Log</h1>
          <p className="text-sm text-muted-foreground">
            Every WhatsApp &amp; email the app sent. Hover a name for the message body;
            a green <span className="font-medium text-emerald-700">Replied</span> chip means the tenant wrote back.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or phone…"
            className="pl-8"
          />
        </div>
        <Select value={channel} onValueChange={(v) => { setChannel(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            <SelectItem value="EMAIL">Email</SelectItem>
            <SelectItem value="PUSH">Push</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Column header */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="w-12 shrink-0">Room</span>
          <span className="min-w-0 flex-1">Recipient</span>
          <span className="hidden w-28 shrink-0 sm:block">Sent</span>
          <span className="w-20 shrink-0 text-right">Status</span>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-destructive">Couldn't load the message log.</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Send className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No messages yet</p>
          <p className="text-xs text-muted-foreground">
            Sends appear here once the app or the rent scheduler dispatches them.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((n) => {
            const s = STATUS_META[n.status];
            const ChannelIcon = channelIcon(n.channel);
            const delivery = n.delivery_status ? DELIVERY_META[n.delivery_status] : null;
            const to = n.recipient_phone || n.tenant_phone;
            const who = n.tenant_name || to || n.recipient_type;
            const replies = repliesFor(n);
            return (
              <div
                key={n.id}
                className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <button
                  type="button"
                  onClick={() => setSelected(n)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="w-12 shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {n.room_number || '—'}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <ChannelIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate">{who}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Sent · {n.template_name || '—'}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm">
                          {n.rendered_message || n.message_body || '(no body)'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </button>

                {replies.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex cursor-help items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(n);
                        }}
                      >
                        <MessageCircle className="h-3 w-3" />
                        Replied{replies.length > 1 ? ` (${replies.length})` : ''}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-800">
                        Replied by {n.tenant_name ?? 'tenant'}
                      </p>
                      {replies.slice(0, 3).map((r) => (
                        <div key={r.id} className="mt-2">
                          <p className="text-[10px] text-muted-foreground">
                            {fmt(r.sent_at ?? r.created_at)}
                          </p>
                          <p className="whitespace-pre-line text-sm">
                            {r.rendered_message || r.message_body || '(no body)'}
                          </p>
                        </div>
                      ))}
                      {replies.length > 3 && (
                        <p className="mt-2 text-[11px] italic text-muted-foreground">
                          + {replies.length - 3} more — click to see all
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}

                <span className="hidden w-28 shrink-0 text-xs text-muted-foreground sm:block">
                  {n.sent_at ? format(new Date(n.sent_at), 'd MMM, HH:mm') : '—'}
                </span>
                <span className="flex w-20 shrink-0 items-center justify-end gap-1">
                  {delivery ? (
                    <span className={`inline-flex items-center gap-1 text-xs ${delivery.cls}`}>
                      <delivery.Icon className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}
                  >
                    <s.Icon className="h-3 w-3" />
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && (data.has_next || page > 1) && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">Page {page} · {data.total} total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!data.has_next} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail popup */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Message detail
                  <Badge
                    className={`text-[11px] ${STATUS_META[selected.status].cls}`}
                    variant="secondary"
                  >
                    {STATUS_META[selected.status].label}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <DetailRow label="Room">{selected.room_number || '—'}</DetailRow>
                <DetailRow label="Resident">{selected.tenant_name || '—'}</DetailRow>
                <DetailRow label="To">
                  <span className="font-mono">{selected.recipient_phone || selected.tenant_phone || '—'}</span>
                </DetailRow>
                <DetailRow label="Template">
                  <span className="font-mono text-xs">{selected.template_name}</span>
                </DetailRow>
                <DetailRow label="Delivery">
                  {selected.delivery_status
                    ? (DELIVERY_META[selected.delivery_status]?.label ?? selected.delivery_status)
                    : '—'}
                </DetailRow>
                <DetailRow label="Triggered">{fmt(selected.sent_at ?? selected.created_at)}</DetailRow>
                <DetailRow label="Delivered">
                  {fmt(selected.delivered_at)}
                  {selected.sent_at && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({formatDistanceToNow(new Date(selected.sent_at), { addSuffix: true })})
                    </span>
                  )}
                </DetailRow>
                {selected.error_message && (
                  <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                    {selected.error_message}
                  </p>
                )}
                <div className="pt-1">
                  <span className="text-sm text-muted-foreground">Message sent</span>
                  <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground/90">
                    {selected.rendered_message || selected.message_body}
                  </p>
                </div>

                <RepliesForOutbound selected={selected} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

/**
 * Any inbound WhatsApp messages we received from the same tenant AFTER
 * this outbound was sent. Not a Meta context-id chain — just "everything
 * this tenant said back after we pinged them". If the same tenant got a
 * later outbound as well, we stop at that boundary so replies land under
 * the outbound they most likely responded to.
 */
function RepliesForOutbound({ selected }: { selected: NotificationEntry }) {
  const enabled = !!selected.recipient_id && selected.recipient_type === 'TENANT';
  const { data } = useNotifications(
    enabled
      ? {
          recipient_id: selected.recipient_id ?? undefined,
          channel: 'WHATSAPP',
          page_size: 100,
        }
      : { page_size: 0 },
  );
  if (!enabled) return null;
  const items = data?.items ?? [];
  const sentAt = new Date(selected.sent_at ?? selected.created_at ?? 0).getTime();
  // Next outbound to same tenant, if any — bound the reply window.
  const nextOutbound = items
    .filter(
      (m) =>
        !(m.template_name ?? '').startsWith('inbound:') &&
        m.id !== selected.id &&
        new Date(m.sent_at ?? m.created_at ?? 0).getTime() > sentAt,
    )
    .sort(
      (a, b) =>
        new Date(a.sent_at ?? a.created_at ?? 0).getTime() -
        new Date(b.sent_at ?? b.created_at ?? 0).getTime(),
    )[0];
  const cutoff = nextOutbound
    ? new Date(nextOutbound.sent_at ?? nextOutbound.created_at ?? 0).getTime()
    : Infinity;
  const replies = items
    .filter((m) => (m.template_name ?? '').startsWith('inbound:'))
    .filter((m) => {
      const t = new Date(m.sent_at ?? m.created_at ?? 0).getTime();
      return t > sentAt && t < cutoff;
    })
    .sort(
      (a, b) =>
        new Date(a.sent_at ?? a.created_at ?? 0).getTime() -
        new Date(b.sent_at ?? b.created_at ?? 0).getTime(),
    );
  if (replies.length === 0) return null;
  return (
    <div className="pt-2">
      <span className="text-sm font-medium text-muted-foreground">
        Replies from {selected.tenant_name ?? 'tenant'} ({replies.length})
      </span>
      <div className="mt-2 space-y-2">
        {replies.map((r) => (
          <div
            key={r.id}
            className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2"
          >
            <p className="text-[10px] uppercase tracking-wider text-emerald-800">
              {r.template_name?.replace('inbound:', '') || 'general'} · received{' '}
              {fmt(r.sent_at ?? r.created_at)}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">
              {r.rendered_message || r.message_body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
