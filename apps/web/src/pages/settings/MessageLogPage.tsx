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

  const filters: NotificationFilters = {
    page,
    page_size: PAGE_SIZE,
    status: status === 'all' ? undefined : status,
    channel: channel === 'all' ? undefined : channel,
    search: search.trim() || undefined,
  };

  const { data, isLoading, isError } = useNotifications(filters);
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Message Log</h1>
          <p className="text-sm text-muted-foreground">
            Every WhatsApp &amp; email the app sent. Click a row for the full message.
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
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelected(n)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <span className="w-12 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {n.room_number || '—'}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <ChannelIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{who}</span>
                </span>
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
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
