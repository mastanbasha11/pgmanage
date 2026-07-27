import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Bed {
  id: string;
  bed_label: string;
  status: 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';
  tenant_name?: string | null;
}

interface Room {
  id: string;
  room_number: string;
  display_name?: string;
  status?: string;
  beds: Bed[];
}

interface Floor {
  id: string;
  floor_number: number;
  display_name: string;
  rooms: Room[];
}

/** Beds that will free up soon (a tenant has given notice / has a vacate date). */
export interface UpcomingBed {
  id: string;
  availableFrom?: string;
}

interface Props {
  floors: Floor[];
  onBedClick?: (bed: Bed, room: Room) => void;
  /** Occupied beds with a move-out on the books — powers the "Upcoming" toggle. */
  upcoming?: UpcomingBed[];
}

// Occupied = green (our theme), vacant = orange (stands out — the thing to fill),
// held/blocked (reserved + maintenance) = light blue.
const BED_TONES: Record<Bed['status'], string> = {
  OCCUPIED: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100',
  VACANT: 'bg-orange-50 border-orange-300 text-orange-800 hover:bg-orange-100',
  RESERVED: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100',
  MAINTENANCE: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100',
};
// A bed that's occupied today but freeing up next month — dashed orange.
const UPCOMING_TONE =
  'border-dashed border-orange-400 bg-orange-50/70 text-orange-800 hover:bg-orange-100';

function fmt(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function OccupancyGrid({ floors, onBedClick, upcoming = [] }: Props) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  const upcomingMap = useMemo(
    () => new Map(upcoming.map((u) => [u.id, u.availableFrom])),
    [upcoming],
  );

  if (!floors || floors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        No floors configured. Add floors and rooms in property setup first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Legend + upcoming toggle */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <Legend tone="bg-emerald-400" label="Occupied" />
        <Legend tone="bg-orange-400" label="Vacant" />
        <Legend tone="bg-sky-300" label="Blocked / held" />
        {showUpcoming && <Legend tone="bg-orange-300" label="Leaving soon" dashed />}
        <button
          type="button"
          onClick={() => setShowUpcoming((v) => !v)}
          disabled={upcoming.length === 0}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
            showUpcoming
              ? 'border-orange-300 bg-orange-50 text-orange-800'
              : 'border-border bg-card text-foreground hover:bg-muted disabled:opacity-50',
          )}
          title={
            upcoming.length === 0
              ? 'No upcoming vacancies — set a tenant’s move-out date to surface them'
              : 'Show beds that will be free next month (vacant now + notice given)'
          }
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {showUpcoming ? 'Showing upcoming' : `Upcoming month${upcoming.length ? ` (${upcoming.length})` : ''}`}
        </button>
      </div>

      {floors.map((floor) => {
        // ≤8 rooms → one row (up to 8 across); more than 8 → 5 per row.
        const cols = floor.rooms.length <= 8 ? Math.max(1, floor.rooms.length) : 5;
        return (
          <div key={floor.id}>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">{floor.display_name}</h3>
            {floor.rooms.length === 0 ? (
              <p className="rounded border border-dashed px-3 py-4 text-xs italic text-muted-foreground">
                No rooms on this floor.
              </p>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(132px, 1fr))` }}
                >
                  {floor.rooms.map((room) => (
                    <div key={room.id} className="rounded-lg border bg-card p-3">
                      <p className="mb-2 text-xs font-semibold">Room {room.room_number}</p>
                      <div className="grid gap-1.5">
                        {room.beds.map((bed) => {
                          const leaving =
                            showUpcoming && bed.status === 'OCCUPIED' && upcomingMap.has(bed.id);
                          const availableFrom = leaving ? upcomingMap.get(bed.id) : undefined;
                          return (
                            <button
                              type="button"
                              key={bed.id}
                              onClick={() => onBedClick?.(bed, room)}
                              className={cn(
                                'rounded border px-2 py-1 text-left text-xs transition-colors',
                                leaving ? UPCOMING_TONE : BED_TONES[bed.status],
                                onBedClick && 'cursor-pointer',
                              )}
                              title={
                                leaving
                                  ? `${bed.tenant_name ?? ''} — leaving ${fmt(availableFrom)}`
                                  : bed.tenant_name ?? bed.status
                              }
                            >
                              <span className="font-medium">Bed {bed.bed_label}</span>
                              {leaving ? (
                                <span className="block truncate text-[10px] font-semibold">
                                  leaving {fmt(availableFrom)}
                                </span>
                              ) : (
                                bed.tenant_name && (
                                  <span className="block truncate text-[10px] opacity-80">
                                    {bed.tenant_name}
                                  </span>
                                )
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Legend({ tone, label, dashed }: { tone: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded', tone, dashed && 'border border-dashed border-orange-500')} />
      {label}
    </span>
  );
}
