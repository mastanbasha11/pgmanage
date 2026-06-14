/**
 * More — grid of secondary destinations.
 */
import { Link } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  Gift,
  HeartPulse,
  HelpCircle,
  LogOut,
  Megaphone,
  MessageCircle,
  Settings,
  Sparkles,
  User,
  Users,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { useTenantNotifications, useTenantProfile } from '@/lib/tenant-data/hooks';

import { PageHeader, SectionHeader, StatusPill } from './_shared';

interface Item {
  to: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export default function MoreScreen() {
  const profileQ = useTenantProfile();
  const notifQ = useTenantNotifications();
  const unread = (notifQ.data ?? []).filter((n) => !n.read).length;
  const p = profileQ.data;

  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Stay',
      items: [
        { to: '/portal/visitors', label: 'Visitors', icon: Users },
        { to: '/portal/safety', label: 'Safety', icon: HeartPulse },
        { to: '/portal/notice', label: 'Notice to vacate', icon: LogOut },
      ],
    },
    {
      title: 'Community',
      items: [
        { to: '/portal/community', label: 'Community', icon: Sparkles },
        { to: '/portal/referral', label: 'Refer & earn', icon: Gift },
      ],
    },
    {
      title: 'Updates',
      items: [
        { to: '/portal/notifications', label: 'Notifications', icon: Bell, badge: unread },
        { to: '/portal/notices', label: 'Notices', icon: Megaphone },
      ],
    },
    {
      title: 'Help',
      items: [
        { to: '/portal/support', label: 'Support', icon: HelpCircle },
        { to: '/portal/feedback', label: 'Feedback', icon: MessageCircle },
      ],
    },
    {
      title: 'You',
      items: [
        { to: '/portal/profile', label: 'Profile', icon: User },
        { to: '/portal/settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  return (
    <div>
      <PageHeader title="More" />

      {p ? (
        <Link to="/portal/profile">
          <Card className="mb-6 border-accent/30 bg-accent/[0.04] hover:bg-accent/[0.06]">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-accent/20 text-base font-bold text-accent">
                {p.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate font-bold">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.property.name} · Room {p.room.roomNumber}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ) : null}

      {groups.map((g) => (
        <div key={g.title}>
          <SectionHeader title={g.title} />
          <Card>
            <CardContent className="divide-y p-0">
              {g.items.map((it) => {
                const Icon = it.icon;
                return (
                  <Link
                    key={it.label}
                    to={it.to}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-sm font-semibold">{it.label}</span>
                    {it.badge && it.badge > 0 ? (
                      <StatusPill label={String(it.badge)} tone="danger" />
                    ) : null}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
