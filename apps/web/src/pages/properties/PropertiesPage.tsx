/**
 * Properties — redesigned per Claude UX/pgmanageredesign.html.
 *
 * One wide card per property: identity row with headline occupancy %
 * (includes RESERVED beds), status pills, a 2×3 stat grid, and actions.
 * "Edit" opens the setup wizard (same PropertySetupDialog, restyled).
 * The 6-month occupancy sparkline from the mock is intentionally dropped.
 */
import { useState } from 'react';
import { Building2, Plus, Pencil, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill } from '@/components/ui/redesign';
import { useProperties, type Property } from '@/hooks/useProperties';
import CreatePropertyDialog from './CreatePropertyDialog';
import PropertySetupDialog from './PropertySetupDialog';

function PropertyCard({
  property,
  onEdit,
}: {
  property: Property;
  onEdit: (id: string) => void;
}) {
  const navigate = useNavigate();
  // occupied_beds already includes RESERVED (backend rule — a held bed is
  // not sellable, so it counts as full).
  const occupancyPct = property.total_beds
    ? Math.round((property.occupied_beds / property.total_beds) * 100)
    : 0;
  const isEmpty = property.total_beds === 0;
  const reserved = property.reserved_beds ?? 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* identity row */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent text-lg text-white">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15.5px] font-extrabold">{property.name}</h3>
          <p className="text-[11px] font-semibold text-[#98a0ad]">
            {property.city}
            {property.state ? `, ${property.state}` : ''}
          </p>
        </div>
        {!isEmpty && (
          <div className="ml-auto text-right">
            <div className="tnum text-[20px] font-extrabold text-accent">{occupancyPct}%</div>
            <div className="text-[11px] font-semibold text-[#98a0ad]">
              occupancy
              <span className="block">
                {property.occupied_beds} of {property.total_beds} beds
              </span>
            </div>
          </div>
        )}
      </div>

      {/* pills */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3 pt-2.5">
        {isEmpty ? (
          <Pill tone="a">No rooms yet — run setup</Pill>
        ) : (
          <>
            {property.vacant_beds > 0 && (
              <Pill tone="g">{property.vacant_beds} beds vacant now</Pill>
            )}
            {reserved > 0 && <Pill tone="a">{reserved} reserved</Pill>}
            {property.vacant_beds === 0 && reserved === 0 && <Pill tone="g">Full house</Pill>}
          </>
        )}
      </div>

      {/* stat grid */}
      {!isEmpty && (
        <div className="grid grid-cols-3 border-t border-[#e9edf4]">
          {[
            ['Total beds', String(property.total_beds), ''],
            [
              'Occupied',
              String(property.occupied_beds),
              reserved > 0 ? `incl. ${reserved} reserved` : '',
            ],
            ['Vacant', String(property.vacant_beds), 'sellable today'],
          ].map(([label, value, foot]) => (
            <div key={label} className="border-b border-[#e9edf4] px-4 py-2.5 last:border-b-0">
              <div className="text-[11px] font-semibold text-[#98a0ad]">{label}</div>
              <div className="tnum text-[15.5px] font-extrabold">{value}</div>
              {foot && <div className="text-[11px] text-[#98a0ad]">{foot}</div>}
            </div>
          ))}
        </div>
      )}

      {/* actions */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg font-bold"
          onClick={() => onEdit(property.id)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          className="ml-auto gap-1 rounded-lg font-bold"
          onClick={() => navigate(`/properties/${property.id}`)}
        >
          Open
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function PropertiesPage() {
  const { data, isLoading } = useProperties();
  const [showCreate, setShowCreate] = useState(false);
  const [setupId, setSetupId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-[1220px]">
      <PageHeader
        title="Properties"
        sub={`${data?.total ?? 0} ${data?.total === 1 ? 'property' : 'properties'} in your account`}
        actions={
          <Button className="gap-2 rounded-xl font-bold" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Add Property
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3.5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-bold">No properties yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first property to start managing rooms and tenants.
          </p>
          <Button className="mt-4 gap-2 rounded-xl font-bold" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Add your first property
          </Button>
        </div>
      ) : (
        <div className="grid items-start gap-3.5 lg:grid-cols-2">
          {data?.items.map((p) => (
            <PropertyCard key={p.id} property={p} onEdit={setSetupId} />
          ))}
          {/* add-next placeholder from the mock */}
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-[#98a0ad]">
            <div className="text-[26px]">＋</div>
            <div className="text-[13px] font-bold text-muted-foreground">
              Add your next property
            </div>
            <p className="max-w-[260px] text-[11px] font-semibold">
              With 2+ properties this page becomes a comparison — occupancy, collection % and
              profit side by side.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 rounded-lg font-bold"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add property
            </Button>
          </div>
        </div>
      )}

      <CreatePropertyDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => setSetupId(id)}
      />

      {setupId && (
        <PropertySetupDialog
          open={!!setupId}
          onClose={() => setSetupId(null)}
          propertyId={setupId}
        />
      )}
    </div>
  );
}
