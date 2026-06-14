import { format, parseISO } from 'date-fns';
import { Calendar, Tag, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import {
  useTenantEvents,
  useTenantPartnerOffers,
  useTenantResidentDirectory,
} from '@/lib/tenant-data/hooks';

import { EmptyState, PageHeader, SectionHeader, SkeletonLines, StatusPill } from './_shared';

export default function CommunityScreen() {
  const eventsQ = useTenantEvents();
  const residentsQ = useTenantResidentDirectory();
  const partnersQ = useTenantPartnerOffers();
  const { toast } = useToast();

  return (
    <div>
      <PageHeader title="Community" />

      <SectionHeader title="Upcoming events" />
      {eventsQ.isLoading ? (
        <SkeletonLines count={2} />
      ) : (eventsQ.data ?? []).length === 0 ? (
        <EmptyState icon={<Calendar className="h-6 w-6" />} title="No events scheduled" />
      ) : (
        <div className="grid gap-3">
          {(eventsQ.data ?? []).map((e) => (
            <Card key={e.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(e.startsAt), 'EEE, d MMM · h:mm a')} · {e.location}
                    </p>
                    {e.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {e.attendeeCount} going
                      </span>
                      <Button
                        size="sm"
                        variant={e.rsvpd ? 'outline' : 'default'}
                        onClick={() =>
                          toast({ title: e.rsvpd ? 'RSVP removed' : "You're going" })
                        }
                      >
                        {e.rsvpd ? 'Going' : 'RSVP'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SectionHeader title="Your neighbours" subtitle="Say hi" />
      {residentsQ.isLoading ? (
        <SkeletonLines count={2} />
      ) : (residentsQ.data ?? []).length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="Directory not set up yet" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(residentsQ.data ?? []).map((r) => (
            <Card key={r.id} className="bg-muted/40">
              <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold">
                  {r.name[0]?.toUpperCase()}
                </div>
                <p className="text-sm font-bold">{r.name}</p>
                {r.bio ? <p className="text-[11px] text-muted-foreground">{r.bio}</p> : null}
                {r.interests.length ? (
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    {r.interests.slice(0, 2).map((i) => (
                      <StatusPill key={i} label={i} tone="accent" />
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SectionHeader title="Resident perks" subtitle="Partner discounts" />
      {partnersQ.isLoading ? (
        <SkeletonLines count={2} />
      ) : (partnersQ.data ?? []).length === 0 ? (
        <EmptyState icon={<Tag className="h-6 w-6" />} title="No partner offers yet" />
      ) : (
        <div className="grid gap-3">
          {(partnersQ.data ?? []).map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                  <Tag className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{p.partnerName}</p>
                    <StatusPill label={p.category} tone="accent" />
                  </div>
                  <p className="mt-1 font-bold text-violet-700">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
