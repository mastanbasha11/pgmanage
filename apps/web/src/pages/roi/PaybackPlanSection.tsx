/**
 * ROI → Payback Plan.
 *
 * The strategic-side of the ROI page. Given total investment, target payback
 * horizon, grace period (lessor-rent-free months), and post-grace lessor rent
 * per month, we back out how much net profit the business needs to throw off
 * every month during grace and post-grace to recoup the investment by the
 * target month:
 *
 *   G·P_grace + (T−G)·P_regular = I
 *   P_regular = P_grace − rent
 *   ⇒ P_grace = (I + (T−G)·rent) / T
 *
 * All money inputs are captured in RUPEES on this UI (converted to paise
 * before the API call). Live preview updates as you type before Save.
 */
import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, TrendingUp, Users, Pencil, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usePaybackPlan,
  useSavePaybackPlan,
  useSaveMonthlyActual,
  useClearMonthlyActual,
  type PaybackPlan,
} from '@/hooks/usePaybackPlan';
import { useToast } from '@/hooks/useToast';
import { getApiError } from '@/lib/api';
import { formatPaise } from '@/lib/utils';
import PaybackChart from '@/components/charts/PaybackChart';

export default function PaybackPlanSection({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = usePaybackPlan(propertyId);
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  const configured = data?.configured;

  return (
    <>
      <Card className="border-slate-300">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 text-accent" />
                  Payback Plan
                </CardTitle>
                {configured && data?.plan.plan_start_date && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    Go-live: {new Date(data.plan.plan_start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
                {configured && data?.first_fiscal && (
                  <span className="text-[11px] text-muted-foreground">
                    · first fiscal month {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][data.first_fiscal.month - 1]}{' '}
                    {data.first_fiscal.year}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Given the investment + target horizon + grace, this tells each
                owner how much profit they need to take home each month during
                grace vs after — and how the actuals are tracking.
              </p>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {configured ? 'Edit plan' : 'Set up plan'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!configured ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Lightbulb className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-md">
                Enter the total investment, how many months you'd like to recover it in,
                and how many grace months your lease agreement gives you — we'll do the math.
              </p>
            </div>
          ) : (
            <PlanResults data={data!} propertyId={propertyId} />
          )}
        </CardContent>
      </Card>

      {editing && (
        <PlanDialog
          propertyId={propertyId}
          existing={data ?? undefined}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function PlanResults({ data, propertyId }: { data: PaybackPlan; propertyId: string }) {
  const { plan, calc, per_owner: perOwner, months_elapsed: elapsed,
    actual_cumulative_paise: actual, expected_cumulative_paise: expected,
    monthly_breakdown: monthly } = data;
  const [showBackfill, setShowBackfill] = useState(false);

  if (calc?.error) {
    return (
      <p className="text-sm text-rose-700">Plan looks off: {calc.error}</p>
    );
  }
  if (!calc) return null;

  const grace = plan.grace_months ?? 0;
  const regular = (plan.target_months ?? 0) - grace;
  const totalPeriodTarget =
    calc.grace_period_total_paise + calc.regular_period_total_paise;

  const trackingPct =
    expected && expected > 0 ? ((actual ?? 0) / expected) * 100 : null;
  const trackingLabel =
    trackingPct === null
      ? '—'
      : trackingPct >= 100
      ? `Ahead by ${formatPaise((actual ?? 0) - (expected ?? 0))}`
      : `Behind by ${formatPaise((expected ?? 0) - (actual ?? 0))}`;

  return (
    <div className="space-y-4">
      {/* Header row: totals */}
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryTile label="Investment" value={formatPaise(plan.investment_paise ?? 0)} />
        <SummaryTile
          label="Target horizon"
          value={`${plan.target_months ?? 0} mo`}
          sub={`${grace} mo grace + ${regular} mo regular`}
        />
        <SummaryTile
          label="Grace month target"
          value={formatPaise(calc.grace_month_profit_paise)}
          sub="Required to hit ROI on schedule"
          tone="income"
        />
        <SummaryTile
          label="Regular month target"
          value={formatPaise(calc.regular_month_profit_paise)}
          sub="Post-grace (grace target − rent)"
          tone="income"
        />
      </div>

      {/* Owner breakdown */}
      {(perOwner?.length ?? 0) > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium">Per-owner monthly share</span>
          </div>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Owner</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Share</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Capital</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Grace month target
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Regular month target
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Total over {plan.target_months} mo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {perOwner!.map((o) => {
                  const total =
                    o.grace_month_share_paise * grace +
                    o.regular_month_share_paise * regular;
                  return (
                    <tr key={o.name}>
                      <td className="px-3 py-2 font-medium">{o.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {o.share_pct}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatPaise(o.capital_effective_paise)}
                        {o.capital_paise == null && (
                          <span className="ml-1 text-[10px] text-muted-foreground/70">
                            (auto)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatPaise(o.grace_month_share_paise)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatPaise(o.regular_month_share_paise)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {formatPaise(total)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-muted/30">
                  <td className="px-3 py-2 font-semibold">Property total</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {perOwner!.reduce((s, o) => s + o.share_pct, 0)}%
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatPaise(calc.grace_month_profit_paise)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatPaise(calc.regular_month_profit_paise)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {formatPaise(totalPeriodTarget)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actual vs projected */}
      {plan.plan_start_date && (
        <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {elapsed ?? 0} of {plan.target_months} months elapsed
              </span>
              <Button size="sm" variant="outline" onClick={() => setShowBackfill(true)}>
                Fill monthly profits
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniTile label="Actual so far" value={formatPaise(actual ?? 0)} tone="income" />
            <MiniTile label="Expected by now" value={formatPaise(expected ?? 0)} />
            <MiniTile
              label="Tracking"
              value={trackingLabel}
              tone={
                trackingPct === null
                  ? 'default'
                  : trackingPct >= 100
                  ? 'income'
                  : 'expense'
              }
            />
          </div>

          {/* Catch-up card */}
          {data.catchup && data.catchup.remaining_months > 0 && (
            <CatchUpCard
              catchup={data.catchup}
              lessorRent={plan.lessor_rent_paise ?? 0}
              onTrackExpectedTotal={
                calc.grace_period_total_paise + calc.regular_period_total_paise
              }
            />
          )}
        </div>
      )}

      {/* Year-by-year breakdown (rent hikes across lease years) */}
      {(calc.year_summaries?.length ?? 0) > 0 && (
        <YearSummaryTable summaries={calc.year_summaries!} plan={plan} />
      )}

      {/* Post-payback future profit — the icing on the cake */}
      {(calc.post_payback_months ?? 0) > 0 && (
        <PostPaybackCard calc={calc} plan={plan} />
      )}

      {/* Actual vs expected trajectory */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">Actual vs Expected trajectory</span>
        </div>
        <PaybackChart data={data} />
      </div>

      {/* Month-by-month actual vs expected */}
      {(monthly?.length ?? 0) > 0 && (
        <MonthlyBreakdownTable months={monthly!} data={data} />
      )}

      {showBackfill && plan.plan_start_date && (
        <BackfillDialog
          propertyId={propertyId}
          months={monthly ?? []}
          onClose={() => setShowBackfill(false)}
        />
      )}
    </div>
  );
}

/**
 * "If you keep last month's pace, you'll finish at ₹X" — vs "hit ROI on
 * time, you need to average ₹Y from now on". The gap between the two is
 * where owners course-correct.
 */
function CatchUpCard({
  catchup,
  lessorRent,
  onTrackExpectedTotal,
}: {
  catchup: NonNullable<PaybackPlan['catchup']>;
  lessorRent: number;
  onTrackExpectedTotal: number;
}) {
  const graceLeft = catchup.grace_remaining;
  const regLeft = catchup.regular_remaining;
  const tone = catchup.on_track ? 'emerald' : 'amber';
  return (
    <div
      className={
        tone === 'emerald'
          ? 'mt-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3'
          : 'mt-3 rounded-md border border-amber-200 bg-amber-50/40 p-3'
      }
    >
      <p className={`text-[11px] uppercase tracking-wider ${tone === 'emerald' ? 'text-emerald-800' : 'text-amber-800'}`}>
        To still hit ROI on time — from next month onwards
      </p>
      {catchup.remaining_investment_paise <= 0 ? (
        <p className="mt-1 text-sm">
          ROI already recovered ahead of schedule. Anything you earn from now on is pure gain.
        </p>
      ) : (
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {graceLeft > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground">
                Grace months left ({graceLeft})
              </p>
              <p className="text-sm font-semibold">
                {formatPaise(catchup.p_grace_catchup_paise)} / mo
              </p>
            </div>
          )}
          <div>
            <p className="text-[11px] text-muted-foreground">
              Regular months left ({regLeft})
            </p>
            <p className="text-sm font-semibold">
              {formatPaise(catchup.p_regular_catchup_paise)} / mo
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">
              Remaining investment to recover
            </p>
            <p className="text-sm font-semibold">
              {formatPaise(catchup.remaining_investment_paise)}
            </p>
          </div>
        </div>
      )}
      {/* Deltas vs the original plan */}
      {catchup.remaining_investment_paise > 0 && lessorRent >= 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {catchup.on_track
            ? 'You are ahead of the original plan; the amounts above are the minimum from here.'
            : `Original plan totalled ${formatPaise(onTrackExpectedTotal)} over the full horizon; you'll need this pace to catch up in the remaining months.`}
        </p>
      )}
    </div>
  );
}

/**
 * Compact per-month tracker.
 *
 * "Required" is the dynamic catch-up target for THIS month given what
 * happened before it — remaining investment ÷ remaining months (grace-
 * adjusted). When you miss a month, the following months' Required goes
 * up; when you overshoot, it goes down. Δ compares Actual to Required
 * so the color always reflects "did I beat what I actually needed?".
 * The baseline plan target is still available under Expected for
 * reference.
 */
function MonthlyBreakdownTable({
  months,
  data,
}: {
  months: NonNullable<PaybackPlan['monthly_breakdown']>;
  data: PaybackPlan;
}) {
  const monthName = (m: number) =>
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  const investment = data.plan.investment_paise ?? 0;
  const total = data.plan.target_months ?? 0;
  const rents = data.calc?.rent_by_month_paise ?? [];

  let cumActual = 0;
  let cumExpected = 0;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium">Month-by-month tracking</span>
        <span className="text-[11px] text-muted-foreground">
          Required = dynamic catch-up target given prior months
        </span>
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Month</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Expected</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Required</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actual</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Δ vs required</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Cumulative actual
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Cumulative expected
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {months.map((m, idx) => {
              // Required this month: given cumActual so far and the
              // remaining months' actual rent schedule (year-stepped),
              // what does X' need to be, and therefore this month's
              // profit = X' − rent_this_month.
              const remaining_months = total - idx;
              const remaining_investment = Math.max(0, investment - cumActual);
              let required = 0;
              if (remaining_months > 0) {
                const rentTail = rents.length
                  ? rents.slice(idx, total).reduce((s, r) => s + r, 0)
                  : 0;
                const xCatchup = (remaining_investment + rentTail) / remaining_months;
                const rentThis = rents[idx] ?? 0;
                required = xCatchup - rentThis;
              }

              cumActual += m.actual_paise;
              cumExpected += m.expected_paise;
              const delta = m.actual_paise - required;
              const cumDelta = cumActual - cumExpected;
              const requiredHigherThanBaseline = required > m.expected_paise + 1;
              return (
                <tr key={`${m.year}-${m.month}`}>
                  <td className="px-3 py-2">
                    <span className="font-medium">
                      {monthName(m.month)} {String(m.year).slice(-2)}
                    </span>
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatPaise(m.expected_paise)}
                  </td>
                  <td
                    className={
                      requiredHigherThanBaseline
                        ? 'px-3 py-2 text-right tabular-nums font-semibold text-amber-700'
                        : 'px-3 py-2 text-right tabular-nums font-semibold'
                    }
                    title={
                      requiredHigherThanBaseline
                        ? 'Above the baseline plan — earlier months were behind, catching up requires more this month'
                        : undefined
                    }
                  >
                    {formatPaise(Math.round(required))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPaise(m.actual_paise)}
                  </td>
                  <td
                    className={
                      delta >= 0
                        ? 'px-3 py-2 text-right tabular-nums text-emerald-700'
                        : 'px-3 py-2 text-right tabular-nums text-rose-700'
                    }
                  >
                    {delta >= 0 ? '+' : '−'}
                    {formatPaise(Math.abs(Math.round(delta)))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatPaise(cumActual)}
                  </td>
                  <td
                    className={
                      cumDelta >= 0
                        ? 'px-3 py-2 text-right tabular-nums text-emerald-700'
                        : 'px-3 py-2 text-right tabular-nums text-rose-700'
                    }
                  >
                    {formatPaise(cumExpected)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'income';
}) {
  return (
    <div
      className={
        tone === 'income'
          ? 'rounded-md border border-emerald-200 bg-emerald-50/50 p-3'
          : 'rounded-md border bg-card p-3'
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MiniTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'income' | 'expense';
}) {
  const cls =
    tone === 'income'
      ? 'text-emerald-700'
      : tone === 'expense'
      ? 'text-rose-700'
      : '';
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${cls}`}>{value}</p>
    </div>
  );
}

function PlanDialog({
  propertyId,
  existing,
  onClose,
}: {
  propertyId: string;
  existing?: PaybackPlan;
  onClose: () => void;
}) {
  // All money inputs are RUPEES on-screen; converted to paise at submit.
  const [investmentRupees, setInvestmentRupees] = useState<string>(
    existing?.plan.investment_paise != null
      ? String(Math.round(existing.plan.investment_paise / 100))
      : '',
  );
  const [targetMonths, setTargetMonths] = useState<string>(
    existing?.plan.target_months != null ? String(existing.plan.target_months) : '18',
  );
  const [graceMonths, setGraceMonths] = useState<string>(
    existing?.plan.grace_months != null ? String(existing.plan.grace_months) : '2',
  );
  const [rentRupees, setRentRupees] = useState<string>(
    existing?.plan.lessor_rent_paise != null
      ? String(Math.round(existing.plan.lessor_rent_paise / 100))
      : '',
  );
  const [startDate, setStartDate] = useState<string>(
    existing?.plan.plan_start_date ?? new Date().toISOString().slice(0, 10),
  );
  const [leaseYears, setLeaseYears] = useState<string>(
    existing?.plan.lease_term_months != null
      ? String(Math.round(existing.plan.lease_term_months / 12))
      : '3',
  );
  const [hikePct, setHikePct] = useState<string>(
    existing?.plan.annual_rent_hike_pct != null
      ? String(existing.plan.annual_rent_hike_pct)
      : '5',
  );
  const [horizon, setHorizon] = useState<'months' | 'preset'>('months');

  useEffect(() => {
    if (['12', '18', '24', '36'].includes(targetMonths)) setHorizon('preset');
  }, [targetMonths]);

  const save = useSavePaybackPlan(propertyId);
  const { toast } = useToast();

  // Live preview — mirrors the backend's rent-stepping compute so what
  // the user sees before Save matches what they see after.
  const preview = useMemo(() => {
    const I = Math.round(Number(investmentRupees) * 100);
    const T = Math.round(Number(targetMonths));
    const G = Math.round(Number(graceMonths));
    const R = Math.round(Number(rentRupees) * 100);
    const L = Math.max(T, Math.round(Number(leaseYears)) * 12 || T);
    const h = Number(hikePct) / 100 || 0;
    if (!I || !T || T <= 0 || G < 0 || G > T) return null;
    const rents: number[] = [];
    for (let i = 0; i < L; i++) {
      rents.push(i < G ? 0 : Math.round(R * Math.pow(1 + h, Math.floor(i / 12))));
    }
    const rentOverT = rents.slice(0, T).reduce((s, r) => s + r, 0);
    const X = (I + rentOverT) / T;
    const p_regular_y1 = X - R;
    const postPaybackProfit = rents
      .slice(T, L)
      .reduce((s, r) => s + (X - r), 0);
    return { X, p_regular_y1, T, G, L, rents, postPaybackProfit };
  }, [investmentRupees, targetMonths, graceMonths, rentRupees, leaseYears, hikePct]);

  async function submit() {
    const I = Math.round(Number(investmentRupees) * 100);
    const T = Math.round(Number(targetMonths));
    const G = Math.round(Number(graceMonths));
    const R = Math.round(Number(rentRupees) * 100);
    const L = Math.round(Number(leaseYears)) * 12;
    const H = Number(hikePct);
    if (!I || I < 0) {
      toast({ title: 'Enter total investment', variant: 'destructive' });
      return;
    }
    if (!T || T <= 0) {
      toast({ title: 'Target months must be > 0', variant: 'destructive' });
      return;
    }
    if (G < 0 || G > T) {
      toast({ title: 'Grace months out of range', variant: 'destructive' });
      return;
    }
    if (L > 0 && L < T) {
      toast({ title: 'Lease term must be ≥ target', variant: 'destructive' });
      return;
    }
    if (H < 0 || H > 50) {
      toast({ title: 'Rent hike must be 0–50%', variant: 'destructive' });
      return;
    }
    try {
      await save.mutateAsync({
        investment_paise: I,
        target_months: T,
        grace_months: G,
        lessor_rent_paise: R,
        plan_start_date: startDate || undefined,
        lease_term_months: L > 0 ? L : undefined,
        annual_rent_hike_pct: Number.isFinite(H) ? H : undefined,
      });
      toast({ title: 'Payback plan saved' });
      onClose();
    } catch (err: unknown) {
      toast({ title: 'Failed', description: getApiError(err), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Payback plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Total investment (₹) *</Label>
            <Input
              type="number"
              min={0}
              step="1"
              value={investmentRupees}
              onChange={(e) => setInvestmentRupees(e.target.value)}
              placeholder="e.g. 10000000 (₹1 Cr)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target horizon *</Label>
              {horizon === 'preset' ? (
                <Select
                  value={targetMonths}
                  onValueChange={(v) => {
                    if (v === 'custom') setHorizon('months');
                    else setTargetMonths(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">1 year</SelectItem>
                    <SelectItem value="18">18 months</SelectItem>
                    <SelectItem value="24">2 years</SelectItem>
                    <SelectItem value="36">3 years</SelectItem>
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  min={1}
                  max={120}
                  step="1"
                  value={targetMonths}
                  onChange={(e) => setTargetMonths(e.target.value)}
                  placeholder="months"
                />
              )}
            </div>
            <div>
              <Label>Grace period (months)</Label>
              <Input
                type="number"
                min={0}
                max={24}
                step="1"
                value={graceMonths}
                onChange={(e) => setGraceMonths(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
          </div>
          <div>
            <Label>Monthly lessor rent after grace (₹) *</Label>
            <Input
              type="number"
              min={0}
              step="1"
              value={rentRupees}
              onChange={(e) => setRentRupees(e.target.value)}
              placeholder="e.g. 400000"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lease term (years)</Label>
              <Input
                type="number"
                min={1}
                max={20}
                step="1"
                value={leaseYears}
                onChange={(e) => setLeaseYears(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
            <div>
              <Label>Annual rent hike (%)</Label>
              <Input
                type="number"
                min={0}
                max={50}
                step="0.1"
                value={hikePct}
                onChange={(e) => setHikePct(e.target.value)}
                placeholder="e.g. 5"
              />
            </div>
          </div>
          <div>
            <Label>Plan start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Used to compare actual profit-so-far against the plan.
            </p>
          </div>

          {preview && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
              <p className="text-[11px] uppercase tracking-wider text-emerald-800">
                Preview
              </p>
              <p className="mt-1">
                Grace ({preview.G} mo): <strong>{formatPaise(preview.X)}</strong>/mo
              </p>
              <p>
                Year-1 regular ({preview.T - preview.G} mo target window):{' '}
                <strong>{formatPaise(preview.p_regular_y1)}</strong>/mo
              </p>
              {preview.L > preview.T && (
                <p className="mt-1 text-[11px] text-emerald-800">
                  Post-payback future profit over remaining {preview.L - preview.T} lease months:{' '}
                  <strong>{formatPaise(preview.postPaybackProfit)}</strong>
                  {Number(hikePct) > 0 && ' (with annual hikes applied)'}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lets the owner backfill / override the profit received in each elapsed
 * month. Rows come from the payback plan's month-by-month breakdown; each
 * one shows the current value (either "manual" from an earlier backfill or
 * "computed" from payments − expenses) and an inline rupee input to change
 * it. Blank input = no change; entering 0 keeps the row as 0 (manual).
 * Clicking Reset on a manual row removes the override so the computed value
 * takes over again.
 */
function BackfillDialog({
  propertyId,
  months,
  onClose,
}: {
  propertyId: string;
  months: PaybackPlan['monthly_breakdown'];
  onClose: () => void;
}) {
  const rows = months ?? [];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = useSaveMonthlyActual(propertyId);
  const clear = useClearMonthlyActual(propertyId);
  const { toast } = useToast();

  async function saveAll() {
    let saved = 0;
    for (const r of rows) {
      const key = `${r.year}-${r.month}`;
      const draft = drafts[key];
      if (draft === undefined || draft === '') continue;
      const paise = Math.round(Number(draft) * 100);
      if (Number.isNaN(paise) || paise < 0) continue;
      try {
        await save.mutateAsync({
          year: r.year,
          month: r.month,
          actual_profit_paise: paise,
        });
        saved += 1;
      } catch (err) {
        toast({
          title: 'Failed',
          description: getApiError(err),
          variant: 'destructive',
        });
        return;
      }
    }
    toast({
      title: saved
        ? `Saved ${saved} month${saved === 1 ? '' : 's'}`
        : 'No changes to save',
    });
    onClose();
  }

  async function reset(year: number, month: number) {
    try {
      await clear.mutateAsync({ year, month });
      toast({ title: 'Reset to computed' });
    } catch (err) {
      toast({
        title: 'Failed',
        description: getApiError(err),
        variant: 'destructive',
      });
    }
  }

  const monthName = (m: number) =>
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backfill monthly profit</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Went live before onboarding to PGManage? Enter the actual profit for
          each past month here — these override the computed net income. Blank
          = keep as-is.
        </p>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No elapsed months yet — set a plan start date in the past.
            </p>
          ) : (
            rows.map((r) => {
              const key = `${r.year}-${r.month}`;
              const isManual = r.source === 'manual';
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-md border bg-card p-2"
                >
                  <div className="w-24 shrink-0">
                    <p className="text-sm font-medium">
                      {monthName(r.month)} {r.year}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {isManual ? 'manual' : 'computed'}
                    </p>
                  </div>
                  <div className="flex-1">
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      placeholder={`${Math.round(r.actual_paise / 100)}`}
                      value={drafts[key] ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [key]: e.target.value }))
                      }
                    />
                  </div>
                  {isManual && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => reset(r.year, r.month)}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={saveAll} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save all entered'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Year-by-year breakdown — one row per lease year, showing how rent
 * steps up on each anniversary and how that eats into the monthly
 * target profit. Year 1 gets a "(inc. grace)" note when the grace
 * months live inside it.
 */
function YearSummaryTable({
  summaries,
  plan,
}: {
  summaries: NonNullable<NonNullable<PaybackPlan['calc']>['year_summaries']>;
  plan: PaybackPlan['plan'];
}) {
  const grace = plan.grace_months ?? 0;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium">Year-by-year breakdown</span>
        {plan.annual_rent_hike_pct != null && plan.annual_rent_hike_pct > 0 && (
          <span className="text-[11px] text-muted-foreground">
            Rent hikes {plan.annual_rent_hike_pct}% every 12 months
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Year</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Months</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Monthly rent</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Monthly target</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Year rent</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Year target</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {summaries.map((y) => (
              <tr key={y.year_index}>
                <td className="px-3 py-2 font-medium">
                  Year {y.year_index}
                  {y.year_index === 1 && grace > 0 && (
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      (inc. {grace}-mo grace)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{y.months_in_year}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPaise(y.monthly_rent_paise)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {formatPaise(y.monthly_target_paise)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatPaise(y.year_rent_total_paise)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {formatPaise(y.year_target_total_paise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Post-payback future profit — after month T the investment is fully
 * recovered; any remaining lease months at the target X still throw off
 * (X − rent) per month. That's pure gain, and it's the story owners
 * care about most: "what do I take home over the full lease?"
 */
function PostPaybackCard({
  calc,
  plan,
}: {
  calc: NonNullable<PaybackPlan['calc']>;
  plan: PaybackPlan['plan'];
}) {
  const T = plan.target_months ?? 0;
  const L = plan.lease_term_months ?? T;
  const postMonths = calc.post_payback_months ?? 0;
  const postProfit = calc.post_payback_profit_paise ?? 0;
  const totalProfit = calc.total_lease_profit_paise ?? 0;
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="mb-1 flex items-center gap-2">
        <PiggyBank className="h-4 w-4 text-emerald-700" />
        <span className="text-sm font-medium text-emerald-900">
          After payback — future profit over the rest of the lease
        </span>
      </div>
      <p className="text-[11px] text-emerald-800/80">
        Investment is recovered by month {T}. Remaining lease months keep
        throwing off (target − rent) — all pure gain.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Post-payback months</p>
          <p className="text-sm font-semibold">
            {postMonths} of {L}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Future profit (post-ROI)</p>
          <p className="text-sm font-semibold text-emerald-700">
            {formatPaise(postProfit)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Total lease profit</p>
          <p className="text-sm font-semibold">{formatPaise(totalProfit)}</p>
        </div>
      </div>
    </div>
  );
}
