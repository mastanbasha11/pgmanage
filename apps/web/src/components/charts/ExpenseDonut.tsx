import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatPaise } from '@/lib/utils';
import type { ExpenseSummaryItem } from '@/hooks/useExpenses';

type ExpenseSummary = ExpenseSummaryItem;

/** Exported so companion lists (e.g. the category track bars on the
 *  Expenses page) can color-match the slices exactly. */
export const EXPENSE_COLORS = [
  '#0D9488', '#0F172A', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
];

interface Props {
  data: ExpenseSummary[];
  /** Hide the built-in legend when the parent renders its own breakdown. */
  showLegend?: boolean;
  height?: number;
}

export function ExpenseDonut({ data, showLegend = true, height = 260 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={height * 0.23}
          outerRadius={height * 0.35}
          paddingAngle={3}
          dataKey="total_paise"
          nameKey="category_name"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatPaise(value)}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '13px',
          }}
        />
        {showLegend && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '12px' }}
            formatter={(value, entry) => {
              const item = entry.payload as ExpenseSummary | undefined;
              return `${value} (${item?.percentage?.toFixed(1)}%)`;
            }}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}
