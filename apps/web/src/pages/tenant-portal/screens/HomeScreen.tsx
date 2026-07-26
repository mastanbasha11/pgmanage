/**
 * Home — the resident dashboard, restructured to the pgmanageresidentweb
 * reference: a two-column layout with the forest rent-anchor card, quick
 * actions, open requests and a notice on the left; the room card, this week's
 * menu, security deposit and Wi-Fi on the right. Everything is wired to the
 * tenant API with graceful fallbacks.
 */
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  Bed,
  Download,
  Hourglass,
  Megaphone,
  Plus,
  Receipt,
  Sparkles,
  Ticket,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  useTenantDepositInfo,
  useTenantDues,
  useTenantNotices,
  useTenantProfile,
  useTenantTickets,
} from '@/lib/tenant-data/hooks';

function inr(paise: number | null | undefined): string {
  const n = Number(paise);
  return '₹' + Math.round((Number.isFinite(n) ? n : 0) / 100).toLocaleString('en-IN');
}

const SHARING: Record<string, string> = {
  single: 'Single occupancy',
  twin: '2-Share',
  triple: '3-Share',
  quad: '4-Share',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const profile = useTenantProfile().data;
  const dues = useTenantDues().data;
  const deposit = useTenantDepositInfo().data;
  const tickets = useTenantTickets().data ?? [];
  const notices = useTenantNotices().data ?? [];

  const firstName = profile?.name?.split(' ')[0] ?? 'there';
  const openTickets = tickets.filter((t) => t.status !== 'resolved');
  const pinned = notices.find((n) => n.pinned) ?? notices[0];
  const rentPaise =
    dues?.lines?.find((l) => l.kind === 'rent')?.amountPaise ?? dues?.totalPaise ?? 0;
  const paid = dues?.status === 'paid';

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(new Date(), 'EEEE, d MMMM yyyy')}
            {paid ? ' · everything below is up to date.' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => navigate('/portal/services/new')}>
            <Plus className="h-4 w-4" /> Raise a request
          </Button>
          <Button className="gap-1.5" onClick={() => navigate('/portal/pay')}>
            <Wallet className="h-4 w-4" /> Pay rent
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* ── Left column ── */}
        <div className="space-y-4">
          {/* Rent anchor */}
          <div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary-foreground/70">
                Rent for {dues?.monthLabel ?? 'this month'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">
                <Hourglass className="h-3 w-3" />
                {paid
                  ? 'Paid'
                  : dues && dues.daysUntilDue >= 0
                    ? `Due in ${dues.daysUntilDue} days`
                    : dues
                      ? `Overdue ${Math.abs(dues.daysUntilDue)}d`
                      : '—'}
              </span>
            </div>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-4xl font-extrabold tracking-tight">{inr(rentPaise)}</span>
              {dues && !paid && (
                <span className="pb-1 text-sm text-primary-foreground/80">
                  due by {format(parseISO(dues.dueDate), 'd MMM yyyy')}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-primary-foreground/70">
              {profile ? `Room ${profile.room.roomNumber} · Bed ${profile.room.bedLabel} · ` : ''}
              no dues carried forward
            </p>
            <div className="mt-4 flex gap-2">
              {!paid && (
                <Button
                  className="gap-1.5 bg-white text-primary hover:bg-white/90"
                  onClick={() => navigate('/portal/pay')}
                >
                  <Wallet className="h-4 w-4" /> Pay now
                </Button>
              )}
              <Button
                variant="ghost"
                className="gap-1.5 bg-white/10 text-white hover:bg-white/20"
                onClick={() => navigate('/portal/pay')}
              >
                <Receipt className="h-4 w-4" /> Payment history
              </Button>
            </div>
            {paid && (
              <p className="mt-4 border-t border-white/15 pt-3 text-xs text-primary-foreground/80">
                ✓ Every payment on time since you moved in — thank you.
              </p>
            )}
          </div>

          {/* Quick actions */}
          <Panel title="Quick actions" icon={<Sparkles className="h-4 w-4 text-primary" />}>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-4">
              <QuickAction to="/portal/services/new" icon={<Sparkles className="h-5 w-5" />} label="Book a deep clean" />
              <QuickAction to="/portal/visitors" icon={<Ticket className="h-5 w-5" />} label="Guest pass" />
              <QuickAction to="/portal/food" icon={<Utensils className="h-5 w-5" />} label="This week's menu" />
              <QuickAction to="/portal/pay" icon={<Download className="h-5 w-5" />} label="Latest receipt" />
            </div>
          </Panel>

          {/* Open requests */}
          <Panel
            title="Your open requests"
            icon={<Wrench className="h-4 w-4 text-primary" />}
            action={
              openTickets.length > 0 ? (
                <Link to="/portal/services" className="text-xs font-bold text-accent">
                  View all {openTickets.length} ›
                </Link>
              ) : null
            }
          >
            {openTickets.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No open requests — you're all clear.</p>
            ) : (
              <div className="divide-y">
                {openTickets.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    to={`/portal/services/tickets/${t.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
                  >
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-secondary text-primary">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.category.replace(/_/g, ' ')} · raised {format(parseISO(t.createdAt), 'd MMM')}
                      </p>
                    </div>
                    <Pill tone={t.status === 'in_progress' ? 'due' : 'neu'}>
                      {t.status.replace(/_/g, ' ')}
                    </Pill>
                  </Link>
                ))}
              </div>
            )}
            <div className="border-t px-4 py-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/portal/services/new')}>
                <Plus className="h-3.5 w-3.5" /> New request
              </Button>
            </div>
          </Panel>

          {/* Notice */}
          {pinned && (
            <div
              className="cursor-pointer rounded-2xl border bg-card p-5 hover:bg-muted/30"
              onClick={() => navigate('/portal/notices')}
            >
              <div className="flex items-center justify-between">
                <Pill tone="due">
                  <Megaphone className="h-3 w-3" /> Notice
                </Pill>
                {pinned.publishedAt && (
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(pinned.publishedAt), 'd MMM')}
                  </span>
                )}
              </div>
              <p className="mt-2 font-bold">{pinned.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{pinned.body}</p>
              <Button variant="outline" size="sm" className="mt-3">
                Read all notices
              </Button>
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {/* Your room */}
          <Panel
            title="Your room"
            icon={<Bed className="h-4 w-4 text-primary" />}
            action={
              <Link to="/portal/more" className="text-xs font-bold text-accent">
                Details ›
              </Link>
            }
          >
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-secondary text-sm font-extrabold text-primary">
                  {profile?.room.roomNumber ?? '—'}
                </div>
                <div>
                  <p className="font-bold">
                    Room {profile?.room.roomNumber ?? '—'} · Bed {profile?.room.bedLabel ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {SHARING[profile?.room.sharing ?? 'twin'] ?? 'Sharing'}
                    {profile?.room.floor ? ` · ${profile.room.floor} floor` : ''}
                  </p>
                </div>
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                <Row k="Staying since" v={profile?.lease.startDate ? format(parseISO(profile.lease.startDate), 'd MMM yyyy') : '—'} />
                <Row k="Monthly rent" v={inr(rentPaise)} />
              </dl>
            </div>
          </Panel>

          {/* This week's menu */}
          <Panel
            title="Food menu"
            icon={<Utensils className="h-4 w-4 text-primary" />}
            action={
              <Link to="/portal/food" className="text-xs font-bold text-accent">
                Full week ›
              </Link>
            }
          >
            <div className="p-4">
              <p className="text-sm text-muted-foreground">
                Breakfast &amp; dinner daily, lunch on weekends — set by the kitchen.
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => navigate('/portal/food')}>
                <Utensils className="h-3.5 w-3.5" /> View this week's menu
              </Button>
            </div>
          </Panel>

          {/* Security deposit */}
          <Panel title="Security deposit" icon={<Wallet className="h-4 w-4 text-primary" />}>
            <div className="p-4">
              <p className="text-2xl font-extrabold tracking-tight">{inr(deposit?.securityDepositPaise ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Held · refundable after move-out (final after inspection)
              </p>
            </div>
          </Panel>

          {/* Wi-Fi */}
          <Panel title="Wi-Fi" icon={<Wifi className="h-4 w-4 text-primary" />}>
            <div className="flex items-center justify-between p-4">
              <span className="text-sm text-muted-foreground">Included with your stay</span>
              <Pill tone="ok">Complimentary</Pill>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Small building blocks ────────────────────────────────────────────────────

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        {icon}
        <h4 className="text-sm font-bold">{title}</h4>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-2 bg-card px-3 py-4 text-center hover:bg-muted/50">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
        {icon}
      </span>
      <span className="text-xs font-semibold leading-tight">{label}</span>
    </Link>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

type PillTone = 'ok' | 'due' | 'neu';
function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'due'
        ? 'text-[color:var(--apricot-ink)]'
        : 'bg-secondary text-muted-foreground';
  const style = tone === 'due' ? { background: 'var(--apricot-bg)' } : undefined;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${cls}`}
      style={style}
    >
      {children}
    </span>
  );
}
