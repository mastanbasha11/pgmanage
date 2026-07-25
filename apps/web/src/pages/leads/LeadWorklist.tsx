/**
 * Leads — scalable worklist (the default view at scale).
 *
 * Replaces "browse the board" with "the ~20 that need action rise to the top".
 * Owns: the pipeline overview strip, saved-view tabs, the List/Board/Split
 * switcher, the filter/sort controls, the priority-sorted table, bulk actions,
 * and pagination. The Board (existing Kanban) is injected via `boardSlot` so it
 * stays a first-class view without duplicating the drag-and-drop code.
 *
 * Ranking + view predicates live in ./leadScore (pure + unit-tested).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  MessageCircle,
  CalendarPlus,
  MoreHorizontal,
  Search,
  Download,
  Plus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NameAvatar, Pill } from '@/components/ui/redesign';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { formatDate, whatsappLink } from '@/lib/utils';
import {
  comparePriority,
  daysSinceTouch,
  followupState,
  leadScore,
  matchesView,
  type SavedView,
} from './leadScore';

// ── Types (mirror the LeadsPage Lead shape) ─────────────────────────────────

export interface WorklistLead {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: string;
  interested_room_type?: string | null;
  budget_max_paise?: number | null;
  next_followup_at?: string | null;
  last_contacted_at?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  created_at: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

const SOURCE_LABEL: Record<string, string> = {
  META_AD: 'Meta Ad',
  INSTAGRAM: 'Instagram',
  REFERRAL: 'Referral',
  WALKIN: 'Walk-in',
  JUSTDIAL: 'JustDial',
  WEBSITE: 'Website',
  OTHER: 'Other',
};

const STAGES: { key: string; label: string; color: string }[] = [
  { key: 'NEW', label: 'New', color: '#2a78d6' },
  { key: 'CONTACTED', label: 'Contacted', color: '#eda100' },
  { key: 'SITE_VISITED', label: 'Site visited', color: '#0e9384' },
  { key: 'CONVERTED', label: 'Converted', color: '#22a559' },
  { key: 'LOST', label: 'Lost', color: '#9aa1ad' },
];
const MOVE_TARGETS = STAGES.map((s) => s.key);

const VIEWS: { key: SavedView; label: string; hot?: boolean }[] = [
  { key: 'TO_ACTION', label: '⚡ To action' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'DUE_TODAY', label: 'Due today' },
  { key: 'HOT', label: '🔥 Hot', hot: true },
  { key: 'NO_FOLLOWUP', label: 'No follow-up' },
  { key: 'IDLE_30D', label: 'Idle > 30d' },
  { key: 'ALL', label: 'All' },
];

type SortKey = 'PRIORITY' | 'SCORE' | 'NEWEST' | 'OLDEST' | 'NAME';
type ViewMode = 'LIST' | 'BOARD' | 'SPLIT';
const PAGE_SIZE = 15;

function stageTone(status: string): 'b' | 'a' | 'g' | 's' {
  if (status === 'NEW') return 'b';
  if (status === 'CONTACTED') return 'a';
  if (status === 'SITE_VISITED' || status === 'CONVERTED') return 'g';
  return 's';
}
function stageLabel(status: string): string {
  return STAGES.find((s) => s.key === status)?.label ?? status;
}
function scoreColor(n: number): string {
  return n >= 80 ? '#15803d' : n >= 60 ? '#eda100' : '#c7ccd6';
}
function wantTag(w?: string | null): ReactNode {
  if (!w) return <span className="text-[#98a0ad]">—</span>;
  const t = w.toLowerCase();
  const cls = /platinum|silver|gold/.test(t)
    ? 'bg-[#f4f0e6] text-[#7a6321] border-[#e6ddc3]'
    : /non-ac|unsure|not-sure/.test(t)
      ? 'bg-slate-100 text-[#7b8394] border-[#e0e5ee]'
      : 'bg-amber-50 text-[#92600b] border-[#f3d59b]';
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{w}</span>
  );
}
function lastActivity(l: WorklistLead): string {
  const d = daysSinceTouch(l);
  const verb = l.last_contacted_at ? 'contacted' : 'created';
  if (d === 0) return `${verb} today`;
  return `${verb} ${d}d ago`;
}

// ── Follow-up cell ──────────────────────────────────────────────────────────

function FollowupCell({ lead }: { lead: WorklistLead }) {
  const { state, overdueDays } = followupState(lead);
  if (state === 'overdue') return <Pill tone="r">Overdue {overdueDays}d</Pill>;
  if (state === 'today') return <Pill tone="a">Today</Pill>;
  if (state === 'future')
    return (
      <span className="text-[12px] text-muted-foreground">📅 {formatDate(lead.next_followup_at!)}</span>
    );
  return <span className="text-[11.5px] text-[#98a0ad]">no follow-up</span>;
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function LeadWorklist({
  leads,
  onOpenLead,
  onAddLead,
  canManage,
  boardSlot,
}: {
  leads: WorklistLead[];
  onOpenLead: (id: string) => void;
  onAddLead: () => void;
  /** OWNER/PARTNER — gates the Assign bulk action + owner list fetch. */
  canManage: boolean;
  /** Renders the existing Kanban board for the filtered set (Board/Split). */
  boardSlot: (filtered: WorklistLead[]) => ReactNode;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<ViewMode>('LIST');
  const [view, setView] = useState<SavedView>('TO_ACTION');
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');
  const [wantsFilter, setWantsFilter] = useState('ALL');
  const [sort, setSort] = useState<SortKey>('PRIORITY');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const staffQ = useQuery<{ items: StaffMember[] }>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff').then((r) => r.data),
    enabled: canManage,
  });
  const staff = staffQ.data?.items ?? [];

  // Distinct values for the Owner / Wants dropdowns, from the data itself.
  const owners = useMemo(
    () => Array.from(new Set(leads.map((l) => l.assigned_to_name).filter(Boolean))).sort() as string[],
    [leads],
  );
  const wants = useMemo(
    () => Array.from(new Set(leads.map((l) => l.interested_room_type).filter(Boolean))).sort() as string[],
    [leads],
  );

  // View counts (over ALL leads, so the tabs are a stable map of the pipeline).
  const viewCounts = useMemo(() => {
    const c = {} as Record<SavedView, number>;
    for (const v of VIEWS) c[v.key] = leads.filter((l) => matchesView(v.key, l)).length;
    return c;
  }, [leads]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STAGES) c[s.key] = leads.filter((l) => l.status === s.key).length;
    return c;
  }, [leads]);

  // Apply saved view + all filters + search.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (!matchesView(view, l)) return false;
      if (stageFilter && l.status !== stageFilter) return false;
      if (sourceFilter !== 'ALL' && l.source !== sourceFilter) return false;
      if (ownerFilter !== 'ALL') {
        if (ownerFilter === '__UNASSIGNED__' ? !!l.assigned_to : l.assigned_to_name !== ownerFilter)
          return false;
      }
      if (wantsFilter !== 'ALL' && l.interested_room_type !== wantsFilter) return false;
      if (q && !(l.name.toLowerCase().includes(q) || (l.phone ?? '').includes(q))) return false;
      return true;
    });
  }, [leads, view, stageFilter, sourceFilter, ownerFilter, wantsFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case 'SCORE':
        return arr.sort((a, b) => leadScore(b) - leadScore(a));
      case 'NEWEST':
        return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      case 'OLDEST':
        return arr.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      case 'NAME':
        return arr.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return arr.sort((a, b) => comparePriority(a, b));
    }
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function resetPage() {
    setPage(0);
    setSelected(new Set());
  }

  function pickView(v: SavedView) {
    setView(v);
    resetPage();
  }

  function toggleRow(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((l) => selected.has(l.id));
  function togglePage() {
    setSelected((s) => {
      const n = new Set(s);
      if (allOnPageSelected) pageRows.forEach((l) => n.delete(l.id));
      else pageRows.forEach((l) => n.add(l.id));
      return n;
    });
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const bulkPatch = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const ids = [...selected];
      await Promise.all(ids.map((id) => api.patch(`/leads/${id}`, patch)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Done', description: `${selected.size} lead(s) updated.` });
      setSelected(new Set());
    },
    onError: () =>
      toast({ title: 'Bulk update failed', description: 'Please retry.', variant: 'destructive' }),
  });

  const anyFilter =
    view !== 'TO_ACTION' ||
    stageFilter ||
    sourceFilter !== 'ALL' ||
    ownerFilter !== 'ALL' ||
    wantsFilter !== 'ALL' ||
    !!search;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Leads</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {leads.length} leads —{' '}
            <b className="text-foreground">
              you don't browse them, the ones that need action rise to the top
            </b>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onAddLead}>
            <Plus className="h-4 w-4" /> Add lead
          </Button>
        </div>
      </div>

      {/* Pipeline overview strip */}
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const on = stageFilter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setStageFilter(on ? null : s.key);
                resetPage();
              }}
              className={`relative flex-1 basis-40 overflow-hidden rounded-xl border bg-card p-2.5 pl-3.5 text-left shadow-sm transition-colors ${
                on ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-[#c8d0dc]'
              } ${stageCounts[s.key] === 0 ? 'opacity-70' : ''}`}
            >
              <span
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: s.color }}
              />
              <div className="text-[11px] font-bold text-muted-foreground">{s.label}</div>
              <div className="tnum text-xl font-extrabold tracking-tight">{stageCounts[s.key]}</div>
            </button>
          );
        })}
      </div>

      {/* Saved views + switcher */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {VIEWS.map((v) => {
            const on = view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => pickView(v.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-bold shadow-sm transition-colors ${
                  on
                    ? v.hot
                      ? 'border-[#b45309] bg-[#b45309] text-white'
                      : 'border-foreground bg-foreground text-white'
                    : 'border-border bg-card text-[#42495a] hover:border-[#c8d0dc]'
                }`}
              >
                {v.label}
                <span className={`text-[11px] font-extrabold ${on ? 'opacity-70' : 'opacity-50'}`}>
                  {viewCounts[v.key]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-sm">
          {(['LIST', 'BOARD', 'SPLIT'] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-bold transition-colors ${
                mode === m ? 'bg-foreground text-white' : 'text-[#4a5261] hover:text-foreground'
              }`}
            >
              {m === 'LIST' ? '☰ List' : m === 'BOARD' ? '▦ Board' : '⊟ Split'}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <ControlSelect
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            ['PRIORITY', 'Priority'],
            ['SCORE', 'Score'],
            ['NEWEST', 'Newest'],
            ['OLDEST', 'Oldest'],
            ['NAME', 'Name'],
          ]}
        />
        <ControlSelect
          label="Source"
          value={sourceFilter}
          onChange={(v) => {
            setSourceFilter(v);
            resetPage();
          }}
          options={[['ALL', 'All'], ...Object.entries(SOURCE_LABEL)]}
        />
        {canManage && (
          <ControlSelect
            label="Owner"
            value={ownerFilter}
            onChange={(v) => {
              setOwnerFilter(v);
              resetPage();
            }}
            options={[
              ['ALL', 'All'],
              ['__UNASSIGNED__', 'Unassigned'],
              ...owners.map((o) => [o, o] as [string, string]),
            ]}
          />
        )}
        <ControlSelect
          label="Wants"
          value={wantsFilter}
          onChange={(v) => {
            setWantsFilter(v);
            resetPage();
          }}
          options={[['ALL', 'Any'], ...wants.map((w) => [w, w] as [string, string])]}
        />
        {anyFilter && (
          <button
            type="button"
            className="text-[12px] font-bold text-muted-foreground hover:text-foreground"
            onClick={() => {
              setView('ALL');
              setStageFilter(null);
              setSourceFilter('ALL');
              setOwnerFilter('ALL');
              setWantsFilter('ALL');
              setSearch('');
              resetPage();
            }}
          >
            Clear
          </button>
        )}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#98a0ad]" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search name or phone…"
            className="h-9 w-56 pl-8 text-[12.5px]"
          />
        </div>
      </div>

      {mode === 'BOARD' ? (
        boardSlot(filtered)
      ) : (
        <>
          {mode === 'SPLIT' && <div className="rounded-xl">{boardSlot(filtered)}</div>}

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md">
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-[#cfe0f6] bg-[#e8f1fd] px-4 py-2.5 text-[12.5px] font-bold text-[#1c5cab]">
                <span>{selected.size} selected</span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <BulkMove
                    onMove={(status) => bulkPatch.mutate({ status })}
                    disabled={bulkPatch.isPending}
                  />
                  {canManage && (
                    <BulkAssign
                      staff={staff}
                      onAssign={(id) => bulkPatch.mutate({ assigned_to: id })}
                      disabled={bulkPatch.isPending}
                    />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#fbfcfe]">
                    <Th className="w-9">
                      <Check on={allOnPageSelected} onClick={togglePage} />
                    </Th>
                    <Th>Lead</Th>
                    <Th>Wants</Th>
                    <Th>Stage</Th>
                    <Th>Score</Th>
                    <Th>Follow-up</Th>
                    <Th>Owner</Th>
                    <Th>Last activity</Th>
                    <Th className="text-right">Quick actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((l) => {
                    const score = leadScore(l);
                    return (
                      <tr
                        key={l.id}
                        className="cursor-pointer border-b border-[#eef1f6] last:border-0 hover:bg-[#f8fafd]"
                        onClick={() => onOpenLead(l.id)}
                      >
                        <Td onClick={(e) => e.stopPropagation()}>
                          <Check on={selected.has(l.id)} onClick={() => toggleRow(l.id)} />
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <NameAvatar name={l.name} size={30} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-extrabold">{l.name}</span>
                                <span className="shrink-0 rounded border border-[#c4dbf7] bg-[#e8f1fd] px-1.5 py-px text-[9px] font-extrabold text-[#1c5cab]">
                                  {SOURCE_LABEL[l.source] ?? l.source}
                                </span>
                              </div>
                              <div className="mt-px flex items-center gap-1 text-[11px] text-[#98a0ad]">
                                <Phone className="h-2.5 w-2.5" /> {l.phone}
                              </div>
                            </div>
                          </div>
                        </Td>
                        <Td>{wantTag(l.interested_room_type)}</Td>
                        <Td>
                          <Pill tone={stageTone(l.status)}>{stageLabel(l.status)}</Pill>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-11 overflow-hidden rounded bg-[#eef1f6]">
                              <span
                                className="block h-full rounded"
                                style={{ width: `${score}%`, background: scoreColor(score) }}
                              />
                            </span>
                            <span
                              className="w-5 text-[12px] font-extrabold"
                              style={{ color: scoreColor(score) }}
                            >
                              {score}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <FollowupCell lead={l} />
                        </Td>
                        <Td>
                          {l.assigned_to_name ? (
                            <span className="inline-flex items-center gap-1.5">
                              <NameAvatar name={l.assigned_to_name} size={22} />
                              <span className="text-[12px] font-semibold">{l.assigned_to_name}</span>
                            </span>
                          ) : (
                            <Pill tone="s">unassigned</Pill>
                          )}
                        </Td>
                        <Td className="text-[11.5px] text-[#98a0ad]">{lastActivity(l)}</Td>
                        <Td onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            <IconBtn as="a" href={`tel:${l.phone}`} title="Call">
                              <Phone className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              as="a"
                              href={whatsappLink(
                                l.phone,
                                `Hi ${l.name}, thanks for your interest in our PG!`,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#25a366]"
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              className="text-accent"
                              title="Open / schedule"
                              onClick={() => onOpenLead(l.id)}
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn title="More" onClick={() => onOpenLead(l.id)}>
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </IconBtn>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-14 text-center text-sm text-muted-foreground">
                        Nothing here — this view is clear. Try another view above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer / pager */}
            <div className="flex items-center justify-between border-t border-[#eef1f6] bg-[#fbfcfe] px-4 py-2.5 text-[12px] text-muted-foreground">
              <span>
                {sorted.length === 0 ? (
                  'No leads'
                ) : (
                  <>
                    Showing <b>{safePage * PAGE_SIZE + 1}–{safePage * PAGE_SIZE + pageRows.length}</b>{' '}
                    of {sorted.length}
                  </>
                )}
              </span>
              {pageCount > 1 && (
                <div className="flex gap-1">
                  <Pg disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                    ‹
                  </Pg>
                  <span className="flex h-7 items-center px-2 text-[12px] font-bold">
                    {safePage + 1} / {pageCount}
                  </span>
                  <Pg disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                    ›
                  </Pg>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Small presentational bits ───────────────────────────────────────────────

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#98a0ad] ${className}`}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  className = '',
  onClick,
}: {
  children?: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <td className={`px-3 py-2.5 align-middle text-[12.5px] ${className}`} onClick={onClick}>
      {children}
    </td>
  );
}
function Check({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-4 w-4 items-center justify-center rounded border-[1.5px] text-[10px] font-black text-white ${
        on ? 'border-accent bg-accent' : 'border-[#c8d0dc] bg-white'
      }`}
    >
      {on ? '✓' : ''}
    </button>
  );
}
function Pg({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 min-w-7 items-center justify-center rounded-lg border border-border bg-card px-2 text-[12px] font-bold text-[#4a5261] disabled:opacity-40 hover:border-[#c8d0dc]"
    >
      {children}
    </button>
  );
}
function IconBtn({
  children,
  title,
  className = '',
  as = 'button',
  href,
  target,
  rel,
  onClick,
}: {
  children: ReactNode;
  title: string;
  className?: string;
  as?: 'button' | 'a';
  href?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
}) {
  const cls = `flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-[#98a0ad] hover:border-[#c8d0dc] hover:text-foreground ${className}`;
  if (as === 'a')
    return (
      <a href={href} target={target} rel={rel} title={title} className={cls} onClick={(e) => e.stopPropagation()}>
        {children}
      </a>
    );
  return (
    <button type="button" title={title} className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

function ControlSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto gap-1.5 text-[12px] font-semibold">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BulkMove({ onMove, disabled }: { onMove: (s: string) => void; disabled?: boolean }) {
  return (
    <Select value="" onValueChange={onMove} disabled={disabled}>
      <SelectTrigger className="h-7 w-auto gap-1.5 border-[#cfe0f6] bg-white text-[12px] font-bold text-[#1c5cab]">
        → Move stage
      </SelectTrigger>
      <SelectContent>
        {MOVE_TARGETS.map((s) => (
          <SelectItem key={s} value={s}>
            {stageLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function BulkAssign({
  staff,
  onAssign,
  disabled,
}: {
  staff: StaffMember[];
  onAssign: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value="" onValueChange={onAssign} disabled={disabled || staff.length === 0}>
      <SelectTrigger className="h-7 w-auto gap-1.5 border-[#cfe0f6] bg-white text-[12px] font-bold text-[#1c5cab]">
        👤 Assign
      </SelectTrigger>
      <SelectContent>
        {staff.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
