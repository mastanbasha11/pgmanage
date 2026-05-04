import { useState } from 'react';
import { Building2, Plus, BedDouble, Users, Settings, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProperties, type Property } from '@/hooks/useProperties';
import CreatePropertyDialog from './CreatePropertyDialog';
import PropertySetupDialog from './PropertySetupDialog';

function PropertyCard({
  property,
  onConfigure,
}: {
  property: Property;
  onConfigure: (id: string) => void;
}) {
  const navigate = useNavigate();
  const occupancyPct = property.total_beds
    ? Math.round((property.occupied_beds / property.total_beds) * 100)
    : 0;
  const isEmpty = property.total_beds === 0;

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent/10 p-2 text-accent">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">{property.name}</h3>
              <p className="text-xs text-muted-foreground">
                {property.city}
                {property.state ? `, ${property.state}` : ''}
              </p>
            </div>
          </div>
          {!isEmpty && (
            <Badge
              variant={
                occupancyPct >= 80 ? 'default' : occupancyPct >= 50 ? 'secondary' : 'outline'
              }
            >
              {occupancyPct}% occupied
            </Badge>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md bg-muted/50 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BedDouble className="h-3 w-3" />
              Beds
            </div>
            <p className="mt-0.5 font-semibold tabular-nums">
              {property.occupied_beds}/{property.total_beds}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              Tenants
            </div>
            <p className="mt-0.5 font-semibold tabular-nums">{property.occupied_beds}</p>
          </div>
        </div>

        {isEmpty && (
          <p className="mt-3 rounded border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No rooms yet — configure floors &amp; rooms to start using this property.
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onConfigure(property.id)}
          >
            <Settings className="h-4 w-4 mr-1" />
            Configure
          </Button>
          <Button
            size="sm"
            className="w-full"
            onClick={() => navigate(`/properties/${property.id}`)}
          >
            Open
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PropertiesPage() {
  const { data, isLoading } = useProperties();
  const [showCreate, setShowCreate] = useState(false);
  const [setupId, setSetupId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} properties in your account
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Add Property
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">No properties yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first property to start managing rooms and tenants.
          </p>
          <Button className="mt-4 gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Add your first property
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((p) => (
            <PropertyCard key={p.id} property={p} onConfigure={setSetupId} />
          ))}
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
