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

interface Props {
  floors: Floor[];
  onBedClick?: (bed: Bed, room: Room) => void;
}

const BED_TONES: Record<Bed['status'], string> = {
  VACANT: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100',
  OCCUPIED: 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100',
  RESERVED: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
  MAINTENANCE: 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100',
};

export function OccupancyGrid({ floors, onBedClick }: Props) {
  if (!floors || floors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        No floors configured. Add floors and rooms in property setup first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend tone="bg-emerald-300" label="Vacant" />
        <Legend tone="bg-sky-300" label="Occupied" />
        <Legend tone="bg-amber-300" label="Reserved" />
        <Legend tone="bg-rose-300" label="Maintenance" />
      </div>

      {floors.map((floor) => (
        <div key={floor.id}>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            {floor.display_name}
          </h3>
          {floor.rooms.length === 0 ? (
            <p className="rounded border border-dashed px-3 py-4 text-xs text-muted-foreground italic">
              No rooms on this floor.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {floor.rooms.map((room) => (
                <div key={room.id} className="rounded-lg border bg-card p-3">
                  <p className="mb-2 text-xs font-semibold">
                    Room {room.room_number}
                  </p>
                  <div className="grid gap-1.5">
                    {room.beds.map((bed) => (
                      <button
                        type="button"
                        key={bed.id}
                        onClick={() => onBedClick?.(bed, room)}
                        className={cn(
                          'rounded border px-2 py-1 text-left text-xs transition-colors',
                          BED_TONES[bed.status],
                          onBedClick && 'cursor-pointer',
                        )}
                        title={bed.tenant_name ?? bed.status}
                      >
                        <span className="font-medium">Bed {bed.bed_label}</span>
                        {bed.tenant_name && (
                          <span className="block truncate text-[10px] opacity-80">
                            {bed.tenant_name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded', tone)} />
      {label}
    </span>
  );
}
