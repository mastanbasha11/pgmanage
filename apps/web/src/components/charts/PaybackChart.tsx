/**
 * ROI payback trajectory chart. Two cumulative curves — actual (green) and
 * expected (blue dashed) — plus a red horizontal reference line at the
 * total investment so it's obvious how much runway is left before break-
 * even. Vertical dashed line marks the end of the grace period.
 *
 * X-axis is fiscal-month labels ("Mar 26", "Apr 26"…) from the plan's
 * first_fiscal onward, extended to the full target horizon (unseen future
 * months rendered as dotted expected line only).
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { PaybackPlan } from '@/hooks/usePaybackPlan';
import { formatPaise } from '@/lib/utils';

interface Point {
  label: string;
  actual: number | null;
  expected: number;
  isPast: boolean;
}

const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Fiscal-month label — "Mar 26". */
function labelFor(year: number, month: number): string {
  return `${M[month - 1]} ${String(year).slice(-2)}`;
}

/** Build the full series from first_fiscal through target-months, extending
 *  expected past the elapsed range with the plan targets. */
function buildSeries(data: PaybackPlan): Point[] {
  const plan = data.plan;
  const calc = data.calc;
  const first = data.first_fiscal;
  if (!plan.target_months || !plan.plan_start_date || !calc || !first) return [];
  const monthly = data.monthly_breakdown ?? [];
  const total = plan.target_months;
  const grace = plan.grace_months ?? 0;
  const cumActualByKey = new Map<string, number>();
  let runA = 0;
  for (const m of monthly) {
    runA += m.actual_paise;
    cumActualByKey.set(`${m.year}-${m.month}`, runA);
  }
  let runE = 0;
  let year = first.year;
  let month = first.month;
  const points: Point[] = [];
  for (let i = 0; i < total; i++) {
    const per =
      i < grace ? calc.grace_month_profit_paise : calc.regular_month_profit_paise;
    runE += per;
    const key = `${year}-${month}`;
    const isPast = cumActualByKey.has(key);
    points.push({
      label: labelFor(year, month),
      actual: isPast ? cumActualByKey.get(key)! : null,
      expected: runE,
      isPast,
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return points;
}

export default function PaybackChart({
  data,
  compact = false,
  onNavigate,
}: {
  data: PaybackPlan;
  /** Compact = for dashboard tile (smaller, no legend). */
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const points = buildSeries(data);
  const investment = data.plan.investment_paise ?? 0;
  const graceEndIndex = Math.min(
    data.plan.grace_months ?? 0,
    points.length,
  );
  const graceEndLabel = graceEndIndex > 0 ? points[graceEndIndex - 1]?.label : undefined;

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Configure the payback plan to see the chart.
      </div>
    );
  }

  const height = compact ? 240 : 320;
  const yTickFormat = (v: number) => {
    if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
    if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
    if (v >= 1e3) return `₹${Math.round(v / 1e3)} k`;
    return `₹${v}`;
  };

  return (
    <div
      className={
        onNavigate
          ? 'cursor-pointer rounded-md transition-colors hover:bg-muted/30'
          : ''
      }
      onClick={onNavigate}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expectedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
          <XAxis dataKey="label" fontSize={11} tickMargin={4} />
          <YAxis fontSize={11} tickFormatter={yTickFormat} width={70} />
          <Tooltip
            formatter={(v: number, name: string) => [
              formatPaise(v ?? 0),
              name === 'actual' ? 'Actual (cumulative)' : 'Expected (cumulative)',
            ]}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          {!compact && (
            <Legend
              formatter={(v) => (v === 'actual' ? 'Actual' : 'Expected')}
              iconType="line"
              iconSize={12}
              wrapperStyle={{ fontSize: '12px' }}
            />
          )}
          {investment > 0 && (
            <ReferenceLine
              y={investment}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{
                value: `ROI target: ${formatPaise(investment)}`,
                position: 'insideTopRight',
                fontSize: 11,
                fill: '#ef4444',
              }}
            />
          )}
          {graceEndLabel && (
            <ReferenceLine
              x={graceEndLabel}
              stroke="#f59e0b"
              strokeDasharray="2 2"
              label={{
                value: 'Grace ends',
                position: 'insideTopLeft',
                fontSize: 10,
                fill: '#f59e0b',
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="expected"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="url(#expectedGrad)"
          />
          <Area
            type="monotone"
            dataKey="actual"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#actualGrad)"
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Explicit re-export so callers can import LineChart too if they need a
// non-area rendering (e.g. dark backgrounds). Kept unused for now.
export { LineChart, Line };
