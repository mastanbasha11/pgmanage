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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { OccupancyGrid } from '@/components/occupancy-grid/OccupancyGrid';
import { useProperty, usePropertyOccupancy } from '@/hooks/useProperties';
import { useVacantBeds } from '@/hooks/useTenants';
import { formatPaise, shortRoomType, cn } from '@/lib/utils';
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
      (b.room_type ?? '').toLowerCase().includes(s)
    );
  });

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
            Vacant beds ({vacant?.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="grid">Floor grid</TabsTrigger>
        </TabsList>

        <TabsContent value="vacant" className="mt-4 space-y-3">
          {(vacant?.items.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              No vacant beds — your property is fully occupied. 🎉
            </div>
          ) : (
            <>
              <Input
                placeholder="Search vacant beds by room, floor, or type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
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
                        Type
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Base Rent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredVacant.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{b.floor_name}</td>
                        <td className="px-4 py-3 font-medium tabular-nums">{b.room_number}</td>
                        <td className="px-4 py-3 tabular-nums">{b.bed_label}</td>
                        <td className="px-4 py-3">
                          {b.room_type ? (
                            <Badge variant="outline" className="text-[10px]">
                              {shortRoomType(b.room_type)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatPaise(b.monthly_base_rent_paise)}
                          <span className="text-muted-foreground">/mo</span>
                        </td>
                      </tr>
                    ))}
                    {filteredVacant.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No matches.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
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
