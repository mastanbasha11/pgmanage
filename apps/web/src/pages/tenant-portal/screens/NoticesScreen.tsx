import { format, parseISO } from 'date-fns';
import { Megaphone } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { useTenantNotices } from '@/lib/tenant-data/hooks';

import { EmptyState, PageHeader, SkeletonLines, StatusPill } from './_shared';

export default function NoticesScreen() {
  const noticesQ = useTenantNotices();
  const items = noticesQ.data ?? [];

  return (
    <div>
      <PageHeader title="Notices" />
      {noticesQ.isLoading ? (
        <SkeletonLines count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-6 w-6" />} title="No notices" />
      ) : (
        <div className="grid gap-3">
          {items.map((n) => (
            <Card key={n.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{n.title}</p>
                    {n.pinned ? <StatusPill label="Pinned" tone="warning" /> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {format(parseISO(n.publishedAt), 'd MMM yyyy')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
