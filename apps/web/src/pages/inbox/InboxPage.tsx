/**
 * Tenant Inbox — unified feed of tenant-initiated events.
 *
 * Sources flowing in:
 *   - New complaint            (tenant raises via resident app)
 *   - Notice to vacate         (tenant submits via resident app)
 *   - KYC updates              (vehicle, emergency, name changed)
 *   - Feedback                 (Phase 9)
 *
 * Filter chips: Unread / All. Per-row tap navigates to the source page
 * via deep_link. Mark single / mark all read.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCheck,
  ChevronRight,
  Inbox as InboxIcon,
  MessageSquareWarning,
  Loader2,
  LogOut,
  Star,
  User,
  Wrench,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import {
  useInbox,
  useMarkAllInboxRead,
  useMarkInboxRead,
  type InboxEvent,
  type InboxKind,
} from '@/hooks/useInbox';
import { cn } from '@/lib/utils';

const KIND_META: Record<InboxKind, { icon: React.ElementType; tone: string; label: string }> = {
  COMPLAINT_NEW: { icon: Wrench, tone: 'bg-amber-50 text-amber-700 ring-amber-200', label: 'Complaint' },
  COMPLAINT_REOPENED: { icon: MessageSquareWarning, tone: 'bg-rose-50 text-rose-700 ring-rose-200', label: 'Reopened' },
  NOTICE_GIVEN: { icon: LogOut, tone: 'bg-rose-50 text-rose-700 ring-rose-200', label: 'Notice' },
  KYC_UPDATED: { icon: User, tone: 'bg-sky-50 text-sky-700 ring-sky-200', label: 'Profile' },
  FEEDBACK: { icon: Star, tone: 'bg-violet-50 text-violet-700 ring-violet-200', label: 'Feedback' },
  OTHER: { icon: AlertCircle, tone: 'bg-slate-50 text-slate-700 ring-slate-200', label: 'Event' },
};

export default function InboxPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const { data, isLoading } = useInbox(filter);
  const markRead = useMarkInboxRead();
  const markAll = useMarkAllInboxRead();

  const items = data?.items ?? [];

  async function onMarkAll() {
    try {
      await markAll.mutateAsync();
      toast({ title: 'All marked read' });
    } catch {
      toast({ title: 'Could not update', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-accent/10 p-2.5">
            <InboxIcon className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
            <p className="text-sm text-muted-foreground">
              Everything your residents have done that you should know about.
            </p>
          </div>
        </div>
        {items.length > 0 && filter === 'unread' ? (
          <Button variant="outline" size="sm" onClick={onMarkAll} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        ) : null}
      </header>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(['unread', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition-colors',
              filter === f
                ? 'bg-accent text-accent-foreground ring-accent'
                : 'bg-background text-muted-foreground ring-border hover:bg-muted',
            )}
          >
            {f === 'unread' ? 'Unread' : 'All'}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCheck className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold">
              {filter === 'unread' ? "You're all caught up" : 'No events yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === 'unread'
                ? 'Tenant-initiated events show up here as soon as they happen.'
                : 'When residents take action in their app, it lands here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {items.map((event) => (
            <Row
              key={event.id}
              event={event}
              onRead={(id) => markRead.mutateAsync(id).catch(() => undefined)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ event, onRead }: { event: InboxEvent; onRead: (id: string) => void }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const unread = !event.read_at;
  const content = (
    <Card
      className={cn(
        'transition-colors',
        unread
          ? 'border-accent/30 bg-accent/[0.03] hover:bg-accent/[0.06]'
          : 'hover:bg-muted/50',
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div
          className={cn(
            'mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full ring-1',
            meta.tone,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {meta.label}
            </span>
            {unread ? (
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            ) : null}
          </div>
          <p className="mt-0.5 text-sm font-medium">{event.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDistanceToNow(parseISO(event.created_at))} ago
            {event.tenant_name ? ` · ${event.tenant_name}` : ''}
          </p>
        </div>
        <ChevronRight className="mt-3 h-4 w-4 flex-none text-muted-foreground" />
      </CardContent>
    </Card>
  );
  if (!event.deep_link) {
    return (
      <button type="button" onClick={() => unread && onRead(event.id)} className="text-left">
        {content}
      </button>
    );
  }
  return (
    <Link
      to={event.deep_link}
      onClick={() => unread && onRead(event.id)}
      className="block"
    >
      {content}
    </Link>
  );
}
