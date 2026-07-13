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
import { usePaybackPlan, useSavePaybackPlan, type PaybackPlan } from '@/hooks/usePaybackPlan';
import { useToast } from '@/hooks/useToast';
import { getApiError } from '@/lib/api';
import { formatPaise } from '@/lib/utils';

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
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-accent" />
                Payback Plan
              </CardTitle>
              <p className="text-xs text-muted-foreground">
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
            <PlanResults data={data!} />
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

function PlanResults({ data }: { data: PaybackPlan }) {
  const { plan, calc, per_owner: perOwner, months_elapsed: elapsed,
    actual_cumulative_paise: actual, expected_cumulative_paise: expected } = data;

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
          label="Grace month profit"
          value={formatPaise(calc.grace_month_profit_paise)}
          sub="All owners, per month"
          tone="income"
        />
        <SummaryTile
          label="Regular month profit"
          value={formatPaise(calc.regular_month_profit_paise)}
          sub="Post-grace, per month"
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
                    Grace month
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Regular month
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
                        {o.capital_paise ? formatPaise(o.capital_paise) : '—'}
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
            <span className="text-xs text-muted-foreground">
              {elapsed ?? 0} of {plan.target_months} months elapsed
            </span>
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
        </div>
      )}
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
  const [horizon, setHorizon] = useState<'months' | 'preset'>('months');

  useEffect(() => {
    if (['12', '18', '24', '36'].includes(targetMonths)) setHorizon('preset');
  }, [targetMonths]);

  const save = useSavePaybackPlan(propertyId);
  const { toast } = useToast();

  // Live preview.
  const preview = useMemo(() => {
    const I = Math.round(Number(investmentRupees) * 100);
    const T = Math.round(Number(targetMonths));
    const G = Math.round(Number(graceMonths));
    const R = Math.round(Number(rentRupees) * 100);
    if (!I || !T || T <= 0 || G < 0 || G > T) return null;
    const p_grace = (I + (T - G) * R) / T;
    const p_regular = p_grace - R;
    return { p_grace, p_regular, T, G };
  }, [investmentRupees, targetMonths, graceMonths, rentRupees]);

  async function submit() {
    const I = Math.round(Number(investmentRupees) * 100);
    const T = Math.round(Number(targetMonths));
    const G = Math.round(Number(graceMonths));
    const R = Math.round(Number(rentRupees) * 100);
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
    try {
      await save.mutateAsync({
        investment_paise: I,
        target_months: T,
        grace_months: G,
        lessor_rent_paise: R,
        plan_start_date: startDate || undefined,
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
                Grace ({preview.G} mo): <strong>{formatPaise(preview.p_grace)}</strong>/mo
              </p>
              <p>
                Regular ({preview.T - preview.G} mo):{' '}
                <strong>{formatPaise(preview.p_regular)}</strong>/mo
              </p>
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
