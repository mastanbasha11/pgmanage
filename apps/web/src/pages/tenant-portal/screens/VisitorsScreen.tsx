/**
 * Visitors — empty state for now (backend is the stub `[]` endpoint).
 * Invite flow generates a local code as a UX preview until the visitors
 * backend ships.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { QrCode, UserPlus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { useTenantVisitors } from '@/lib/tenant-data/hooks';
import type { Visitor } from '@/lib/tenant-data/types';

import { EmptyState, PageHeader, SectionHeader, SkeletonLines, StatusPill, type PillTone } from './_shared';

const STATUS_TONE: Record<Visitor['status'], PillTone> = {
  pending: 'warning',
  arrived: 'info',
  left: 'success',
  expired: 'neutral',
  denied: 'danger',
};

export default function VisitorsScreen() {
  const visitorsQ = useTenantVisitors();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [inviting, setInviting] = useState(false);

  function invite() {
    if (name.trim().length < 2) {
      toast({ title: 'Tell us who is visiting', variant: 'destructive' });
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    toast({ title: `Gate pass code`, description: code });
    setName('');
    setPurpose('');
    setInviting(false);
  }

  const items = visitorsQ.data ?? [];

  return (
    <div>
      <PageHeader
        title="Guests & visitors"
        subtitle="Invite friends or family — they'll get a gate pass code."
      />

      {!inviting ? (
        <Button onClick={() => setInviting(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite a guest
        </Button>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <Label>Guest name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya Mehta" />
            </div>
            <div>
              <Label>Purpose (optional)</Label>
              <Input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. friend visiting"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setInviting(false)}>
                Cancel
              </Button>
              <Button onClick={invite} className="gap-2">
                <QrCode className="h-4 w-4" />
                Generate pass
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <SectionHeader title="Visitor history" />
      {visitorsQ.isLoading ? (
        <SkeletonLines count={2} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No visitors yet"
          message="Invites you create will show up here."
        />
      ) : (
        <div className="grid gap-3">
          {items.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-bold">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.purpose ?? '—'} · {format(parseISO(v.expectedAt), 'd MMM, h:mm a')}
                  </p>
                  <p className="mt-1 text-[11px] tracking-widest text-muted-foreground">
                    Code · {v.passCode}
                  </p>
                </div>
                <StatusPill label={v.status} tone={STATUS_TONE[v.status]} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
