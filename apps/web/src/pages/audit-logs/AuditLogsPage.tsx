import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  ClipboardList,
  Download,
  Search,
  IndianRupee,
  UserPlus,
  Receipt,
  UserCircle,
  CalendarCheck,
  LogIn,
  Building2,
  Megaphone,
  MessageSquareWarning,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, initials } from '@/lib/utils';
import {
  useAuditLogs,
  useAuditSummary,
  type AuditLogEntry,
  type AuditLogFilters,
  type StaffSummary,
} from '@/hooks/useAuditLogs';
import AuditDetails from '@/components/audit/AuditDetails';

// ── Category visual styling ────────────────────────────────────────────────
// Full static class strings (no dynamic concatenation) so Tailwind keeps them.
interface CatStyle {
  label: string;
  Icon: LucideIcon;
  border: string;
  iconWrap: string;
}

const CATEGORY: Record<string, CatStyle> = {
  payment: { label: 'Payment', Icon: IndianRupee, border: 'border-l-teal-500', iconWrap: 'bg-teal-50 text-teal-600' },
  tenant: { label: 'Tenant', Icon: UserPlus, border: 'border-l-blue-500', iconWrap: 'bg-blue-50 text-blue-600' },
  expense: { label: 'Expense', Icon: Receipt, border: 'border-l-orange-500', iconWrap: 'bg-orange-50 text-orange-600' },
  lead: { label: 'Lead', Icon: UserCircle, border: 'border-l-purple-500', iconWrap: 'bg-purple-50 text-purple-600' },
  booking: { label: 'Booking', Icon: CalendarCheck, border: 'border-l-indigo-500', iconWrap: 'bg-indigo-50 text-indigo-600' },
  auth: { label: 'Auth', Icon: LogIn, border: 'border-l-slate-400', iconWrap: 'bg-slate-100 text-slate-600' },
  property: { label: 'Property', Icon: Building2, border: 'border-l-cyan-500', iconWrap: 'bg-cyan-50 text-cyan-600' },
  announcement: { label: 'Announcement', Icon: Megaphone, border: 'border-l-amber-500', iconWrap: 'bg-amber-50 text-amber-600' },
  complaint: { label: 'Complaint', Icon: MessageSquareWarning, border: 'border-l-red-500', iconWrap: 'bg-red-50 text-red-600' },
};

const FALLBACK: CatStyle = {
  label: 'Activity',
  Icon: Activity,
  border: 'border-l-slate-300',
  iconWrap: 'bg-slate-100 text-slate-500',
};

const catStyle = (c: string): CatStyle => CATEGORY[c] ?? FALLBACK;

const CATEGORY_OPTIONS = Object.keys(CATEGORY);
const ALL = 'ALL';

/** Full IST timestamp for tooltips, regardless of the viewer's timezone. */
function istFull(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function AuditLogsPage() {
  const navigate = useNavigate();
  const [actorUserId, setActorUserId] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters: AuditLogFilters = useMemo(
    () => ({
      actor_user_id: actorUserId === ALL ? undefined : actorUserId,
      event_category: category === ALL ? undefined : category,
      search: search.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [actorUserId, category, search, dateFrom, dateTo],
  );

  const { data: summary } = useAuditSummary();
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAuditLogs(filters);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  function exportCsv() {
    const header = ['Time (IST)', 'Actor', 'Role', 'Category', 'Event', 'Description', 'Property'];
    const rows = items.map((e) => [
      istFull(e.created_at),
      e.actor_name ?? '',
      e.actor_role ?? '',
      e.event_category,
      e.event_type,
      e.description,
      e.property_name ?? '',
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[21px] font-extrabold tracking-tight">Audit Logs</h1>
            <p className="text-sm text-muted-foreground">
              {total.toLocaleString('en-IN')} recorded {total === 1 ? 'action' : 'actions'} · accountability across your org
            </p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={items.length === 0}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Staff activity summary */}
      {summary && summary.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {summary.map((s) => (
            <StaffCard
              key={s.user_id}
              staff={s}
              active={actorUserId === s.user_id}
              onClick={() => setActorUserId(actorUserId === s.user_id ? ALL : s.user_id)}
            />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={actorUserId} onValueChange={setActorUserId}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All users</SelectItem>
            {summary?.map((s) => (
              <SelectItem key={s.user_id} value={s.user_id}>
                {s.user_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {catStyle(c).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-[150px]"
            aria-label="From date"
          />
          <span>→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-[150px]"
            aria-label="To date"
          />
        </div>

        <div className="relative ml-auto min-w-[220px] flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search descriptions…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {/* Activity feed */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-destructive">
          Couldn't load activity. Try again.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No activity matches these filters.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <FeedItem key={e.id} entry={e} onNavigate={navigate} />
          ))}

          <div className="pt-2 text-center">
            {hasNextPage ? (
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">— end of activity —</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StaffCard({
  staff,
  active,
  onClick,
}: {
  staff: StaffSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-[200px] items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-accent',
        active && 'border-accent ring-1 ring-accent',
      )}
    >
      <Avatar className="h-9 w-9">
        <AvatarFallback className="bg-accent/10 text-accent text-xs font-semibold">
          {initials(staff.user_name ?? 'U')}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{staff.user_name}</p>
        <p className="text-xs text-muted-foreground">
          {staff.event_count} {staff.event_count === 1 ? 'action' : 'actions'}
          {staff.last_active && (
            <> · {formatDistanceToNow(new Date(staff.last_active), { addSuffix: true })}</>
          )}
        </p>
      </div>
    </button>
  );
}

function FeedItem({
  entry,
  onNavigate,
}: {
  entry: AuditLogEntry;
  onNavigate: (to: string) => void;
}) {
  const style = catStyle(entry.event_category);
  const { Icon } = style;
  const clickableTenant = entry.entity_type === 'tenant' && entry.entity_id;

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border border-l-4 bg-card p-3', style.border)}>
      <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', style.iconWrap)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-snug">
            {clickableTenant ? (
              <button
                type="button"
                onClick={() => onNavigate(`/tenants/${entry.entity_id}`)}
                className="font-medium text-accent hover:underline"
              >
                {entry.description}
              </button>
            ) : (
              <span className="font-medium text-foreground">{entry.description}</span>
            )}
          </p>
          <Badge variant="outline" className="flex-shrink-0 text-[10px] capitalize">
            {style.label}
          </Badge>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {entry.actor_name && (
            <span className="inline-flex items-center gap-1">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="bg-muted text-[8px] font-semibold">
                  {initials(entry.actor_name)}
                </AvatarFallback>
              </Avatar>
              {entry.actor_name}
              {entry.actor_role && <span className="text-muted-foreground/60">· {entry.actor_role}</span>}
            </span>
          )}
          {entry.property_name && (
            <>
              <span aria-hidden>·</span>
              <span>{entry.property_name}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span title={istFull(entry.created_at)} className="cursor-default">
            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
          </span>
        </div>

        <AuditDetails entry={entry} />
      </div>
    </div>
  );
}
