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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CashflowChart } from '@/components/charts/CashflowChart';
import { ExpenseDonut } from '@/components/charts/ExpenseDonut';
import { useDashboardSummary, useCashflow } from '@/hooks/useDashboard';
import { useExpenseSummary } from '@/hooks/useExpenses';
import { useProperties } from '@/hooks/useProperties';
import { useAuthStore } from '@/store/auth';
import { formatPaise } from '@/lib/utils';
import { Link, Navigate } from 'react-router-dom';

function KPICard({
  title,
  value,
  sub,
  icon: Icon,
  className,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-lg bg-accent/10 p-2.5">
            <Icon className="h-5 w-5 text-accent" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { selectedPropertyId, canAccessFinancials } = useAuthStore();

  if (!canAccessFinancials()) return <Navigate to="/tenants" replace />;

  const { data: propertiesData, isLoading: loadingProps } = useProperties();
  const { data: summary, isLoading } = useDashboardSummary(selectedPropertyId ?? undefined);
  const { data: cashflow } = useCashflow(selectedPropertyId ?? undefined);
  const { data: expenseSummary } = useExpenseSummary({
    property_id: selectedPropertyId ?? undefined,
  });

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
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Financial overview for this month</p>
      </div>

      {/* Row 1: cash in/out KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="Collected Rent"
          value={formatPaise(
            summary.collected_rent_paise ?? summary.rent_collected_paise ?? 0,
          )}
          sub={`of ${formatPaise(
            summary.expected_rent_paise ?? summary.gross_rent_expected_paise ?? 0,
          )} expected`}
          icon={IndianRupee}
        />
        <KPICard
          title="Outstanding"
          value={formatPaise(summary.outstanding_paise)}
          sub={`${collectionPct}% collection rate`}
          icon={AlertCircle}
          className={summary.outstanding_paise > 0 ? 'border-amber-200' : ''}
        />
        <KPICard
          title="Advance Received"
          value={formatPaise(summary.advance_received_paise ?? 0)}
          sub="Maintenance + Security deposits"
          icon={ArrowDownToLine}
        />
        <KPICard
          title="Net Income"
          value={formatPaise(summary.net_income_paise)}
          sub="(Rent + Advance) − (Refunds + Expenses)"
          icon={TrendingUp}
        />
      </div>

      {/* Row 2: outflows + occupancy */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="Total Expenses"
          value={formatPaise(summary.total_expenses_paise)}
          sub="approved this month"
          icon={Receipt}
        />
        <KPICard
          title="Refunds Given"
          value={formatPaise(summary.refunds_given_paise ?? 0)}
          sub="security deposit refunds"
          icon={ArrowUpFromLine}
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
          sub={`of ${summary.total_beds ?? 0} total`}
          icon={Building2}
        />
      </div>

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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseSummary?.items?.length ? (
              <ExpenseDonut data={expenseSummary.items} />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No expense data yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
