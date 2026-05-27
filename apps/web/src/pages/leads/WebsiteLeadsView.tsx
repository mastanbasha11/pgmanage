import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Search,
  Globe,
  Inbox,
  Phone,
  Mail,
  BedDouble,
  CalendarClock,
  TrendingUp,
  MessageCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatDate, whatsappLink } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import {
  useWebsiteLeads,
  useUpdateLeadStatus,
  type LeadStatus,
  type WebsiteLead,
} from '@/hooks/useWebsiteLeads';

// ── Status colour coding (New=blue, Contacted=amber, Converted=green, Rejected=gray) ──
const STATUS: Record<string, { label: string; badge: string; dot: string }> = {
  NEW: { label: 'New', badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  CONTACTED: { label: 'Contacted', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  CONVERTED: { label: 'Converted', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  LOST: { label: 'Rejected', badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  SITE_VISITED: { label: 'Site Visited', badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  NEGOTIATING: { label: 'Negotiating', badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
};
const statusOf = (s: string) => STATUS[s] ?? STATUS.NEW;

// Dropdown maps the CRM's four states onto the DB enum (Rejected = LOST).
const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'LOST', label: 'Rejected' },
];

const CHIPS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'NEW', label: 'New' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'CONVERTED', label: 'Converted' },
];

export default function WebsiteLeadsView() {
  const { data, isLoading } = useWebsiteLeads();
  const updateStatus = useUpdateLeadStatus();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [chip, setChip] = useState('ALL');

  const leads = useMemo(() => data?.items ?? [], [data]);

  // Track which lead IDs we've already seen so genuinely-new arrivals can animate.
  const seen = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (leads.length === 0) return;
    const incoming = leads.map((l) => l.id);
    const isFirstLoad = seen.current.size === 0;
    const fresh = new Set(incoming.filter((id) => !seen.current.has(id)));
    incoming.forEach((id) => seen.current.add(id));
    if (!isFirstLoad && fresh.size > 0) {
      setFreshIds(fresh);
      const t = setTimeout(() => setFreshIds(new Set()), 4000);
      return () => clearTimeout(t);
    }
  }, [leads]);

  // Deep-link from the new-lead email: ?lead=<id> highlights + scrolls to that row.
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('lead');
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, leads]);

  // ── Summary metrics ──
  const now = new Date();
  const thisMonth = leads.filter((l) => {
    const d = new Date(l.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const newCount = leads.filter((l) => l.status === 'NEW').length;
  const convertedCount = leads.filter((l) => l.status === 'CONVERTED').length;
  const conversionRate = leads.length ? Math.round((convertedCount / leads.length) * 100) : 0;

  // ── Filter + search ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (chip !== 'ALL' && l.status !== chip) return false;
      if (!q) return true;
      return l.name.toLowerCase().includes(q) || (l.phone ?? '').toLowerCase().includes(q);
    });
  }, [leads, chip, search]);

  async function changeStatus(lead: WebsiteLead, status: LeadStatus) {
    try {
      await updateStatus.mutateAsync({ id: lead.id, status });
      toast({ title: 'Status updated', description: `${lead.name} → ${statusOf(status).label}` });
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary header */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={Inbox} label="Leads this month" value={thisMonth} tone="text-blue-600" />
        <SummaryCard icon={Globe} label="New / unactioned" value={newCount} tone="text-amber-600" />
        <SummaryCard
          icon={TrendingUp}
          label="Conversion rate"
          value={`${conversionRate}%`}
          tone="text-emerald-600"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                chip === c.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No leads match these filters.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Interest</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    ref={lead.id === highlightId ? highlightRef : undefined}
                    className={cn(
                      'align-top hover:bg-muted/30',
                      freshIds.has(lead.id) &&
                        'animate-in fade-in slide-in-from-top-2 duration-500 bg-blue-50/60',
                      lead.id === highlightId && 'bg-accent/5 ring-2 ring-inset ring-accent',
                    )}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{lead.name}</p>
                      {lead.notes && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground" title={lead.notes}>
                          {lead.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        <a href={`tel:${lead.phone}`} className="hover:text-foreground">{lead.phone}</a>
                      </div>
                      {lead.email && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          <a href={`mailto:${lead.email}`} className="truncate hover:text-foreground">
                            {lead.email}
                          </a>
                        </div>
                      )}
                      <a
                        href={whatsappLink(lead.phone, `Hi ${lead.name}, thanks for enquiring about a stay with us!`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[#128C7E] hover:underline"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lead.interested_room_type && (
                        <div className="flex items-center gap-1.5 capitalize">
                          <BedDouble className="h-3.5 w-3.5" />
                          {lead.interested_room_type}
                        </div>
                      )}
                      {lead.expected_move_in_date && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDate(lead.expected_move_in_date)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" title={new Date(lead.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
                      {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPicker lead={lead} onChange={changeStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((lead) => (
              <Card
                key={lead.id}
                className={cn(
                  freshIds.has(lead.id) && 'animate-in fade-in slide-in-from-top-2 duration-500 ring-1 ring-blue-300',
                  lead.id === highlightId && 'ring-2 ring-accent',
                )}
              >
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{lead.name}</p>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{lead.phone}</a>
                    {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{lead.email}</a>}
                    {lead.interested_room_type && <span className="flex items-center gap-1.5 capitalize"><BedDouble className="h-3 w-3" />{lead.interested_room_type}</span>}
                    {lead.expected_move_in_date && <span className="flex items-center gap-1.5"><CalendarClock className="h-3 w-3" />{formatDate(lead.expected_move_in_date)}</span>}
                  </div>
                  {lead.notes && <p className="text-xs text-foreground/80">{lead.notes}</p>}
                  <StatusPicker lead={lead} onChange={changeStatus} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Inbox;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg bg-muted', tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPicker({
  lead,
  onChange,
}: {
  lead: WebsiteLead;
  onChange: (lead: WebsiteLead, status: LeadStatus) => void;
}) {
  const s = statusOf(lead.status);
  return (
    <Select value={lead.status} onValueChange={(v) => onChange(lead, v as LeadStatus)}>
      <SelectTrigger className={cn('h-8 w-[140px] border text-xs font-medium', s.badge)}>
        <span className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        {/* Preserve display of pipeline-only states if a lead is in one. */}
        {!STATUS_OPTIONS.some((o) => o.value === lead.status) && (
          <SelectItem value={lead.status}>{s.label}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
        <Globe className="h-8 w-8 text-accent" />
      </div>
      <p className="mt-4 font-semibold">No website leads yet</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Share your booking link to start receiving leads. Set it up under{' '}
        <span className="font-medium text-foreground">Settings → Website Integration</span>.
      </p>
    </div>
  );
}
