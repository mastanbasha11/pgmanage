import {
  IndianRupee,
  BedDouble,
  TrendingUp,
  AlertCircle,
  BarChart3,
  Building2,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  Users,
  Wallet,
  Zap,
  PiggyBank,
  CalendarRange,
} from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CashflowChart } from '@/components/charts/CashflowChart';
import PaybackChart from '@/components/charts/PaybackChart';
import FollowupsDueToday from './FollowupsDueToday';
import { usePaybackPlan } from '@/hooks/usePaybackPlan';
import { useDashboardSummary, useCashflow } from '@/hooks/useDashboard';
import { useProperties } from '@/hooks/useProperties';
import { useAuthStore } from '@/store/auth';
import { formatPaise, currentMonthYear, monthName } from '@/lib/utils';
import { cn } from '@/lib/utils';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: monthName(i + 1),
}));
const NOW_YEAR = new Date().getFullYear();
const YEARS = [NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1];
import { Link, Navigate, useNavigate } from 'react-router-dom';

function KPICard({
  title,
  value,
  sub,
  icon: Icon,
  className,
  tone = 'default',
  onClick,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  className?: string;
  tone?: 'default' | 'income' | 'expense' | 'profit';
  onClick?: () => void;
}) {
  const chipClass =
    tone === 'income'
      ? 'bg-emerald-500/15 text-emerald-700'
      : tone === 'expense'
      ? 'bg-rose-500/15 text-rose-700'
      : tone === 'profit'
      ? 'bg-slate-900/10 text-slate-900'
      : 'bg-accent/10 text-accent';
  return (
    <Card
      className={cn(
        className,
        onClick && 'cursor-pointer transition-colors hover:border-accent',
      )}
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={cn('rounded-lg p-2.5', chipClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { selectedPropertyId, canAccessFinancials, user } = useAuthStore();
  const navigate = useNavigate();
  const cmy = currentMonthYear();
  const [month, setMonth] = useState(cmy.month);
  const [year, setYear] = useState(cmy.year);

  if (!canAccessFinancials()) {
    // Marketing reps land on the leads pipeline — that's their day-1 view.
    // Everyone else without financial access (supervisors / managers)
    // continues to land on tenants, unchanged.
    return <Navigate to={user?.role === 'MARKETING' ? '/leads' : '/tenants'} replace />;
  }

  const { data: propertiesData, isLoading: loadingProps } = useProperties();
  const { data: summary, isLoading } = useDashboardSummary(
    selectedPropertyId ?? undefined,
    month,
    year,
  );
  const { data: cashflow } = useCashflow(selectedPropertyId ?? undefined);
  const { data: paybackPlan } = usePaybackPlan(selectedPropertyId ?? undefined);

  // No properties yet → push owner to create one.
  if (!loadingProps && (propertiesData?.items.length ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <Building2 className="h-6 w-6 text-accent" />
        </div>
        <h2 className="text-lg font-semibold">Welcome to PGManage</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Create your first property to start managing rooms, tenants and rent collection.
        </p>
        <Button asChild className="mt-4 gap-2">
          <Link to="/properties">
            <Plus className="h-4 w-4" />
            Add your first property
          </Link>
        </Button>
      </div>
    );
  }

  // Properties exist but none selected yet — Layout will auto-select shortly.
  if (!selectedPropertyId || loadingProps) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (isLoading || !summary) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const collectionPct = Math.round(summary.collection_rate * 100);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Financial overview for {MONTHS.find((m) => m.value === month)?.label} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Money in — green tinted band. Everything that landed as cash this period. */}
      <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            Money received
          </h2>
          <p className="text-lg font-bold tabular-nums text-emerald-900">
            {formatPaise(
              summary.total_received_paise ??
                (summary.opening_balance_paise ?? 0) +
                  (summary.collected_rent_paise ?? 0) +
                  (summary.advance_received_paise ?? 0) +
                  (summary.power_received_paise ?? 0),
            )}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KPICard
            title="Opening Balance"
            value={formatPaise(summary.opening_balance_paise ?? 0)}
            sub="Carry-forward"
            icon={PiggyBank}
            tone="income"
          />
          <KPICard
            title="Rent"
            value={formatPaise(
              summary.rent_only_paise ??
                (summary.collected_rent_paise ?? summary.rent_collected_paise ?? 0)
                - (summary.daily_stays_paise ?? 0),
            )}
            sub={`of ${formatPaise(
              summary.expected_rent_paise ?? summary.gross_rent_expected_paise ?? 0,
            )} expected`}
            icon={IndianRupee}
            tone="income"
          />
          <KPICard
            title="Advance Received"
            value={formatPaise(summary.advance_received_paise ?? 0)}
            sub="Deposits + advance bookings"
            icon={ArrowDownToLine}
            tone="income"
          />
          <KPICard
            title="Daily Stays"
            value={formatPaise(summary.daily_stays_paise ?? 0)}
            sub="Daily-stay bookings"
            icon={CalendarRange}
            tone="income"
          />
          <KPICard
            title="Power Meters"
            value={formatPaise(summary.power_received_paise ?? 0)}
            sub="Prepaid recharges"
            icon={Zap}
            tone="income"
          />
        </div>
      </section>

      {/* Money out — red tinted band. */}
      <section className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-800">
            Money spent
          </h2>
          <p className="text-lg font-bold tabular-nums text-rose-900">
            {formatPaise(
              summary.total_given_paise ??
                (summary.total_expenses_paise + (summary.refunds_given_paise ?? 0)),
            )}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KPICard
            title="Total Expenses"
            value={formatPaise(summary.total_expenses_paise)}
            sub="approved this month"
            icon={Receipt}
            tone="expense"
          />
          <KPICard
            title="Refunds Given"
            value={formatPaise(summary.refunds_given_paise ?? 0)}
            sub="security deposit refunds"
            icon={ArrowUpFromLine}
            tone="expense"
          />
          <KPICard
            title="Total Spent"
            value={formatPaise(
              summary.total_given_paise ??
                (summary.total_expenses_paise + (summary.refunds_given_paise ?? 0)),
            )}
            sub="Expenses + Refunds"
            icon={ArrowUpFromLine}
            tone="expense"
          />
        </div>
      </section>

      {/* Bottom line + operations. Profit is Received − Spent. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="Profit"
          value={formatPaise(summary.net_income_paise)}
          sub="Received − Spent"
          icon={TrendingUp}
          tone="profit"
          className="border-slate-300"
        />
        <KPICard
          title="Outstanding"
          value={formatPaise(summary.outstanding_paise)}
          sub={`${collectionPct}% collection rate`}
          icon={AlertCircle}
          className={summary.outstanding_paise > 0 ? 'border-amber-200' : ''}
        />
        <KPICard
          title="Occupancy"
          value={`${Math.round(summary.occupancy_rate * 100)}%`}
          sub={`${summary.total_tenants ?? summary.active_tenants ?? 0} tenants`}
          icon={BedDouble}
        />
        <KPICard
          title="Vacant Beds"
          value={`${summary.vacant_beds ?? 0}`}
          sub={`of ${summary.total_beds ?? 0} · click to view`}
          icon={Building2}
          onClick={() =>
            selectedPropertyId && navigate(`/properties/${selectedPropertyId}`)
          }
        />
      </div>

      {(summary.owner_profits?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" />
              Owner profit split
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Profit ({formatPaise(summary.net_income_paise)}) split by the
              share % configured in Properties → Team &amp; Owners.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {summary.owner_profits!.map((o) => (
                <div
                  key={o.name}
                  className={
                    o.name === 'Unassigned'
                      ? 'flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2'
                      : 'flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2'
                  }
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{o.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {o.share_pct}% share
                    </p>
                  </div>
                  <p
                    className={
                      o.share_paise < 0
                        ? 'font-semibold tabular-nums text-rose-700'
                        : 'font-semibold tabular-nums'
                    }
                  >
                    {formatPaise(o.share_paise)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CRM: today's rep worklist. Renders nothing when there are no leads
          with next_followup_at = today, so the dashboard stays tidy when the
          pipeline is quiet. */}
      <FollowupsDueToday propertyId={selectedPropertyId ?? undefined} />

      {(summary.top_recurring_spikes?.length ?? 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900">
              <TrendingUp className="h-4 w-4" />
              Recurring items — spending up vs previous month
            </CardTitle>
            <p className="text-xs text-amber-800/70">
              Buckets matched from expense descriptions where this period is up
              at least ₹500 and 50% vs the previous same-length window. Drill
              into <Link to="/expenses" className="underline">Expenses</Link>{' '}
              for the receipts.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {summary.top_recurring_spikes!.map((s) => (
                <div
                  key={s.item}
                  className="flex items-center justify-between rounded-md border border-amber-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.item}</p>
                    <p className="text-[11px] text-muted-foreground">
                      was {formatPaise(s.previous_paise)} →{' '}
                      <span className="text-rose-700 font-semibold">
                        {formatPaise(s.current_paise)}
                      </span>
                    </p>
                  </div>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 whitespace-nowrap">
                    {s.pct_change != null ? `▲ ${Math.round(s.pct_change)}%` : 'new'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Income vs Expenses (12 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cashflow?.items?.length ? (
              <CashflowChart data={cashflow.items} />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No cashflow data yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-accent"
          onClick={() => navigate('/roi')}
        >
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              ROI Payback trajectory
              <span className="text-[10px] font-medium text-muted-foreground">
                click to open plan
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paybackPlan?.configured && paybackPlan.calc ? (
              <PaybackChart data={paybackPlan} compact />
            ) : (
              <div
                className="flex h-64 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/roi');
                }}
              >
                <p>No payback plan configured yet.</p>
                <p className="text-xs">
                  Set one up on the ROI page — investment, target horizon,
                  grace, and lessor rent.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cash in by person */}
      {(summary.cash_in_by_person?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-accent" />
              Cash collected by person
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Rent, advance, and booking payments — by who actually received the money.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {summary.cash_in_by_person!.map((p) => (
                <div
                  key={p.person}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.person}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.count} {p.count === 1 ? 'collection' : 'collections'}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">
                    {formatPaise(p.total_paise)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expenses by person panel */}
      {(summary.expenses_by_person?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" />
              Expenses by person
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {summary.expenses_by_person!.map((p) => (
                <div
                  key={p.person}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.person}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.count} {p.count === 1 ? 'expense' : 'expenses'}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">
                    {formatPaise(p.total_paise)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overdue tenants */}
      {summary.overdue_tenants > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 pt-4">
            <AlertCircle className="h-5 w-5 text-amber-700 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              <span className="font-semibold">{summary.overdue_tenants} tenants</span> have
              overdue rent.{' '}
              <Link to="/rent" className="font-medium underline hover:no-underline">
                Open rent &amp; payments
              </Link>{' '}
              to follow up.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
