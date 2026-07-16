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
import { formatPaise, formatDate, shortRoomType, cn } from '@/lib/utils';
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
  const available = beds.filter((b) => b.status !== 'UPCOMING');
  const upcoming = beds.filter((b) => b.status === 'UPCOMING');

  return (
    <div className="space-y-8">
      {available.length > 0 && (
        <section>
          <SectionHeader
            dotClass="bg-emerald-500"
            title="Available now"
            count={available.length}
            hint="Ready to check a tenant into today."
          />
          <VacancyFloors beds={available} onHold={onHold} statusPending={statusPending} />
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <SectionHeader
            dotClass="bg-amber-500"
            title="Upcoming vacancies"
            count={upcoming.length}
            hint="Tenants who've given notice. Use these to plan replacements early."
          />
          {/* Upcoming vacancies now render floor-grouped (same shape as
              "Available now") so reps scan the building spatially rather
              than by time. Time is still visible per card via the
              "in N days" hint. */}
          <VacancyFloors beds={upcoming} onHold={onHold} statusPending={statusPending} />
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  dotClass,
  title,
  count,
  hint,
}: {
  dotClass: string;
  title: string;
  count: number;
  hint: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', dotClass)} />
        <h2 className="text-sm font-semibold tracking-tight">
          {title} <span className="text-muted-foreground font-normal">({count})</span>
        </h2>
      </div>
      <p className="text-xs text-muted-foreground hidden sm:block">{hint}</p>
    </div>
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
  // Sort beds within each room by label so A shows before B.
  for (const r of rooms.values()) {
    r.beds.sort((a, b) => a.bed_label.localeCompare(b.bed_label));
  }
  return Array.from(rooms.values());
}

function VacancyFloors({
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
  // Group beds → rooms → floors. Two levels: floor sections at top, room
  // cards inside each floor. Rooms are sorted by their numeric prefix so
  // 101 sits before 102 (works for "101", "101-A", etc.).
  const rooms = groupByRoom(beds);
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

  return (
    <div className="space-y-4">
      {floors.map((f) => (
        <div key={f.floor_name}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {f.floor_name}{' '}
            <span className="text-muted-foreground/70 font-normal normal-case">
              ({f.rooms.length} {f.rooms.length === 1 ? 'room' : 'rooms'} ·{' '}
              {f.rooms.reduce((s, r) => s + r.beds.length, 0)} beds)
            </span>
          </h3>
          {/* Denser grid — 4 columns on wide screens, 2 on medium. Cards
              are smaller because they now represent one room, not one bed. */}
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {f.rooms.map((r) => (
              <VacancyRoomCard
                key={r.room_id}
                room={r}
                onHold={onHold}
                statusPending={statusPending}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact room card — replaces the old per-bed card. When multiple beds
 *  in the same room are open (or vacating), they collapse into a single
 *  card so the board doesn't misrepresent the true vacancy count. */
function VacancyRoomCard({
  room,
  onHold,
  statusPending,
}: {
  room: RoomVacancy;
  onHold: (
    bedId: string,
    status: 'VACANT' | 'RESERVED' | 'MAINTENANCE',
    description: string,
  ) => void;
  statusPending: boolean;
}) {
  const isUpcoming = room.status === 'UPCOMING';
  const bedCount = room.beds.length;
  const bedLabels = room.beds.map((b) => b.bed_label).join(', ');
  return (
    <div
      className={cn(
        'rounded-md border p-2.5 text-sm transition-colors',
        isUpcoming
          ? 'border-amber-200 bg-amber-50/40 hover:bg-amber-50'
          : 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <p className="text-sm font-semibold tabular-nums leading-none">
            {room.room_number}
          </p>
          {room.room_type && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {shortRoomType(room.room_type)}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {formatPaise(room.monthly_base_rent_paise)}/mo
        </p>
      </div>
      <p className="mt-1 text-[11px]">
        <span
          className={cn(
            'font-medium',
            isUpcoming ? 'text-amber-900' : 'text-emerald-900',
          )}
        >
          {bedCount === 1 ? `Bed ${bedLabels}` : `Beds ${bedLabels}`}
        </span>
        <span className="text-muted-foreground"> · {bedCount} vacant</span>
      </p>

      {isUpcoming && room.earliest_available_from && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-800">
          <Calendar className="h-3 w-3" />
          {formatDate(room.earliest_available_from)} ·{' '}
          {relativeDays(room.earliest_available_from)}
        </p>
      )}

      {isUpcoming && room.beds.some((b) => b.current_tenant_name) && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <User className="h-3 w-3" />
          {room.beds
            .filter((b) => b.current_tenant_name)
            .map((b) => b.current_tenant_name)
            .join(', ')}{' '}
          vacating
        </p>
      )}

      {!isUpcoming && (
        <div className="mt-2 flex flex-wrap gap-1">
          {room.beds.map((bed) => (
            <div key={bed.id} className="flex items-center gap-0.5">
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-1.5 text-[11px]"
                disabled={statusPending}
                onClick={() =>
                  onHold(
                    bed.id,
                    'RESERVED',
                    `${room.room_number}·${bed.bed_label} held (single occupancy)`,
                  )
                }
                title={`Hold bed ${bed.bed_label}`}
              >
                <Lock className="h-3 w-3" />
                {bedCount > 1 && bed.bed_label}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-1 text-[11px] text-amber-700"
                disabled={statusPending}
                onClick={() =>
                  onHold(
                    bed.id,
                    'MAINTENANCE',
                    `${room.room_number}·${bed.bed_label} marked for maintenance`,
                  )
                }
                title={`Bed ${bed.bed_label} out for maintenance`}
              >
                <Wrench className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
