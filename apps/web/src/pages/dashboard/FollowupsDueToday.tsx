/**
 * Dashboard tile — leads whose `next_followup_at` falls on today.
 *
 * Uses the pre-existing `/leads/due-today` endpoint. Rendered as a compact
 * card so it slots next to (or below) the KPI grid without dominating the
 * page. Clicking a row navigates to `/leads?openLead=<id>` — the Leads
 * page reads that param on mount and opens the detail drawer for that
 * lead directly, so a rep can move from "who do I call next" to logging
 * the call in two clicks.
 */
import { AlarmClock, ArrowRight, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

interface DueTodayLead {
  id: string;
  name: string;
  phone: string;
  status: string;
  interested_room_type?: string;
  budget_min_paise?: number;
  budget_max_paise?: number;
}

const STATUS_TONE: Record<string, string> = {
  NEW: 'bg-sky-100 text-sky-800',
  CONTACTED: 'bg-amber-100 text-amber-800',
  SITE_VISITED: 'bg-violet-100 text-violet-800',
  NEGOTIATING: 'bg-orange-100 text-orange-800',
  BOOKED: 'bg-teal-100 text-teal-800',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  SITE_VISITED: 'Site Visited',
  NEGOTIATING: 'Negotiating',
  BOOKED: 'Booked',
};

export default function FollowupsDueToday({ propertyId }: { propertyId?: string }) {
  const { data, isLoading } = useQuery<{ items: DueTodayLead[]; total: number }>({
    queryKey: ['leads', 'due-today', propertyId],
    queryFn: () =>
      api
        .get('/leads/due-today', {
          params: propertyId ? { property_id: propertyId } : undefined,
        })
        .then((r) => r.data),
  });

  // Hide the tile entirely when there's nothing due — keeps the dashboard
  // signal-heavy. Once follow-ups are scheduled, this becomes the rep's
  // morning worklist automatically.
  if (isLoading || !data || data.total === 0) return null;

  const preview = data.items.slice(0, 5);
  const remaining = Math.max(0, data.total - preview.length);

  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardContent className="pt-4 pb-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
              <AlarmClock className="h-3.5 w-3.5" />
            </div>
            <p className="text-sm font-medium">
              Follow-ups due today · {data.total}
            </p>
          </div>
          <Link
            to="/leads"
            className="text-xs text-accent hover:underline inline-flex items-center gap-1"
          >
            All leads <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-2">
          {preview.map((l) => (
            <Link
              key={l.id}
              to={`/leads?openLead=${l.id}`}
              className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:border-accent/50 hover:bg-accent/5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {l.phone}
                  {l.interested_room_type && (
                    <span className="ml-1">· {l.interested_room_type}</span>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  STATUS_TONE[l.status] ?? 'bg-muted text-muted-foreground'
                }`}
              >
                {STATUS_LABEL[l.status] ?? l.status}
              </span>
            </Link>
          ))}
          {remaining > 0 && (
            <Link
              to="/leads"
              className="rounded-md border border-dashed py-1.5 text-center text-xs text-muted-foreground hover:border-solid hover:bg-muted/30"
            >
              +{remaining} more · see all
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
