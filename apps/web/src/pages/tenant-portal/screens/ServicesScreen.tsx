/**
 * Services — category grid + recent tickets.
 *
 * Mirrors the native Services tab. Each category card pushes to
 * /portal/services/new?category=...
 */
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  AlertCircle,
  Droplet,
  Plug,
  ShieldCheck,
  Sparkles,
  Ticket,
  Wifi,
  Wrench,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { useTenantTickets } from '@/lib/tenant-data/hooks';
import type { Ticket as TicketType, TicketCategory } from '@/lib/tenant-data/types';

import { EmptyState, PageHeader, SectionHeader, SkeletonLines, StatusPill } from './_shared';

const CATEGORIES: {
  value: TicketCategory;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
  { value: 'cleaning', label: 'Cleaning', icon: Droplet },
  { value: 'laundry', label: 'Laundry', icon: Wrench },
  { value: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { value: 'electrical', label: 'Electrical', icon: Plug },
  { value: 'plumbing', label: 'Plumbing', icon: Droplet },
  { value: 'other', label: 'Repair', icon: Wrench },
  { value: 'other', label: 'Security', icon: ShieldCheck },
  { value: 'other', label: 'Other', icon: AlertCircle },
];

export default function ServicesScreen() {
  const ticketsQ = useTenantTickets();
  const tickets = ticketsQ.data ?? [];
  const recent = tickets.slice(0, 5);

  return (
    <div>
      <PageHeader title="Services" subtitle="Raise issues, track tickets" />

      <SectionHeader title="Recent tickets" subtitle="Your recently raised tickets" />
      {ticketsQ.isLoading ? (
        <SkeletonLines count={2} />
      ) : recent.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-6 w-6" />}
          title="No tickets yet"
          message="Tap a category below to raise your first one."
        />
      ) : (
        <div className="grid gap-2">
          {recent.map((t) => (
            <TicketCard key={t.id} ticket={t} />
          ))}
        </div>
      )}

      <SectionHeader
        title="Complaint category"
        subtitle="Choose a category you need help with"
      />
      <div className="grid grid-cols-3 gap-3">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              to={`/portal/services/new?category=${c.value}&categoryLabel=${encodeURIComponent(c.label)}`}
              className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50 sm:p-5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold">{c.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: TicketType }) {
  const isOpen = ticket.status !== 'resolved';
  return (
    <Link to={`/portal/services/tickets/${ticket.id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="flex items-start justify-between gap-3 p-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {ticket.category.replace(/_/g, ' ')}
            </p>
            <p className="mt-0.5 truncate text-sm font-bold">{ticket.title}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              ID {ticket.id.slice(0, 8).toUpperCase()} · Created{' '}
              {format(parseISO(ticket.createdAt), 'd MMM yy')}
            </p>
          </div>
          <StatusPill label={isOpen ? 'Open' : 'Closed'} tone={isOpen ? 'warning' : 'success'} />
        </CardContent>
      </Card>
    </Link>
  );
}
