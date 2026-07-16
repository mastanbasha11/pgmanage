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
import { TooltipProvider } from '@/components/ui/tooltip';
import { FilterChip, NameAvatar, Pill, RoomBadge } from '@/components/ui/redesign';
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

  // ── Group sends into per-tenant/template sequences (mock layout) ─────────
  // "Rent reminder ×4 to Shravan" reads as one story, not four identical rows.
  const groups = new Map<string, NotificationEntry[]>();
  for (const n of items) {
    const key = `${n.recipient_id ?? n.recipient_phone ?? n.tenant_phone ?? n.id}|${n.template_name ?? ''}`;
    const arr = groups.get(key) ?? [];
    arr.push(n);
    groups.set(key, arr);
  }
  const groupList = Array.from(groups.values()).map((arr) =>
    arr.sort(
      (a, b) =>
        new Date(b.sent_at ?? b.created_at ?? 0).getTime() -
        new Date(a.sent_at ?? a.created_at ?? 0).getTime(),
    ),
  );

  return (
    <TooltipProvider delayDuration={150}>
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight">Message Log</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Sends grouped into sequences per tenant — the story, not identical rows. A green
          Replied chip means the tenant wrote back.
        </p>
      </div>

      {/* Filters — status as chips (mock), search + channel kept */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'All'],
            ['FAILED', 'Failed'],
            ['SENT', 'Sent'],
            ['PENDING', 'Pending'],
          ] as [string, string][]
        ).map(([key, label]) => (
          <FilterChip
            key={key}
            active={status === key}
            warn={key === 'FAILED'}
            onClick={() => {
              setStatus(key);
              setPage(1);
            }}
          >
            {label}
          </FilterChip>
        ))}
        <Select value={channel} onValueChange={(v) => { setChannel(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[140px] rounded-full text-xs font-bold">
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
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or phone…"
            className="h-9 rounded-full pl-8 text-xs font-semibold"
          />
        </div>
        <span className="hidden items-center gap-2.5 text-[11px] font-semibold text-muted-foreground lg:flex">
          <span>✓ Sent</span>
          <span className="text-[#15803d]">✓✓ Delivered</span>
          <span className="text-[#1c5cab]">✓✓ Read</span>
          <span className="text-destructive">✗ Failed</span>
        </span>
      </div>

      {/* Grouped list */}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-destructive">Couldn't load the message log.</p>
      ) : groupList.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-16 text-center">
          <Send className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No messages yet</p>
          <p className="text-xs text-muted-foreground">
            Sends appear here once the app or the rent scheduler dispatches them.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groupList.map((group) => {
            const latest = group[0];
            const who =
              latest.tenant_name ||
              latest.recipient_phone ||
              latest.tenant_phone ||
              latest.recipient_type;
            const anyFailed = group.some((g) => g.status === 'FAILED');
            const replies = repliesFor(latest);
            const ChannelIcon = channelIcon(latest.channel);
            return (
              <button
                key={latest.id}
                type="button"
                onClick={() => setSelected(latest)}
                className="block w-full rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-[#cfd8e6]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <NameAvatar name={who ?? '?'} size={28} />
                  <b className="text-[13px]">{who}</b>
                  {latest.room_number && <RoomBadge room={latest.room_number} />}
                  <Pill tone="v" dot={false}>
                    {latest.template_name?.replace(/_/g, ' ') || latest.channel}
                  </Pill>
                  {group.length > 1 && (
                    <span className="text-[11px] font-semibold text-[#98a0ad]">
                      {group.length} sends
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    {anyFailed ? (
                      <Pill tone="r">Failed ✗</Pill>
                    ) : replies.length > 0 ? (
                      <Pill tone="g">
                        <MessageCircle className="h-3 w-3" /> Replied
                        {replies.length > 1 ? ` (${replies.length})` : ''}
                      </Pill>
                    ) : (
                      <Pill tone="s">No reply yet</Pill>
                    )}
                  </span>
                </div>
                {/* Per-send timeline chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.slice(0, 6).map((n) => {
                    const delivery = n.delivery_status
                      ? DELIVERY_META[n.delivery_status]
                      : null;
                    return (
                      <span
                        key={n.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground"
                      >
                        <ChannelIcon className="h-3 w-3" />
                        {n.sent_at ? format(new Date(n.sent_at), 'd MMM') : '—'} ·{' '}
                        {n.status === 'FAILED' ? (
                          <span className="font-bold text-destructive">
                            ✗ {n.error_message?.slice(0, 32) || 'Failed'}
                          </span>
                        ) : delivery ? (
                          <span className={`font-bold ${delivery.cls}`}>
                            {n.delivery_status === 'read'
                              ? '✓✓ Read'
                              : n.delivery_status === 'delivered'
                                ? '✓✓ Delivered'
                                : '✓ Sent'}
                          </span>
                        ) : (
                          <span>{STATUS_META[n.status].label}</span>
                        )}
                      </span>
                    );
                  })}
                  {group.length > 6 && (
                    <span className="self-center text-[11px] font-semibold text-[#98a0ad]">
                      +{group.length - 6} more
                    </span>
                  )}
                </div>
              </button>
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
