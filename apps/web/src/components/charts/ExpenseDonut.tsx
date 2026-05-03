import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatPaise } from '@/lib/utils';
import type { ExpenseSummaryItem } from '@/hooks/useExpenses';

type ExpenseSummary = ExpenseSummaryItem;

const COLORS = [
  '#0D9488', '#0F172A', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
];

interface Props {
  data: ExpenseSummary[];
}

export function ExpenseDonut({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={3}
          dataKey="total_paise"
          nameKey="category_name"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px' }}
          formatter={(value, entry) => {
            const item = entry.payload as ExpenseSummary | undefined;
            return `${value} (${item?.percentage?.toFixed(1)}%)`;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
