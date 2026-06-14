import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTenantProfile } from '@/lib/tenant-data/hooks';

import { Money, PageHeader, SectionHeader, SkeletonLines, StatusPill } from './_shared';

export default function ProfileScreen() {
  const profileQ = useTenantProfile();
  const p = profileQ.data;

  if (!p) {
    return (
      <div>
        <PageHeader title="Profile" />
        <SkeletonLines count={6} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Profile" />

      <Card className="mb-4">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-2xl font-bold text-accent-foreground">
            {p.name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-extrabold">{p.name}</p>
            <p className="truncate text-sm text-muted-foreground">{p.phone}</p>
            {!p.kycComplete ? (
              <StatusPill label="Profile incomplete" tone="warning" className="mt-1" />
            ) : null}
          </div>
          <Link to="/portal/profile/edit">
            <Button size="sm" className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
        </CardContent>
      </Card>

      <SectionHeader title="Your stay" />
      <Card>
        <CardContent className="grid gap-2 p-4 text-sm">
          <Row label="Property" value={p.property.name || '—'} />
          <Row label="Address" value={p.property.addressLine || '—'} />
          <Row
            label="Room"
            value={`${p.room.roomNumber || '—'} · Bed ${p.room.bedLabel || '—'}`}
          />
          <Row
            label="Move-in"
            value={
              p.lease.startDate ? format(parseISO(p.lease.startDate), 'd MMM yyyy') : '—'
            }
          />
          {p.lease.expectedEndDate ? (
            <Row
              label="Expected move-out"
              value={format(parseISO(p.lease.expectedEndDate), 'd MMM yyyy')}
            />
          ) : null}
        </CardContent>
      </Card>

      <SectionHeader title="Vehicle" />
      <Card>
        <CardContent className="p-4 text-sm">
          {p.vehicle.type === 'NONE' ? (
            <p className="text-muted-foreground">
              You haven't added a vehicle. Add one so gate security recognises you.
            </p>
          ) : (
            <div className="grid gap-2">
              <Row
                label="Type"
                value={p.vehicle.type === 'TWO_WHEELER' ? 'Two-wheeler' : 'Four-wheeler'}
              />
              <Row label="Registration" value={p.vehicle.registration ?? '—'} />
            </div>
          )}
        </CardContent>
      </Card>

      <SectionHeader title="Emergency contact" />
      <Card>
        <CardContent className="p-4 text-sm">
          {p.emergency ? (
            <div className="grid gap-2">
              <Row label="Name" value={p.emergency.name} />
              <Row label="Phone" value={p.emergency.phone} />
              <Row label="Relation" value={p.emergency.relation} />
            </div>
          ) : (
            <p className="text-muted-foreground">
              Add an emergency contact so we can reach someone if needed.
            </p>
          )}
        </CardContent>
      </Card>

      {p.walletBalancePaise > 0 ? (
        <>
          <SectionHeader title="Wallet" />
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <p className="text-sm text-muted-foreground">Wallet credit available</p>
              <Money paise={p.walletBalancePaise} size="lg" />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
