/**
 * Home dashboard — same anatomy as the native app's Home tab, web-ified.
 *
 *   - Greeting row + (optional) referral promo
 *   - KYC nudge card when profile.kycComplete === false
 *   - Hero rent card with Quick Pay
 *   - Today's meals strip (empty until meals system ships)
 *   - Quick actions row
 *   - Open tickets summary
 *   - Pinned notice banner
 */
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  Calendar,
  Coffee,
  Gift,
  LogOut,
  Megaphone,
  UserPlus,
  Utensils,
  Wrench,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useTenantDues,
  useTenantNotices,
  useTenantProfile,
  useTenantReferralSummary,
  useTenantTickets,
} from '@/lib/tenant-data/hooks';

import { Money, SectionHeader, SkeletonLines, StatusPill } from './_shared';

export default function HomeScreen() {
  const navigate = useNavigate();
  const profileQ = useTenantProfile();
  const duesQ = useTenantDues();
  const ticketsQ = useTenantTickets();
  const noticesQ = useTenantNotices();
  const referralQ = useTenantReferralSummary();

  const profile = profileQ.data;
  const dues = duesQ.data;
  const tickets = ticketsQ.data ?? [];
  const notices = noticesQ.data ?? [];
  const summary = referralQ.data;

  const openTickets = tickets.filter((t) => t.status !== 'resolved');
  const pinned = notices.find((n) => n.pinned) ?? notices[0];

  return (
    <div>
      {/* Greeting */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Hi, {profile?.name?.split(' ')[0] ?? 'there'}
          </h1>
          {profile ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.property.name} · Room {profile.room.roomNumber} · Bed{' '}
              {profile.room.bedLabel}
            </p>
          ) : null}
        </div>
        {summary && summary.bonusPerMoveInPaise > 0 ? (
          <Link
            to="/portal/referral"
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100"
          >
            <Gift className="h-3.5 w-3.5" />
            Earn ₹{Math.round(summary.bonusPerMoveInPaise / 100).toLocaleString('en-IN')}
          </Link>
        ) : null}
      </div>

      {/* KYC nudge */}
      {profile && !profile.kycComplete ? (
        <Card className="mb-5 border-accent/30 bg-accent/5">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent/15 text-accent">
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Complete your profile</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Add an emergency contact and your vehicle so gate security recognises you.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => navigate('/portal/profile/edit')}>
                  Complete now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Hero rent card */}
      <RentHero loading={duesQ.isLoading} dues={dues} onPay={() => navigate('/portal/pay')} />

      {/* Today's meals — empty until meals system ships */}
      <SectionHeader title="Today's meals" />
      <div className="grid grid-cols-3 gap-3">
        {(['breakfast', 'lunch', 'dinner'] as const).map((slot) => (
          <Link
            key={slot}
            to="/portal/food"
            className="rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
              {slot === 'breakfast' ? (
                <Coffee className="h-3.5 w-3.5" />
              ) : (
                <Utensils className="h-3.5 w-3.5" />
              )}
            </div>
            <p className="mt-2 text-sm font-semibold capitalize">{slot}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">—</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <SectionHeader title="Quick actions" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction
          to="/portal/services/new"
          label="Raise issue"
          icon={<Wrench className="h-4 w-4" />}
        />
        <QuickAction
          to="/portal/visitors"
          label="Invite guest"
          icon={<UserPlus className="h-4 w-4" />}
        />
        <QuickAction
          to="/portal/food"
          label="View menu"
          icon={<Utensils className="h-4 w-4" />}
        />
        <QuickAction
          to="/portal/notice"
          label="Give notice"
          icon={<LogOut className="h-4 w-4" />}
        />
      </div>

      {/* Open tickets */}
      {openTickets.length > 0 ? (
        <>
          <SectionHeader
            title="Open tickets"
            action={
              <Link to="/portal/services" className="text-xs font-semibold text-accent">
                See all
              </Link>
            }
          />
          <Card>
            <CardContent className="divide-y p-0">
              {openTickets.slice(0, 2).map((t) => (
                <Link
                  key={t.id}
                  to={`/portal/services/tickets/${t.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-muted">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.category.replace(/_/g, ' ')} · raised{' '}
                      {format(parseISO(t.createdAt), 'd MMM')}
                    </p>
                  </div>
                  <StatusPill label={t.status.replace(/_/g, ' ')} tone="info" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Notice banner */}
      {pinned ? (
        <Card
          className="mt-6 border-amber-200 bg-amber-50 cursor-pointer"
          onClick={() => navigate('/portal/notices')}
        >
          <CardContent className="flex items-start gap-3 p-4">
            <Megaphone className="mt-0.5 h-5 w-5 flex-none text-amber-700" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {pinned.pinned ? <StatusPill label="Pinned" tone="warning" /> : null}
                <p className="truncate font-semibold">{pinned.title}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{pinned.body}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {duesQ.isLoading && profileQ.isLoading ? <SkeletonLines /> : null}
    </div>
  );
}

function RentHero({
  loading,
  dues,
  onPay,
}: {
  loading: boolean;
  dues: ReturnType<typeof useTenantDues>['data'];
  onPay: () => void;
}) {
  if (loading || !dues) {
    return (
      <Card className="mb-2">
        <CardContent className="p-5">
          <SkeletonLines count={3} />
        </CardContent>
      </Card>
    );
  }
  const paid = dues.status === 'paid';
  return (
    <Card className="mb-2 border-accent/30 bg-gradient-to-br from-accent/5 to-transparent shadow-md">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {dues.monthLabel} rent
          </p>
          <StatusPill
            label={paid ? 'Paid' : dues.daysUntilDue < 0 ? 'Overdue' : 'Due'}
            tone={paid ? 'success' : dues.daysUntilDue < 0 ? 'danger' : 'warning'}
          />
        </div>

        {paid ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              ✓
            </span>
            <span className="text-2xl font-bold">All paid for this month</span>
          </div>
        ) : (
          <>
            <Money paise={dues.totalPaise} size="hero" className="mt-2 block" />
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Due {format(parseISO(dues.dueDate), 'd MMM yyyy')} ·{' '}
              {dues.daysUntilDue >= 0
                ? `${dues.daysUntilDue} day${dues.daysUntilDue === 1 ? '' : 's'} left`
                : `${Math.abs(dues.daysUntilDue)} day${
                    Math.abs(dues.daysUntilDue) === 1 ? '' : 's'
                  } overdue`}
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={onPay}>Quick Pay</Button>
              <Button variant="outline" onClick={onPay}>
                View details
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuickAction({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent/10 text-accent">
        {icon}
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}
