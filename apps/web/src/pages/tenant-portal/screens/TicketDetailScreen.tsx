/**
 * Ticket detail — full status timeline + rate-or-reopen on resolved.
 */
import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import { useTenantTickets } from '@/lib/tenant-data/hooks';
import type { TicketStatus } from '@/lib/tenant-data/types';

import { PageHeader, SkeletonLines, StatusPill, type PillTone } from './_shared';

const STATUS_LABEL: Record<TicketStatus, string> = {
  raised: 'Raised',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  reopened: 'Reopened',
};

const STATUS_TONE: Record<TicketStatus, PillTone> = {
  raised: 'warning',
  assigned: 'info',
  in_progress: 'info',
  resolved: 'success',
  reopened: 'warning',
};

export default function TicketDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const ticketsQ = useTenantTickets();
  const ticket = useMemo(
    () => ticketsQ.data?.find((t) => t.id === id),
    [ticketsQ.data, id],
  );

  const [rating, setRating] = useState(0);

  if (ticketsQ.isLoading) {
    return <SkeletonLines count={6} />;
  }
  if (!ticket) {
    return (
      <div>
        <PageHeader title="Ticket" />
        <p className="text-sm text-muted-foreground">Ticket not found.</p>
      </div>
    );
  }

  function submitRating() {
    if (rating === 0) {
      toast({ title: 'Pick a star', variant: 'destructive' });
      return;
    }
    toast({ title: `Thanks for the ${rating}-star rating` });
    navigate(-1);
  }

  return (
    <div>
      <PageHeader
        title={ticket.title}
        subtitle={ticket.category.replace(/_/g, ' ')}
        action={<StatusPill label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />}
      />

      <p className="mb-4 text-sm text-muted-foreground">
        ID {ticket.id.slice(0, 8).toUpperCase()} · Raised{' '}
        {formatDistanceToNow(parseISO(ticket.createdAt))} ago
      </p>

      <Card className="mb-6">
        <CardContent className="p-5">
          <p className="text-sm leading-relaxed">{ticket.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Status timeline
          </p>
          <ol className="space-y-4">
            {ticket.timeline.map((event, i) => {
              const isLast = i === ticket.timeline.length - 1;
              return (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`h-3.5 w-3.5 rounded-full ${
                        isLast ? 'bg-accent' : 'bg-emerald-500'
                      }`}
                    />
                    {!isLast ? (
                      <span className="mt-1 h-full w-0.5 flex-1 bg-border" />
                    ) : null}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className="text-sm font-bold">{STATUS_LABEL[event.status]}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {format(parseISO(event.at), 'd MMM yyyy, h:mm a')}
                    </p>
                    {event.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{event.note}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {ticket.status === 'resolved' ? (
        <Card className="mt-6">
          <CardContent className="p-5">
            <p className="font-bold">How was the resolution?</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your feedback helps the team improve.
            </p>
            <div className="mt-3 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="p-1"
                  aria-label={`${n} stars`}
                >
                  <Star
                    className={`h-7 w-7 ${
                      n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={submitRating}>Submit rating</Button>
              <Button variant="ghost" onClick={() => toast({ title: 'Reopen request sent' })}>
                Not really — reopen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
