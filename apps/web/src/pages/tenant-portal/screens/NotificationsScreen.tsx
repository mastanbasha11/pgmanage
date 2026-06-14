import { useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  BellOff,
  Calendar,
  CheckCircle,
  CreditCard,
  Gift,
  Info,
  Megaphone,
  UserPlus,
  Utensils,
  Wrench,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { useTenantNotifications } from '@/lib/tenant-data/hooks';
import type { NotificationKind } from '@/lib/tenant-data/types';

import { EmptyState, PageHeader, SkeletonLines } from './_shared';

const ICON: Record<NotificationKind, React.ElementType> = {
  rent_due: CreditCard,
  rent_paid: CheckCircle,
  ticket_update: Wrench,
  referral_credit: Gift,
  event: Calendar,
  notice: Megaphone,
  visitor: UserPlus,
  food: Utensils,
};

export default function NotificationsScreen() {
  const notifQ = useTenantNotifications();
  const [localRead, setLocalRead] = useState<Record<string, true>>({});

  const items = (notifQ.data ?? []).map((n) => ({
    ...n,
    read: n.read || !!localRead[n.id],
  }));

  return (
    <div>
      <PageHeader title="Notifications" />
      {notifQ.isLoading ? (
        <SkeletonLines count={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-6 w-6" />}
          title="All caught up"
          message="You don't have any notifications right now."
        />
      ) : (
        <div className="grid gap-2">
          {items.map((n) => {
            const Icon = ICON[n.kind] ?? Info;
            return (
              <Card
                key={n.id}
                className={n.read ? '' : 'border-accent/30 bg-accent/[0.04]'}
              >
                <CardContent
                  className="flex items-start gap-3 p-4 cursor-pointer"
                  onClick={() => setLocalRead((m) => ({ ...m, [n.id]: true }))}
                >
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{n.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDistanceToNow(parseISO(n.at))} ago
                    </p>
                  </div>
                  {!n.read ? (
                    <span className="mt-2 h-2 w-2 flex-none rounded-full bg-accent" />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
