import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  CheckCircle2,
  Settings,
  AlertCircle,
  Wrench,
  Lock,
  Unlock,
  Calendar,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { OccupancyGrid } from '@/components/occupancy-grid/OccupancyGrid';
import {
  useProperty,
  usePropertyOccupancy,
  useUpdateBedStatus,
} from '@/hooks/useProperties';
import { useVacantBeds, type VacantBed } from '@/hooks/useTenants';
import TeamRoster from './TeamRoster';
import { formatPaise, shortRoomType, cn } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import PropertySetupDialog from './PropertySetupDialog';

type BedStatus = 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';

interface FloorRoom {
  id: string;
  room_number: string;
  display_name?: string;
  status?: string;
  beds: Array<{ id: string; bed_label: string; status: BedStatus; tenant_name?: string | null }>;
}

interface FloorEntry {
  id: string;
  floor_number: number;
  display_name: string;
  rooms: FloorRoom[];
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showSetup, setShowSetup] = useState(false);
  const [search, setSearch] = useState('');

  const { data: property, isLoading } = useProperty(id!);
  const { data: occupancy } = usePropertyOccupancy(id!);
  const { data: vacant } = useVacantBeds(id);
  const { mutateAsync: updateStatus, isPending: statusPending } = useUpdateBedStatus();
  const { toast } = useToast();

  async function changeBedStatus(
    bedId: string,
    status: 'VACANT' | 'RESERVED' | 'MAINTENANCE',
    description: string,
  ) {
    try {
      await updateStatus({ bedId, status });
      toast({ title: description });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response
          ?.data?.error?.message ?? 'Could not change bed status';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  const floors: FloorEntry[] = occupancy?.floors ?? [];

  // Aggregate stats from the occupancy payload
  const stats = floors.reduce(
    (acc, f) => {
      f.rooms.forEach((r) => {
        r.beds.forEach((b) => {
          acc.total++;
          if (b.status === 'OCCUPIED') acc.occupied++;
          else if (b.status === 'VACANT') acc.vacant++;
          else if (b.status === 'RESERVED') acc.reserved++;
          else if (b.status === 'MAINTENANCE') acc.maintenance++;
        });
      });
      return acc;
    },
    { total: 0, occupied: 0, vacant: 0, reserved: 0, maintenance: 0 },
  );

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-32 rounded-lg bg-muted" />
      </div>
    );
  }

  if (!property) {
    return <div className="py-16 text-center text-muted-foreground">Property not found.</div>;
  }

  const filteredVacant = (vacant?.items ?? []).filter((b) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      b.room_number.toLowerCase().includes(s) ||
      b.bed_label.toLowerCase().includes(s) ||
      b.floor_name.toLowerCase().includes(s) ||
      (b.room_type ?? '').toLowerCase().includes(s) ||
      (b.current_tenant_name ?? '').toLowerCase().includes(s)
    );
  });

  // Build the list of blocked beds (RESERVED / MAINTENANCE) from occupancy.
  interface BlockedBed {
    id: string;
    bed_label: string;
    room_number: string;
    floor_name: string;
    status: BedStatus;
  }
  const blockedBeds: BlockedBed[] = [];
  for (const f of floors) {
    for (const r of f.rooms) {
      for (const bd of r.beds) {
        if (bd.status === 'RESERVED' || bd.status === 'MAINTENANCE') {
          blockedBeds.push({
            id: bd.id,
            bed_label: bd.bed_label,
            room_number: r.room_number,
            floor_name: f.display_name,
            status: bd.status,
          });
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/properties')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{property.name}</h1>
            <p className="text-sm text-muted-foreground">
              {property.address_line1}, {property.city}
              {property.state ? `, ${property.state}` : ''}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setShowSetup(true)} className="gap-2">
          <Settings className="h-4 w-4" />
          Configure floors &amp; rooms
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        <StatCard label="Total beds" value={stats.total} icon={Building2} tone="default" />
        <StatCard
          label="Occupied"
          value={stats.occupied}
          icon={CheckCircle2}
          tone="occupied"
          pct={stats.total ? Math.round((stats.occupied / stats.total) * 100) : 0}
        />
        <StatCard
          label="Vacant"
          value={stats.vacant}
          icon={BedDouble}
          tone="vacant"
          pct={stats.total ? Math.round((stats.vacant / stats.total) * 100) : 0}
        />
        <StatCard
          label="Reserved"
          value={stats.reserved}
          icon={AlertCircle}
          tone="reserved"
          pct={stats.total ? Math.round((stats.reserved / stats.total) * 100) : 0}
        />
        <StatCard
          label="Maintenance"
          value={stats.maintenance}
          icon={Wrench}
          tone="maintenance"
          pct={stats.total ? Math.round((stats.maintenance / stats.total) * 100) : 0}
        />
      </div>

      <Tabs defaultValue="vacant">
        <TabsList>
          <TabsTrigger value="vacant">
            Available ({vacant?.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="blocked">
            Blocked ({blockedBeds.length})
          </TabsTrigger>
          <TabsTrigger value="grid">Floor grid</TabsTrigger>
          <TabsTrigger value="team">Team & Owners</TabsTrigger>
        </TabsList>

        <TabsContent value="vacant" className="mt-4 space-y-4">
          {(vacant?.items.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              No vacancies — currently full, and no upcoming vacate dates in the next 60 days.
              <p className="mt-1 text-xs">
                Set a tenant's <strong>expected move-out date</strong> from the Edit tenant
                dialog to surface upcoming vacancies here.
              </p>
            </div>
          ) : (
            <>
              <Input
                placeholder="Search by room, floor, type, or tenant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              {filteredVacant.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No matches.
                </div>
              ) : (
                <VacancySections
                  beds={filteredVacant}
                  onHold={changeBedStatus}
                  statusPending={statusPending}
                />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="blocked" className="mt-4 space-y-3">
          {blockedBeds.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              No blocked beds. Use the <strong>Hold</strong> action on a vacant bed to mark it
              as held for single-occupancy, or as out-of-service.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Floor
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Room
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Bed
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {blockedBeds.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">{b.floor_name}</td>
                      <td className="px-4 py-3 font-medium tabular-nums">{b.room_number}</td>
                      <td className="px-4 py-3 tabular-nums">{b.bed_label}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px]',
                            b.status === 'RESERVED'
                              ? 'border-amber-300 text-amber-800'
                              : 'border-rose-300 text-rose-800',
                          )}
                        >
                          {b.status === 'RESERVED' ? 'Held' : 'Maintenance'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          disabled={statusPending}
                          onClick={() =>
                            changeBedStatus(
                              b.id,
                              'VACANT',
                              `${b.room_number}·${b.bed_label} released`,
                            )
                          }
                        >
                          <Unlock className="h-3 w-3" />
                          Release
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="grid" className="mt-4">
          {floors.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No floors or rooms configured yet.
              </p>
              <Button className="mt-4 gap-2" onClick={() => setShowSetup(true)}>
                <Settings className="h-4 w-4" />
                Set up floors &amp; rooms
              </Button>
            </div>
          ) : (
            <OccupancyGrid floors={floors} />
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <TeamRoster propertyId={property.id} />
        </TabsContent>
      </Tabs>

      <PropertySetupDialog
        open={showSetup}
        onClose={() => setShowSetup(false)}
        propertyId={property.id}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  pct,
}: {
  label: string;
  value: number;
  icon: typeof BedDouble;
  tone: 'default' | 'occupied' | 'vacant' | 'reserved' | 'maintenance';
  pct?: number;
}) {
  const toneCls = {
    default: 'bg-muted text-muted-foreground',
    occupied: 'bg-sky-100 text-sky-700',
    vacant: 'bg-emerald-100 text-emerald-700',
    reserved: 'bg-amber-100 text-amber-700',
    maintenance: 'bg-rose-100 text-rose-700',
  }[tone];
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-full', toneCls)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {pct !== undefined && (
          <p className="text-[11px] text-muted-foreground">{pct}% of total</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Top-level vacancies layout:
 *   1. "Available now" — green cards, grouped by floor (helps owners think
 *      spatially about which rooms to fill first).
 *   2. "Upcoming vacancies" — amber cards, grouped by *time bucket* (when
 *      the bed frees up, not where it is) since the planning question for
 *      future vacancies is "when can I sell the spot" rather than "where".
 *
 * This split also matches different mental models — current vacancies are
 * actionable today (check in someone), upcoming are pipeline / leads.
 */
function VacancySections({
  beds,
  onHold,
  statusPending,
}: {
  beds: VacantBed[];
  onHold: (
    bedId: string,
    status: 'VACANT' | 'RESERVED' | 'MAINTENANCE',
    description: string,
  ) => void;
  statusPending: boolean;
}) {
  const availableBeds = beds.filter((b) => b.status !== 'UPCOMING');
  const upcomingBeds = beds.filter((b) => b.status === 'UPCOMING');

  return (
    <div className="space-y-8">
      {availableBeds.length > 0 && (
        <VacancyBoard
          mode="now"
          beds={availableBeds}
          onHold={onHold}
          statusPending={statusPending}
        />
      )}
      {upcomingBeds.length > 0 && (
        <VacancyBoard
          mode="soon"
          beds={upcomingBeds}
          onHold={onHold}
          statusPending={statusPending}
        />
      )}
    </div>
  );
}

// ── Filter chip state ───────────────────────────────────────────────────
// Kept plain-string in state so the chip toolbar stays trivial. Chips are
// mutually exclusive: pick one, everything else clears.
type VacancyFilter = 'all' | 'whole' | '2' | '3' | 'suite' | 'ac' | 'nonac';

function matchesFilter(r: RoomVacancy, f: VacancyFilter): boolean {
  if (f === 'all') return true;
  const capacity = r.room_capacity ?? r.beds.length;
  if (f === 'whole') return r.beds.length >= capacity;
  const label = shortRoomType(r.room_type ?? '');
  if (f === '2') return capacity === 2 || label === '2-Share';
  if (f === '3') return capacity === 3 || label === '3-Share';
  if (f === 'suite') return label === 'Suite';
  if (f === 'ac') return !!r.has_ac;
  if (f === 'nonac') return !r.has_ac;
  return true;
}

function VacancyBoard({
  mode,
  beds,
  onHold,
  statusPending,
}: {
  mode: 'now' | 'soon';
  beds: VacantBed[];
  onHold: (
    bedId: string,
    status: 'VACANT' | 'RESERVED' | 'MAINTENANCE',
    description: string,
  ) => void;
  statusPending: boolean;
}) {
  const rooms = groupByRoom(beds);
  const [filter, setFilter] = useState<VacancyFilter>('all');
  const visible = rooms.filter((r) => matchesFilter(r, filter));

  const totalBeds = rooms.reduce((s, r) => s + r.beds.length, 0);
  const wholeRooms = rooms.filter(
    (r) => r.beds.length >= (r.room_capacity ?? r.beds.length),
  ).length;
  const totalRooms = rooms.length;

  const isNow = mode === 'now';
  const chips: { key: VacancyFilter; label: string; count?: number }[] = isNow
    ? [
        { key: 'all', label: 'All', count: rooms.length },
        { key: 'whole', label: 'Whole rooms', count: wholeRooms },
        { key: 'ac', label: 'AC', count: rooms.filter((r) => r.has_ac).length },
        { key: 'nonac', label: 'Non-AC', count: rooms.filter((r) => !r.has_ac).length },
      ]
    : [
        { key: 'all', label: 'All', count: rooms.length },
        { key: 'whole', label: 'Whole rooms', count: wholeRooms },
        { key: '2', label: '2-Share' },
        { key: '3', label: '3-Share' },
        { key: 'suite', label: 'Suite' },
        { key: 'ac', label: 'AC', count: rooms.filter((r) => r.has_ac).length },
        { key: 'nonac', label: 'Non-AC', count: rooms.filter((r) => !r.has_ac).length },
      ];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                isNow ? 'bg-emerald-500' : 'bg-amber-500',
              )}
              style={{
                boxShadow: isNow
                  ? '0 0 0 4px rgb(220 252 231)'
                  : '0 0 0 4px rgb(254 243 199)',
              }}
            />
            <h2 className="text-base font-bold tracking-tight">
              {isNow ? 'Vacant now' : 'Upcoming vacancies'}{' '}
              <span className="text-muted-foreground font-normal">({totalBeds})</span>
            </h2>
          </div>
          <p className="mt-1 ml-5 text-xs text-muted-foreground">
            {isNow
              ? 'Beds empty today — ready to assign, on hold, or under maintenance.'
              : 'Rooms freeing up in the next 30 days · grouped by floor · full rooms flagged.'}
          </p>
        </div>
        {/* Stat tiles — total beds / total rooms / whole rooms highlighted */}
        <div className="flex gap-2">
          <StatTile label="beds" value={totalBeds} />
          <StatTile label="rooms" value={totalRooms} />
          <StatTile
            label="whole rooms"
            value={wholeRooms}
            tone={isNow ? 'emerald' : 'emerald'}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="mb-4 ml-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  active
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300',
                )}
              >
                {c.label}
                {typeof c.count === 'number' && (
                  <span className={cn('text-[10px]', active ? 'opacity-70' : 'opacity-60')}>
                    {c.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {isNow ? (
            <>
              <LegendKey color="bg-emerald-600" label="Available" />
              <LegendKey color="bg-amber-500" label="On hold" />
              <LegendKey color="bg-slate-400" label="Maintenance" />
            </>
          ) : (
            <>
              <LegendKey color="bg-emerald-600" label="Whole room free" />
              <LegendKey color="bg-amber-500" label="Partly free" />
            </>
          )}
        </div>
      </div>

      <VacancyFloors
        rooms={visible}
        mode={mode}
        onHold={onHold}
        statusPending={statusPending}
      />
    </section>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'emerald';
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-1.5 text-center min-w-[62px]">
      <p
        className={cn(
          'text-lg font-bold tabular-nums leading-none',
          tone === 'emerald' ? 'text-emerald-700' : 'text-foreground',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-sm', color)} />
      {label}
    </span>
  );
}

function relativeDays(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const when = new Date(iso);
  when.setHours(0, 0, 0, 0);
  const d = Math.round((when.getTime() - today.getTime()) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 0) return `${-d}d overdue`;
  return `in ${d} days`;
}

/** One card = one ROOM. If a 2-share room has both beds vacant, that's one
 *  card showing "Beds A, B" — not two separate cards, which used to make
 *  the board feel twice as busy as the property actually was. */
interface RoomVacancy {
  room_id: string;
  room_number: string;
  floor_id: string;
  floor_number: number;
  floor_name: string;
  room_type?: string;
  /** Per-ROOM AC flag (see rooms.has_ac). Rendered as a small blue pill
   *  next to the room-type badge. */
  has_ac: boolean;
  /** Total beds configured on the room (rooms.capacity). Used to render
   *  the occupancy dots and decide whether this is a WHOLE-room vacancy
   *  (all beds are free) or a partial one. */
  room_capacity: number;
  monthly_base_rent_paise: number;
  beds: VacantBed[];
  /** UPCOMING if any bed here is upcoming, else VACANT. Mixed rooms
   *  (one bed available now, another vacating later) render as upcoming
   *  since the room isn't fully rentable today anyway. */
  status: 'VACANT' | 'UPCOMING';
  /** Earliest date any bed in this room is available. */
  earliest_available_from?: string;
}

function groupByRoom(beds: VacantBed[]): RoomVacancy[] {
  const rooms = new Map<string, RoomVacancy>();
  for (const b of beds) {
    const key = b.room_id;
    if (!rooms.has(key)) {
      rooms.set(key, {
        room_id: b.room_id,
        room_number: b.room_number,
        floor_id: b.floor_id,
        floor_number: b.floor_number,
        floor_name: b.floor_name,
        room_type: b.room_type,
        has_ac: !!b.has_ac,
        // Fall back to the bed count if the backend didn't populate
        // capacity — keeps the UI degrading gracefully instead of
        // showing 0-of-0 dots.
        room_capacity: b.room_capacity ?? 0,
        monthly_base_rent_paise: b.monthly_base_rent_paise,
        beds: [],
        status: 'VACANT',
        earliest_available_from: undefined,
      });
    }
    const r = rooms.get(key)!;
    r.beds.push(b);
    if (b.status === 'UPCOMING') r.status = 'UPCOMING';
    if (b.available_from) {
      if (
        !r.earliest_available_from ||
        b.available_from < r.earliest_available_from
      ) {
        r.earliest_available_from = b.available_from;
      }
    }
  }
  // Sort beds within each room by label so A shows before B. Also fall
  // back capacity to the number of vacant beds when the backend didn't
  // supply it — better than treating capacity as 0 for the occupancy dots.
  for (const r of rooms.values()) {
    r.beds.sort((a, b) => a.bed_label.localeCompare(b.bed_label));
    if (!r.room_capacity || r.room_capacity < r.beds.length) {
      r.room_capacity = r.beds.length;
    }
  }
  return Array.from(rooms.values());
}

/** Floor tag on the LEFT (short id + long name + per-floor meta),
 *  rooms flow to the RIGHT in a flex-wrap of ~330px cards. Matches the
 *  design mockup at ~/Downloads/vacancies2.html. Wraps naturally on
 *  narrow screens (floor tag becomes a header row). */
function VacancyFloors({
  rooms,
  mode,
  onHold,
  statusPending,
}: {
  rooms: RoomVacancy[];
  mode: 'now' | 'soon';
  onHold: (
    bedId: string,
    status: 'VACANT' | 'RESERVED' | 'MAINTENANCE',
    description: string,
  ) => void;
  statusPending: boolean;
}) {
  const byFloor: Record<
    string,
    { floor_name: string; floor_number: number; rooms: RoomVacancy[] }
  > = {};
  for (const r of rooms) {
    const key = r.floor_id || String(r.floor_number);
    if (!byFloor[key]) {
      byFloor[key] = {
        floor_name: r.floor_name,
        floor_number: r.floor_number,
        rooms: [],
      };
    }
    byFloor[key].rooms.push(r);
  }
  const floors = Object.values(byFloor).sort(
    (a, b) => a.floor_number - b.floor_number,
  );
  for (const f of floors) {
    f.rooms.sort((a, b) => {
      const na = parseInt(a.room_number, 10);
      const nb = parseInt(b.room_number, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.room_number.localeCompare(b.room_number);
    });
  }

  if (floors.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">
        No rooms match the current filter.
      </div>
    );
  }

  return (
    <div className="ml-5 divide-y divide-slate-200">
      {floors.map((f) => {
        const fb = f.rooms.reduce((s, r) => s + r.beds.length, 0);
        return (
          <div
            key={f.floor_name}
            className="grid grid-cols-[80px_1fr] gap-4 py-3 sm:grid-cols-[92px_1fr] items-start"
          >
            <div className="sm:sticky sm:top-3">
              <div className="text-sm font-bold tracking-tight">
                {shortFloorTag(f.floor_name, f.floor_number)}
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                {f.floor_name}
              </div>
              <div className="mt-1.5 text-[10.5px] text-muted-foreground/70 leading-snug">
                {f.rooms.length} room{f.rooms.length === 1 ? '' : 's'}
                <br />
                {fb} bed{fb === 1 ? '' : 's'}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {f.rooms.map((r) => (
                <VacancyRoomCard
                  key={r.room_id}
                  room={r}
                  mode={mode}
                  onHold={onHold}
                  statusPending={statusPending}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Short floor id like "5F" or "1F". Falls back to "F<n>" when the name
 *  doesn't start with a digit. */
function shortFloorTag(name: string, num: number): string {
  const m = name.match(/^(\d+)/);
  if (m) return `${m[1]}F`;
  if (num === 0) return 'GF';
  return `${num}F`;
}

/** Room card at the ~330px width of the mockup. Contains:
 *  - Header: room number, type pill, Non-AC pill (only when not AC), rent
 *  - Occupancy dots (N of M free), or "Whole room" green pill when all beds
 *    are free — surfaces the important upsell signal
 *  - Left green accent bar when the whole room is available
 *  - One nested bed card per vacant bed (with status/date/tenant per mode)
 */
function VacancyRoomCard({
  room,
  mode,
  onHold,
  statusPending,
}: {
  room: RoomVacancy;
  mode: 'now' | 'soon';
  onHold: (
    bedId: string,
    status: 'VACANT' | 'RESERVED' | 'MAINTENANCE',
    description: string,
  ) => void;
  statusPending: boolean;
}) {
  const isNow = mode === 'now';
  const total = room.room_capacity || room.beds.length;
  const free = room.beds.length;
  const isWholeRoom = free >= total && total > 0;
  const isSuite = shortRoomType(room.room_type ?? '') === 'Suite';

  return (
    <article
      className={cn(
        'relative w-[330px] max-w-full rounded-2xl border p-3 shadow-sm transition-all',
        'hover:shadow-md hover:-translate-y-px',
        isNow
          ? 'bg-emerald-50/40 border-emerald-200'
          : 'bg-amber-50/40 border-amber-200',
      )}
    >
      {/* Whole-room accent bar on the left (only when every bed is free). */}
      {isWholeRoom && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-emerald-600"
        />
      )}

      {/* Header — number / tags / price */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-base font-bold tabular-nums tracking-tight">
            {room.room_number}
          </span>
          {room.room_type && (
            <span
              className={cn(
                'rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap',
                isSuite
                  ? 'bg-violet-100 text-violet-800 border-violet-200'
                  : 'bg-amber-100 text-amber-900 border-amber-200',
              )}
            >
              {shortRoomType(room.room_type)}
            </span>
          )}
          {!room.has_ac && (
            <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500 whitespace-nowrap">
              Non-AC
            </span>
          )}
        </div>
        <p className="text-[12.5px] font-bold text-right tabular-nums whitespace-nowrap">
          {formatPaise(room.monthly_base_rent_paise)}
          <span className="text-[10px] font-semibold text-muted-foreground/70">
            /mo
          </span>
        </p>
      </div>

      {/* Occupancy dots + "Whole room" pill */}
      <div className="mt-2 flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
        <span className="flex gap-[3px]">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-[9px] w-[9px] rounded-[3px]',
                i < free
                  ? isNow
                    ? 'bg-emerald-600'
                    : 'bg-amber-500'
                  : 'bg-slate-200',
              )}
            />
          ))}
        </span>
        {isWholeRoom ? (
          <span className="rounded-full bg-emerald-600 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
            Whole room
          </span>
        ) : (
          <span>
            {free} of {total} free
          </span>
        )}
      </div>

      {/* Nested bed cards */}
      <div className="mt-2 flex flex-wrap gap-2">
        {room.beds.map((bed) => (
          <BedSubCard
            key={bed.id}
            bed={bed}
            isNow={isNow}
            room={room}
            onHold={onHold}
            statusPending={statusPending}
          />
        ))}
      </div>
    </article>
  );
}

function BedSubCard({
  bed,
  isNow,
  room,
  onHold,
  statusPending,
}: {
  bed: VacantBed;
  isNow: boolean;
  room: RoomVacancy;
  onHold: (
    bedId: string,
    status: 'VACANT' | 'RESERVED' | 'MAINTENANCE',
    description: string,
  ) => void;
  statusPending: boolean;
}) {
  return (
    <div className="flex-1 basis-[130px] min-w-[120px] rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(24,30,45,.04)]">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[12.5px] font-bold">
          Bed{' '}
          <span className={isNow ? 'text-emerald-700' : 'text-amber-700'}>
            {bed.bed_label}
          </span>
        </span>
      </div>

      {isNow ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-800">
            <CheckIcon className="h-3 w-3" /> Available
          </span>
          <button
            type="button"
            title="Hold bed"
            disabled={statusPending}
            onClick={() =>
              onHold(
                bed.id,
                'RESERVED',
                `${room.room_number}·${bed.bed_label} held (single occupancy)`,
              )
            }
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300"
          >
            <Lock className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Out for maintenance"
            disabled={statusPending}
            onClick={() =>
              onHold(
                bed.id,
                'MAINTENANCE',
                `${room.room_number}·${bed.bed_label} marked for maintenance`,
              )
            }
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300"
          >
            <Wrench className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <>
          {bed.available_from && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-700">
              <Calendar className="h-3 w-3 shrink-0" />
              {formatShortDate(bed.available_from)}
              <span className="font-semibold text-muted-foreground/70">
                · {relativeDays(bed.available_from)}
              </span>
            </p>
          )}
          {bed.current_tenant_name && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {bed.current_tenant_name} leaving
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

/** "31 Jul" style short label — matches the mockup's date pill. */
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
