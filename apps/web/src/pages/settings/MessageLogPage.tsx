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

function channelIcon(channel: NotificationEntry['channel']) {
  if (channel === 'WHATSAPP') return MessageSquare;
  if (channel === 'EMAIL') return Mail;
  return Send;
}

// Meta delivery receipt (sent → delivered → read, or failed).
const DELIVERY_META: Record<string, { label: string; cls: string; Icon: typeof Check }> = {
  sent: { label: 'Sent', cls: 'text-muted-foreground', Icon: Check },
  delivered: { label: 'Delivered', cls: 'text-emerald-600', Icon: CheckCheck },
  read: { label: 'Read', cls: 'text-teal-600', Icon: CheckCheck },
  failed: { label: 'Failed', cls: 'text-red-600', Icon: XCircle },
};

function fmt(ts: string | null): string {
  return ts ? format(new Date(ts), 'd MMM, HH:mm') : '—';
}

const PAGE_SIZE = 50;

export default function MessageLogPage() {
  const [status, setStatus] = useState<string>('all');
  const [channel, setChannel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filters: NotificationFilters = {
    page,
    page_size: PAGE_SIZE,
    status: status === 'all' ? undefined : status,
    channel: channel === 'all' ? undefined : channel,
    search: search.trim() || undefined,
  };

  const { data, isLoading, isError } = useNotifications(filters);
  const items = data?.items ?? [];

  // Reset to page 1 whenever a filter changes.
  function onFilter(setter: (v: string) => void, v: string) {
    setter(v);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Message Log</h1>
          <p className="text-sm text-muted-foreground">
            Every WhatsApp &amp; email the app sent — reminders, overdue notices, receipts.
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
            placeholder="Search recipient name or phone…"
            className="pl-8"
          />
        </div>
        <Select value={channel} onValueChange={(v) => onFilter(setChannel, v)}>
          <SelectTrigger className="w-[150px]">
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
        <Select value={status} onValueChange={(v) => onFilter(setStatus, v)}>
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

      {/* List */}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-destructive">
          Couldn't load the message log.
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Send className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No messages yet</p>
          <p className="text-xs text-muted-foreground">
            Sends appear here once the app or the rent scheduler dispatches them.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const s = STATUS_META[n.status];
            const ChannelIcon = channelIcon(n.channel);
            const to = n.recipient_phone || n.tenant_phone;
            const recipient = n.tenant_name || (to ? '' : n.recipient_type);
            const message = n.rendered_message || n.message_body;
            const delivery = n.delivery_status ? DELIVERY_META[n.delivery_status] : null;
            return (
              <div key={n.id} className="rounded-lg border bg-card p-3 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <ChannelIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {recipient && <span className="font-medium">{recipient}</span>}
                      {to && <span className="font-mono text-xs text-muted-foreground">To: {to}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {n.template_name}
                      </Badge>
                      {n.property_name && <span>· {n.property_name}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
                    >
                      <s.Icon className="h-3 w-3" />
                      {s.label}
                    </span>
                    {delivery && (
                      <span className={`inline-flex items-center gap-1 text-[11px] ${delivery.cls}`}>
                        <delivery.Icon className="h-3 w-3" />
                        {delivery.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* The actual message sent (rendered with real values) */}
                {message && (
                  <p className="mt-2 whitespace-pre-wrap rounded bg-muted/50 px-2.5 py-2 text-xs text-foreground/90">
                    {message}
                  </p>
                )}

                {/* Triggered / Delivered times */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>Triggered: {fmt(n.sent_at ?? n.created_at)}</span>
                  <span>Delivered: {fmt(n.delivered_at)}</span>
                  {n.sent_at && (
                    <span>({formatDistanceToNow(new Date(n.sent_at), { addSuffix: true })})</span>
                  )}
                </div>

                {n.error_message && (
                  <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                    {n.error_message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && (data.has_next || page > 1) && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            Page {page} · {data.total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.has_next}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
