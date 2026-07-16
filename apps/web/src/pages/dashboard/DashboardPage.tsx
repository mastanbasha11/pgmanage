/**
 * Dashboard — redesigned per Claude UX/dashboard.html.
 *
 * Layout:
 *   1. Hero KPIs      Net profit · Revenue received · Total spent · Occupancy
 *                     (sparklines from the 12-month cashflow / occupancy trends)
 *   2. Money in/out   two cards with per-source sub-tiles + composition bar
 *   3. Operating      six plain-English unit-economics tiles, all computed
 *                     from real summary fields (no invented numbers)
 *   4. Owner split + Recurring spend
 *   5. Charts         Income vs Expenses · ROI payback trajectory
 *   6. Cash collected / Expenses by person (ranked bars)
 *   7. Overdue alert + Followups worklist
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  KpiTile,
  PageHeader,
  Pill,
  RankBars,
  SectionCard,
} from '@/components/ui/redesign';
import { CashflowChart } from '@/components/charts/CashflowChart';
import PaybackChart from '@/components/charts/PaybackChart';
import FollowupsDueToday from './FollowupsDueToday';
import { usePaybackPlan } from '@/hooks/usePaybackPlan';
import { useDashboardSummary, useCashflow, useOccupancyTrend } from '@/hooks/useDashboard';
import { useProperties } from '@/hooks/useProperties';
import { useAuthStore } from '@/store/auth';
import { formatPaise, currentMonthYear, monthName } from '@/lib/utils';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: monthName(i + 1),
}));
const NOW_YEAR = new Date().getFullYear();
const YEARS = [NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1];

const RANK_COLORS = ['#2a78d6', '#1baf7a', '#e87ba4', '#eda100', '#eb6834', '#98a0ad', '#c7ccd6'];

// ── sparkline ────────────────────────────────────────────────────────────────

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 110;
  const h = 42;
  const pad = 4;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rng = mx - mn || 1;
  const X = (i: number) => pad + (i * (w - 2 * pad)) / (data.length - 1);
  const Y = (v: number) => h - pad - ((v - mn) / rng) * (h - 2 * pad - 4);
  const line = data
    .map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${X(data.length - 1)} ${h} L${X(0)} ${h} Z`;
  const id = `sg${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg
      className="pointer-events-none absolute bottom-0 right-0 opacity-90"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── composition bar ─────────────────────────────────────────────────────────

function CompositionBar({ parts }: { parts: { value: number; color: string }[] }) {
  const shown = parts.filter((p) => p.value > 0);
  if (!shown.length) return null;
  return (
    <div className="mt-2.5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-md">
      {shown.map((p, i) => (
        <span key={i} className="h-full rounded-[3px]" style={{ background: p.color, flex: p.value }} />
      ))}
    </div>
  );
}

// ── money sub-tile ──────────────────────────────────────────────────────────

function MoneyCard({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-[#cfd8e6]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-muted-foreground">{label}</div>
          <div className="tnum text-[19px] font-extrabold tracking-tight">{value}</div>
        </div>
        <span className="mt-1 h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      </div>
      <div className="text-[11px] text-[#98a0ad]">{note}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { selectedPropertyId, canAccessFinancials, user } = useAuthStore();
  const navigate = useNavigate();
  const cmy = currentMonthYear();
  const [month, setMonth] = useState(cmy.month);
  const [year, setYear] = useState(cmy.year);

  if (!canAccessFinancials()) {
    return <Navigate to={user?.role === 'MARKETING' ? '/leads' : '/tenants'} replace />;
  }

  const { data: propertiesData, isLoading: loadingProps } = useProperties();
  const { data: summary, isLoading } = useDashboardSummary(
    selectedPropertyId ?? undefined,
    month,
    year,
  );
  const { data: cashflow } = useCashflow(selectedPropertyId ?? undefined);
  const { data: occTrend } = useOccupancyTrend(selectedPropertyId ?? undefined);
  const { data: paybackPlan } = usePaybackPlan(selectedPropertyId ?? undefined);

  if (!loadingProps && (propertiesData?.items.length ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <Building2 className="h-6 w-6 text-accent" />
        </div>
        <h2 className="text-lg font-semibold">Welcome to PGManage</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
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

  if (!selectedPropertyId || loadingProps || isLoading || !summary) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // ── derived numbers (all from real fields) ────────────────────────────────
  const received =
    summary.total_received_paise ??
    (summary.opening_balance_paise ?? 0) +
      (summary.collected_rent_paise ?? 0) +
      (summary.advance_received_paise ?? 0) +
      (summary.power_received_paise ?? 0);
  const spent =
    summary.total_given_paise ??
    summary.total_expenses_paise + (summary.refunds_given_paise ?? 0);
  const rentOnly =
    summary.rent_only_paise ??
    (summary.collected_rent_paise ?? summary.rent_collected_paise ?? 0) -
      (summary.daily_stays_paise ?? 0);
  const profit = summary.net_income_paise;
  const collectionPct = Math.round(summary.collection_rate * 100);
  const occupancyPct = Math.round(summary.occupancy_rate * 100);
  const totalBeds = summary.total_beds ?? 0;
  const vacantBeds = summary.vacant_beds ?? 0;
  const occupiedBeds = totalBeds - vacantBeds; // includes reserved (backend rolls them in)
  const marginPct = received > 0 ? Math.round((profit / received) * 100) : 0;

  // sparkline series from the 12-month trends
  const incomeSpark = (cashflow?.items ?? []).map((p) => p.income_paise);
  const expenseSpark = (cashflow?.items ?? []).map((p) => p.expenses_paise);
  const profitSpark = (cashflow?.items ?? []).map((p) => p.income_paise - p.expenses_paise);
  const occSpark = (occTrend?.items ?? []).map((p) => p.rate * 100);

  const moneyIn = [
    {
      label: 'Rent',
      value: rentOnly,
      note: `of ${formatPaise(summary.expected_rent_paise ?? summary.gross_rent_expected_paise ?? 0)} billed`,
      color: '#2a78d6',
    },
    {
      label: 'Advance received',
      value: summary.advance_received_paise ?? 0,
      note: 'deposits + advance bookings',
      color: '#1baf7a',
    },
    {
      label: 'Daily stays',
      value: summary.daily_stays_paise ?? 0,
      note: 'daily-stay bookings',
      color: '#eda100',
    },
    {
      label: 'Power meters',
      value: summary.power_received_paise ?? 0,
      note: 'prepaid recharges',
      color: '#eb6834',
    },
    {
      label: 'Opening balance',
      value: summary.opening_balance_paise ?? 0,
      note: 'carry-forward',
      color: '#98a0ad',
    },
  ];

  const moneyOut = [
    {
      label: 'Total expenses',
      value: summary.total_expenses_paise,
      note: 'approved this month',
      color: '#dc2626',
    },
    {
      label: 'Refunds given',
      value: summary.refunds_given_paise ?? 0,
      note: 'security-deposit refunds',
      color: '#eb6834',
    },
  ];

  // Operating metrics — plain names, real math, hover explains the formula.
  const ops: {
    label: string;
    value: string;
    note: string;
    hint: string;
  }[] = [
    {
      label: 'Avg rent / tenant',
      value:
        summary.total_tenants > 0
          ? formatPaise(
              Math.round(
                (summary.expected_rent_paise ?? 0) / Math.max(1, summary.total_tenants),
              ),
            )
          : '—',
      note: `billed ÷ ${summary.total_tenants} tenants`,
      hint: 'This month’s billed rent divided by active tenants — what an average tenant pays.',
    },
    {
      label: 'Revenue / bed',
      value: totalBeds > 0 ? formatPaise(Math.round(received / totalBeds)) : '—',
      note: `all money in ÷ ${totalBeds} beds`,
      hint: 'Total received this month divided by every bed, including vacant ones — how hard each bed works.',
    },
    {
      label: 'Collection rate',
      value: `${collectionPct}%`,
      note: 'collected vs billed rent',
      hint: 'Rent collected this month as a share of rent billed. 100% = everyone paid.',
    },
    {
      label: 'Profit margin',
      value: `${marginPct}%`,
      note: 'profit ÷ received',
      hint: 'What share of every rupee received is left after all spending.',
    },
    {
      label: 'Expense ratio',
      value: received > 0 ? `${Math.round((spent / received) * 100)}%` : '—',
      note: 'spent ÷ received',
      hint: 'How much of the money received went right back out. Lower is better.',
    },
    {
      label: 'Overdue tenants',
      value: String(summary.overdue_tenants),
      note: summary.overdue_tenants > 0 ? 'tap to follow up →' : 'all clear',
      hint: 'Tenants with unpaid rent past the due date. Click to open Rent & Payments.',
    },
  ];

  return (
    <div className="animate-fade-in mx-auto flex max-w-[1280px] flex-col gap-4">
      <PageHeader
        title="Dashboard"
        sub={`Financial overview · ${MONTHS.find((m) => m.value === month)?.label} ${year}`}
        actions={
          <>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-32 rounded-xl font-bold shadow-sm">
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
              <SelectTrigger className="h-9 w-24 rounded-xl font-bold shadow-sm">
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
          </>
        }
      />

      {/* 1 · Hero KPIs */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-bold text-muted-foreground">Net profit</div>
          <div className="tnum mt-2 text-[26px] font-extrabold leading-none tracking-tight">
            {formatPaise(profit)}
          </div>
          <div className="mt-2 text-[11.5px] font-semibold text-[#98a0ad]">
            {marginPct}% margin · Received − Spent
          </div>
          <Spark data={profitSpark} color="#15803d" />
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-bold text-muted-foreground">Revenue received</div>
          <div className="tnum mt-2 text-[26px] font-extrabold leading-none tracking-tight">
            {formatPaise(received)}
          </div>
          <div className="mt-2 text-[11.5px] font-semibold text-[#98a0ad]">
            rent + advances + stays + power
          </div>
          <Spark data={incomeSpark} color="#2a78d6" />
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-bold text-muted-foreground">Total spent</div>
          <div className="tnum mt-2 text-[26px] font-extrabold leading-none tracking-tight">
            {formatPaise(spent)}
          </div>
          <div className="mt-2 text-[11.5px] font-semibold text-[#98a0ad]">
            incl. {formatPaise(summary.refunds_given_paise ?? 0)} refunds
          </div>
          <Spark data={expenseSpark} color="#dc2626" />
        </div>
        <div
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-accent"
          onClick={() => navigate(`/properties/${selectedPropertyId}`)}
        >
          <div className="text-xs font-bold text-muted-foreground">Occupancy</div>
          <div className="tnum mt-2 text-[26px] font-extrabold leading-none tracking-tight">
            {occupancyPct}%
          </div>
          <div className="mt-2 text-[11.5px] font-semibold text-[#98a0ad]">
            {occupiedBeds} of {totalBeds} beds · {vacantBeds} vacant
          </div>
          <Spark data={occSpark} color="#b45309" />
        </div>
      </div>

      {/* 2 · Money in / out */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <SectionCard>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12.5px] font-extrabold uppercase tracking-wider text-[#0e6a32]">
              <span>↓</span> Money received
            </div>
            <div className="tnum text-[20px] font-extrabold tracking-tight text-[#0e6a32]">
              {formatPaise(received)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {moneyIn.map((m) => (
              <MoneyCard
                key={m.label}
                label={m.label}
                value={formatPaise(m.value)}
                note={m.note}
                color={m.color}
              />
            ))}
          </div>
          <CompositionBar parts={moneyIn.map((m) => ({ value: m.value, color: m.color }))} />
        </SectionCard>

        <SectionCard>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12.5px] font-extrabold uppercase tracking-wider text-destructive">
              <span>↑</span> Money spent
            </div>
            <div className="tnum text-[20px] font-extrabold tracking-tight text-destructive">
              {formatPaise(spent)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {moneyOut.map((m) => (
              <MoneyCard
                key={m.label}
                label={m.label}
                value={formatPaise(m.value)}
                note={m.note}
                color={m.color}
              />
            ))}
          </div>
          <CompositionBar parts={moneyOut.map((m) => ({ value: m.value, color: m.color }))} />
        </SectionCard>
      </div>

      {/* 3 · Operating metrics */}
      <SectionCard
        title="📊 Operating metrics"
        sub="Unit economics and cash health — hover any tile for how it's computed."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {ops.map((o) => (
            <KpiTile
              key={o.label}
              label={o.label}
              value={o.value}
              foot={o.note}
              labelHint={o.hint}
              className={
                o.label === 'Overdue tenants' && summary.overdue_tenants > 0
                  ? 'cursor-pointer border-[#f3d59b] bg-[#fffdf6]'
                  : undefined
              }
              valueClassName={
                o.label === 'Overdue tenants' && summary.overdue_tenants > 0
                  ? 'text-[#b45309]'
                  : undefined
              }
            />
          ))}
        </div>
      </SectionCard>

      {/* 4 · Owner split + recurring spend */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        {(summary.owner_profits?.length ?? 0) > 0 && (
          <SectionCard
            title="👥 Owner profit split"
            sub={`Net profit ${formatPaise(profit)} split by configured share %.`}
          >
            <RankBars
              rows={summary.owner_profits!.map((o, i) => ({
                label: o.name,
                sub: `${o.share_pct}% share`,
                value: Math.max(0, o.share_paise),
                display: formatPaise(o.share_paise),
                color: RANK_COLORS[i % RANK_COLORS.length],
              }))}
            />
          </SectionCard>
        )}
        {(summary.top_recurring_spikes?.length ?? 0) > 0 && (
          <SectionCard
            title="📈 Recurring spend — up vs last month"
            sub="Expense buckets up ≥₹500 and ≥50% vs the previous window."
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {summary.top_recurring_spikes!.map((s) => (
                <div
                  key={s.item}
                  className="flex items-center justify-between gap-2.5 rounded-xl border border-[#f3d59b] bg-[#fffdf7] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold">{s.item}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#98a0ad]">
                      was {formatPaise(s.previous_paise)} → {formatPaise(s.current_paise)}
                    </p>
                  </div>
                  <span
                    className={
                      s.pct_change != null
                        ? 'whitespace-nowrap rounded-full bg-[#fdecec] px-2 py-0.5 text-[11.5px] font-extrabold text-destructive'
                        : 'whitespace-nowrap rounded-full bg-[#efeaff] px-2 py-0.5 text-[11.5px] font-extrabold text-[#5b3ec9]'
                    }
                  >
                    {s.pct_change != null ? `▲ ${Math.round(s.pct_change)}%` : 'new'}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      {/* 5 · Charts */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <SectionCard title="Income vs Expenses" sub="Last 12 months" className="shadow-md">
          {cashflow?.items?.length ? (
            <CashflowChart data={cashflow.items} />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No cashflow data yet.
            </div>
          )}
        </SectionCard>
        <SectionCard
          title="ROI payback trajectory"
          sub="Click to open the plan"
          className="cursor-pointer shadow-md transition-colors hover:border-accent"
        >
          <div onClick={() => navigate('/roi')}>
            {paybackPlan?.configured && paybackPlan.calc ? (
              <PaybackChart data={paybackPlan} compact />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
                <p>No payback plan configured yet.</p>
                <p className="text-xs">
                  Set one up on the ROI page — investment, target horizon, grace, and lessor
                  rent.
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* 6 · By person */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        {(summary.cash_in_by_person?.length ?? 0) > 0 && (
          <SectionCard
            title="💰 Cash collected by person"
            sub="Rent, advance & booking payments — by who received the money."
          >
            <RankBars
              rows={summary.cash_in_by_person!.map((p, i) => ({
                label: p.person,
                sub: `${p.count} collection${p.count === 1 ? '' : 's'}`,
                value: p.total_paise,
                display: formatPaise(p.total_paise),
                color: RANK_COLORS[i % RANK_COLORS.length],
              }))}
            />
          </SectionCard>
        )}
        {(summary.expenses_by_person?.length ?? 0) > 0 && (
          <SectionCard
            title="🧾 Expenses by person"
            sub="Approved spend logged against each staff member."
          >
            <RankBars
              rows={summary.expenses_by_person!.map((p, i) => ({
                label: p.person,
                sub: `${p.count} expense${p.count === 1 ? '' : 's'}`,
                value: p.total_paise,
                display: formatPaise(p.total_paise),
                color: ['#dc2626', '#e34948', '#eb6834', '#eda100', '#e87ba4', '#98a0ad', '#c7ccd6'][
                  i % 7
                ],
              }))}
            />
          </SectionCard>
        )}
      </div>

      {/* CRM worklist */}
      <FollowupsDueToday propertyId={selectedPropertyId ?? undefined} />

      {/* 7 · Overdue alert */}
      {summary.overdue_tenants > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#f3d59b] bg-[#fff6e5] px-4 py-3.5 text-[13.5px] text-[#7c4a12]">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#fff0d6] text-[#b45309]">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <p>
            <b className="text-[#5f380d]">{summary.overdue_tenants} tenants</b> have overdue rent
            totalling <b className="text-[#5f380d]">{formatPaise(summary.outstanding_paise)}</b>.{' '}
            <Link to="/rent" className="font-extrabold text-[#b45309] underline">
              Open rent &amp; payments
            </Link>{' '}
            to follow up.
          </p>
          <Pill tone="a" className="ml-auto hidden sm:inline-flex">
            {collectionPct}% collected
          </Pill>
        </div>
      )}
    </div>
  );
}
