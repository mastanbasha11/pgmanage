/**
 * Expenses tab — mobile twin of apps/web/src/pages/expenses/ExpensesPage.tsx.
 *
 *   ┌─────────────────────────────────────────┐
 *   │ Expenses · July 2026 · ₹1,24,500        │
 *   │ [+ Add expense]  [Filters (2)]          │
 *   ├─────────────────────────────────────────┤
 *   │ KPI: total · pending · top cat · ₹/day  │
 *   │ 🧾 Where the money went  (donut + bars)  │
 *   │ 📉 Spend trend           (12-mo bars)    │
 *   │ 👥 Spend by person       (rank bars)     │
 *   ├─────────────────────────────────────────┤
 *   │ Expense rows…                            │
 *
 * NUMBER SOURCING — deliberately split, because the two endpoints disagree:
 *   · /expenses/summary hard-filters approval_status = 'APPROVED'. Everything
 *     derived from it (Total spent, category donut/bars, avg-per-day, spend by
 *     person) is APPROVED-ONLY and is labelled as such on screen.
 *   · /expenses returns every status the filters allow. "Pending approval" is
 *     counted from those rows, so it reflects what you can actually see below.
 *   Mixing the two into one "total" would silently under- or over-count.
 *
 * RBAC: OWNER/PARTNER see the payer filter + "Spend by person". Other roles are
 * scoped to their own rows by the backend on both endpoints, so no client-side
 * scope toggle is needed (the old Mine/Everyone toggle was a no-op — it sent
 * `created_by`, which the endpoint does not declare, so FastAPI dropped it).
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, getApiError } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { chartColors, colors, radius, space, type as fontSize, TOUCH_TARGET } from '../../lib/theme';
import {
  Button,
  Card,
  Chip,
  ChipStrip,
  Empty,
  Field,
  Header,
  IconButton,
  Loading,
  Row,
  Section,
  Sheet,
  Spacer,
  formatDateHuman,
  rupees,
} from '../../components/ui';
import {
  BarChart,
  Delta,
  Donut,
  KpiTile,
  Pill,
  RankBars,
  Tag,
  Track,
  tagKindFor,
  type PillTone,
} from '../../components/redesign';
import {
  useExpenseCategories,
  useExpenseSummary,
  useExpenses,
  type ApprovalStatus,
  type Expense,
} from '../../lib/hooks/expenses';
import { useCashflow } from '../../lib/hooks/dashboard';

// ── Types + constants ───────────────────────────────────────────────────────

type StatusFilter = 'ALL' | ApprovalStatus;
type ModeFilter = 'ALL' | 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';

const MODE_FILTERS: { value: ModeFilter; label: string }[] = [
  { value: 'ALL', label: 'All modes' },
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1];

/** Number of category bars rendered before collapsing into a "+N smaller" note. */
const CATEGORY_BAR_CAP = 7;

/** Shape of GET /expenses/summary. Declared here because the hook returns
 *  `unknown`-ish query data and this screen is the only consumer on mobile. */
interface SummaryCategory {
  category_name: string;
  total_paise: number;
  count: number;
  percentage?: number;
}
interface SummaryPerson {
  person: string;
  total_paise: number;
  count: number;
}
interface ExpenseSummary {
  items?: SummaryCategory[];
  total_paise?: number;
  by_person?: SummaryPerson[];
  previous_items?: SummaryCategory[];
}

interface CashflowPoint {
  month: string;
  expenses_paise: number;
}

const STATUS_TONE: Record<ApprovalStatus, PillTone> = {
  APPROVED: 'g',
  PENDING: 'a',
  REJECTED: 'r',
};

function statusOf(e: Expense): ApprovalStatus {
  return e.approval_status ?? e.status ?? 'APPROVED';
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/**
 * Month-over-month delta for a spend figure. Spending *up* is bad, so a rise
 * renders in the danger tone ('down') and a drop in the success tone ('up').
 * Anything under ₹100 of movement is noise — render nothing.
 */
function SpendDelta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0 && current <= 0) return null;
  if (previous <= 0) return <Delta value="new" tone="warn" />;
  const diff = current - previous;
  if (Math.abs(diff) < 10_000) return <Delta value="flat" tone="warn" />;
  const pct = Math.round((diff / previous) * 100);
  return (
    <Delta value={`${diff > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`} tone={diff > 0 ? 'down' : 'up'} />
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const { selectedPropertyId, canAccessFinancials } = useAppStore();
  const hasFinancials = canAccessFinancials();

  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [paidByFilter, setPaidByFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const propertyId = selectedPropertyId ?? undefined;

  // The list — every param below is one the endpoint actually declares.
  // (`page_size` / `created_by` used to be sent here and were silently dropped.)
  const listQ = useExpenses({
    property_id: propertyId,
    month,
    year,
    category_id: categoryFilter === 'ALL' ? undefined : categoryFilter,
    paid_by: paidByFilter === 'ALL' ? undefined : paidByFilter,
    approval_status: statusFilter === 'ALL' ? undefined : statusFilter,
    payment_mode: modeFilter === 'ALL' ? undefined : modeFilter,
    q: search.trim() || undefined,
    limit: 200,
  });

  // Summary is intentionally NOT filtered — it is the period reference that the
  // charts read from, so it stays stable while the list below is narrowed.
  const summaryQ = useExpenseSummary({ property_id: propertyId, month, year });
  const summary = (summaryQ.data ?? {}) as ExpenseSummary;

  const catsQ = useExpenseCategories();
  const cashflowQ = useCashflow({ property_id: propertyId, months: 12 });

  const items = listQ.data?.items ?? [];
  const categories = summary.items ?? [];
  const approvedTotal = summary.total_paise ?? 0;
  const previousTotal = (summary.previous_items ?? []).reduce((a, c) => a + c.total_paise, 0);

  const pendingRows = items.filter((e) => statusOf(e) === 'PENDING');
  const pendingPaise = pendingRows.reduce((a, e) => a + e.amount_paise, 0);
  const topCategory = categories[0] ?? null;

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const daysElapsed = Math.max(
    1,
    isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate(),
  );

  const trend = useMemo(() => {
    const points = (cashflowQ.data?.items ?? []) as CashflowPoint[];
    return points.map((p) => ({
      // "2026-07" → "Jul". Falls back to the raw label for anything else.
      label: /^\d{4}-\d{2}$/.test(p.month)
        ? MONTH_LABELS[Number(p.month.slice(5, 7)) - 1] ?? p.month
        : p.month.slice(0, 3),
      value: p.expenses_paise ?? 0,
    }));
  }, [cashflowQ.data]);

  const activeFilterCount =
    (categoryFilter !== 'ALL' ? 1 : 0) +
    (paidByFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (modeFilter !== 'ALL' ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function clearFilters() {
    setCategoryFilter('ALL');
    setPaidByFilter('ALL');
    setStatusFilter('ALL');
    setModeFilter('ALL');
    setSearch('');
  }

  const categoryName = (id: string) =>
    catsQ.data?.items?.find((c) => c.id === id)?.name ?? 'Category';

  const header = (
    <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
      {/* ── KPI row ───────────────────────────────────────────────────────── */}
      <Row gap={space.sm} align="stretch" style={{ marginBottom: space.sm }}>
        <KpiTile label="Total spent (approved)" value={rupees(approvedTotal)} foot="vs previous month">
          <View style={{ marginTop: 3 }}>
            <SpendDelta current={approvedTotal} previous={previousTotal} />
          </View>
        </KpiTile>
        <KpiTile
          label="Pending approval"
          value={pendingRows.length}
          tone={pendingRows.length > 0 ? 'warn' : undefined}
          foot={
            pendingRows.length > 0
              ? `${rupees(pendingPaise)} waiting in the list below`
              : 'nothing waiting'
          }
        />
      </Row>
      <Row gap={space.sm} align="stretch" style={{ marginBottom: space.lg }}>
        <KpiTile
          label="Top category"
          value={topCategory?.category_name ?? '—'}
          foot={topCategory ? rupees(topCategory.total_paise) : 'no approved spend yet'}
        />
        <KpiTile
          label="Avg spend / day"
          value={rupees(Math.round(approvedTotal / daysElapsed))}
          foot={`over ${daysElapsed} day${daysElapsed === 1 ? '' : 's'}`}
        />
      </Row>

      {/* ── Where the money went ──────────────────────────────────────────── */}
      {categories.length > 0 && (
        <Section title="🧾 Where the money went">
          <Card>
            <Text style={styles.cardSub}>
              Approved spend by category · bars are share of the month&apos;s total.
            </Text>
            <Row gap={space.md} align="center" style={{ marginTop: space.md }}>
              <Donut
                size={104}
                data={categories.map((c, i) => ({
                  value: c.total_paise,
                  color: chartColors[i % chartColors.length],
                }))}
                caption="TOTAL"
                centerValue={rupees(approvedTotal)}
              />
              <View style={{ flex: 1, minWidth: 0, gap: space.sm }}>
                {categories.slice(0, CATEGORY_BAR_CAP).map((c, i) => {
                  const pct = approvedTotal > 0 ? (c.total_paise / approvedTotal) * 100 : 0;
                  const color = chartColors[i % chartColors.length];
                  const prev =
                    (summary.previous_items ?? []).find(
                      (p) => p.category_name === c.category_name,
                    )?.total_paise ?? 0;
                  return (
                    <View key={c.category_name}>
                      <Row gap={space.xs} justify="space-between">
                        <Row gap={5} style={{ flex: 1, minWidth: 0 }}>
                          <View style={[styles.swatch, { backgroundColor: color }]} />
                          <Text style={styles.catName} numberOfLines={1}>
                            {c.category_name}
                          </Text>
                          <Text style={styles.catPct}>{pct.toFixed(0)}%</Text>
                        </Row>
                        <Row gap={4}>
                          <Text style={styles.catValue}>{rupees(c.total_paise)}</Text>
                          <SpendDelta current={c.total_paise} previous={prev} />
                        </Row>
                      </Row>
                      <View style={{ marginTop: 3 }}>
                        <Track pct={pct} color={color} height={5} />
                      </View>
                    </View>
                  );
                })}
                {categories.length > CATEGORY_BAR_CAP && (
                  <Text style={styles.smallNote}>
                    + {categories.length - CATEGORY_BAR_CAP} smaller categories in the donut
                  </Text>
                )}
              </View>
            </Row>
          </Card>
        </Section>
      )}

      {/* ── Spend trend ───────────────────────────────────────────────────── */}
      <Section title="📉 Spend trend">
        <Card>
          <Text style={styles.cardSub}>Total expenses per month · last 12 months.</Text>
          {trend.length > 1 ? (
            <View style={{ marginTop: space.sm }}>
              <BarChart data={trend} width={300} height={104} color={colors.danger} />
            </View>
          ) : (
            <Text style={[styles.smallNote, { marginTop: space.md }]}>
              Not enough history yet.
            </Text>
          )}
        </Card>
      </Section>

      {/* ── Spend by person ───────────────────────────────────────────────── */}
      {hasFinancials && (summary.by_person?.length ?? 0) > 0 && (
        <Section title="👥 Spend by person">
          <Card>
            <Text style={styles.cardSub}>
              Approved spend logged against each person this month.
            </Text>
            <View style={{ marginTop: space.md }}>
              <RankBars
                labelWidth={92}
                rows={(summary.by_person ?? []).slice(0, 8).map((p, i) => ({
                  label: p.person,
                  sub: `${p.count} expense${p.count === 1 ? '' : 's'}`,
                  value: rupees(p.total_paise),
                  pct: approvedTotal > 0 ? (p.total_paise / approvedTotal) * 100 : 0,
                  color: chartColors[i % chartColors.length],
                }))}
              />
            </View>
          </Card>
        </Section>
      )}

      <Row justify="space-between" style={{ marginBottom: space.sm }}>
        <Text style={styles.listHeading}>
          {items.length} expense{items.length === 1 ? '' : 's'}
        </Text>
        {activeFilterCount > 0 && (
          <Pressable onPress={clearFilters} hitSlop={8}>
            <Text style={styles.clearLink}>Clear filters</Text>
          </Pressable>
        )}
      </Row>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ ...styles.headerBox, paddingTop: insets.top + space.sm }}>
        <Header
          title="Expenses"
          subtitle={`${MONTH_FULL[month - 1]} ${year} · ${rupees(approvedTotal)} approved`}
        />
        <Row gap={space.sm}>
          <Button
            variant="primary"
            iconName="add-circle-outline"
            label="Add expense"
            onPress={() => setShowAdd(true)}
            style={{ flex: 2 }}
          />
          <Button
            variant="secondary"
            iconName="options-outline"
            label={activeFilterCount ? `Filters (${activeFilterCount})` : 'Filters'}
            onPress={() => setFiltersOpen(true)}
            style={{ flex: 1 }}
          />
        </Row>

        {/* Month strip — the one filter worth a permanent slot on a phone. */}
        <ChipStrip>
          {MONTH_LABELS.map((m, i) => (
            <Chip
              key={m}
              label={m}
              active={month === i + 1}
              onPress={() => setMonth(i + 1)}
            />
          ))}
        </ChipStrip>

        {/* Active-filter summary so a narrowed list is never mistaken for empty. */}
        {activeFilterCount > 0 && (
          <ChipStrip>
            {categoryFilter !== 'ALL' && (
              <Chip
                label={categoryName(categoryFilter)}
                active
                iconName="close"
                onPress={() => setCategoryFilter('ALL')}
              />
            )}
            {paidByFilter !== 'ALL' && (
              <Chip label={paidByFilter} active iconName="close" onPress={() => setPaidByFilter('ALL')} />
            )}
            {statusFilter !== 'ALL' && (
              <Chip
                label={titleCase(statusFilter)}
                active
                iconName="close"
                onPress={() => setStatusFilter('ALL')}
              />
            )}
            {modeFilter !== 'ALL' && (
              <Chip
                label={MODE_FILTERS.find((m) => m.value === modeFilter)?.label ?? modeFilter}
                active
                iconName="close"
                onPress={() => setModeFilter('ALL')}
              />
            )}
            {!!search.trim() && (
              <Chip label={`“${search.trim()}”`} active iconName="close" onPress={() => setSearch('')} />
            )}
          </ChipStrip>
        )}
      </View>

      {listQ.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={listQ.isRefetching}
              onRefresh={() => {
                listQ.refetch();
                summaryQ.refetch();
              }}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => <ExpenseRow item={item} />}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: space.lg }}>
              <Empty
                iconName="receipt-outline"
                title={
                  activeFilterCount > 0
                    ? 'No expenses match these filters'
                    : `No expenses for ${MONTH_FULL[month - 1]} ${year}`
                }
                hint={
                  activeFilterCount > 0
                    ? 'Clear a filter or pick a different month.'
                    : 'Tap “Add expense” to record one — category, vendor, paid-by, all in one flow.'
                }
                action={
                  activeFilterCount > 0 ? (
                    <Button label="Clear filters" variant="secondary" onPress={clearFilters} />
                  ) : undefined
                }
              />
            </View>
          }
        />
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        month={month}
        setMonth={setMonth}
        year={year}
        setYear={setYear}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        categories={catsQ.data?.items ?? []}
        paidByFilter={paidByFilter}
        setPaidByFilter={setPaidByFilter}
        payers={(summary.by_person ?? [])
          .map((p) => p.person)
          .filter((p) => p && p !== 'Unattributed')}
        showPayer={hasFinancials}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        modeFilter={modeFilter}
        setModeFilter={setModeFilter}
        search={search}
        setSearch={setSearch}
        onClear={clearFilters}
      />

      {showAdd && (
        <AddExpenseModal
          propertyId={selectedPropertyId ?? null}
          onClose={() => setShowAdd(false)}
        />
      )}
    </View>
  );
}

// ── Expense row ─────────────────────────────────────────────────────────────

function ExpenseRow({ item }: { item: Expense }) {
  const status = statusOf(item);
  const date = item.purchase_date ?? item.expense_date;
  return (
    <Card
      style={{
        ...styles.row,
        ...(status === 'PENDING' ? { borderColor: colors.warnLine, backgroundColor: '#fffdf6' } : null),
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.description || item.category_name || 'Expense'}
        </Text>
        <Row gap={space.xs} wrap>
          {!!item.category_name && (
            <Tag label={item.category_name} kind={tagKindFor(item.category_name)} />
          )}
          {!!item.payment_mode && <Tag label={item.payment_mode.replace(/_/g, ' ')} kind="ac" />}
        </Row>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatDateHuman(date)}
          {item.vendor_name ? ` · ${item.vendor_name}` : ''}
          {item.paid_by ? ` · paid by ${item.paid_by}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <Text style={styles.rowAmount}>{rupees(item.amount_paise)}</Text>
        <Pill label={titleCase(status)} tone={STATUS_TONE[status]} dot />
        {!item.receipt_path && !item.bill_photo_s3_key && (
          <Text style={styles.noReceipt}>no receipt</Text>
        )}
      </View>
    </Card>
  );
}

// ── Filter sheet ────────────────────────────────────────────────────────────

/** One labelled row of mutually-exclusive chips. Kept local (and chip-based
 *  rather than `Select`) so we never nest a Modal inside this Modal. */
function FilterRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}
      >
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            label={o.label}
            active={o.value === value}
            onPress={() => onChange(o.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function FilterSheet({
  open,
  onClose,
  month,
  setMonth,
  year,
  setYear,
  categoryFilter,
  setCategoryFilter,
  categories,
  paidByFilter,
  setPaidByFilter,
  payers,
  showPayer,
  statusFilter,
  setStatusFilter,
  modeFilter,
  setModeFilter,
  search,
  setSearch,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  month: number;
  setMonth: (v: number) => void;
  year: number;
  setYear: (v: number) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  categories: { id: string; name: string }[];
  paidByFilter: string;
  setPaidByFilter: (v: string) => void;
  payers: string[];
  showPayer: boolean;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  modeFilter: ModeFilter;
  setModeFilter: (v: ModeFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Filter expenses">
      <Field
        label="Search"
        value={search}
        onChangeText={setSearch}
        placeholder="Description, vendor, payer, UTR…"
        autoCapitalize="none"
      />

      <FilterRow<number>
        label="Month"
        value={month}
        onChange={setMonth}
        options={MONTH_LABELS.map((m, i) => ({ value: i + 1, label: m }))}
      />
      <FilterRow<number>
        label="Year"
        value={year}
        onChange={setYear}
        options={YEARS.map((y) => ({ value: y, label: String(y) }))}
      />
      <FilterRow<string>
        label="Category"
        value={categoryFilter}
        onChange={setCategoryFilter}
        options={[
          { value: 'ALL', label: 'All categories' },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      {showPayer && (
        <FilterRow<string>
          label="Paid by"
          value={paidByFilter}
          onChange={setPaidByFilter}
          options={[
            { value: 'ALL', label: 'All payers' },
            ...payers.map((p) => ({ value: p, label: p })),
          ]}
        />
      )}
      <FilterRow<StatusFilter>
        label="Approval status"
        value={statusFilter}
        onChange={setStatusFilter}
        options={STATUS_FILTERS}
      />
      <FilterRow<ModeFilter>
        label="Payment mode"
        value={modeFilter}
        onChange={setModeFilter}
        options={MODE_FILTERS}
      />

      <Spacer h={space.sm} />
      <Row gap={space.sm}>
        <Button label="Clear all" variant="secondary" onPress={onClear} style={{ flex: 1 }} />
        <Button label="Done" onPress={onClose} style={{ flex: 1 }} />
      </Row>
    </Sheet>
  );
}

// ── Add Expense modal ──────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  icon?: string;
}

function AddExpenseModal({
  propertyId,
  onClose,
}: {
  propertyId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState<string>('');
  const [categoryName, setCategoryName] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [mode, setMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER'>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: cats } = useQuery({
    queryKey: ['expense-categories', propertyId],
    queryFn: () =>
      api
        .get<{ items: Category[] }>('/expense-categories', { params: { property_id: propertyId } })
        .then((r) => r.data),
    enabled: !!propertyId,
    staleTime: Infinity,
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (data: object) => api.post('/expenses', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  async function save() {
    if (!propertyId) return Alert.alert('Pick a property first');
    if (!categoryId) return Alert.alert('Pick a category');
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return Alert.alert('Enter the amount');
    try {
      await mutateAsync({
        property_id: propertyId,
        category_id: categoryId,
        amount_paise: Math.round(n * 100),
        description: description || categoryName || undefined,
        vendor_name: vendor || undefined,
        paid_by: paidBy || undefined,
        payment_mode: mode,
        reference_number: mode !== 'CASH' ? referenceNumber || undefined : undefined,
        purchase_date: purchaseDate,
      });
      Alert.alert('✅ Expense recorded', `₹${amount} added to ${categoryName}.`);
      onClose();
    } catch (err) {
      Alert.alert('Error', getApiError(err));
    }
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalSheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
            <Text style={styles.modalTitle}>Add expense</Text>
            <View style={{ flex: 1 }} />
            <IconButton name="close" accessibilityLabel="Close" onPress={onClose} />
          </View>

          <FlatList
            data={cats?.items ?? []}
            keyExtractor={(c) => c.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginBottom: space.sm }}
            contentContainerStyle={{ gap: space.xs, paddingVertical: space.xs }}
            ListEmptyComponent={
              <ActivityIndicator color={colors.accent} style={{ paddingHorizontal: space.lg }} />
            }
            renderItem={({ item }) => (
              <Chip
                label={item.name}
                active={categoryId === item.id}
                onPress={() => {
                  setCategoryId(item.id);
                  setCategoryName(item.name);
                }}
              />
            )}
          />

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Amount (₹)"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                required
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Date"
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder={categoryName ? `e.g. ${categoryName} bill` : 'What was it for?'}
          />
          <Field
            label="Vendor (optional)"
            value={vendor}
            onChangeText={setVendor}
            placeholder="Shop / supplier"
          />
          <Field
            label="Paid by"
            value={paidBy}
            onChangeText={setPaidBy}
            placeholder="Suresh, Owner, Manager…"
          />

          <Text style={styles.filterLabel}>Mode</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            {(['CASH', 'UPI', 'BANK_TRANSFER'] as const).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[styles.modeChip, active && styles.modeChipActive]}
                >
                  <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                    {m === 'BANK_TRANSFER' ? 'BANK' : m}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {mode !== 'CASH' && (
            <Field
              label="Reference (optional)"
              value={referenceNumber}
              onChangeText={setReferenceNumber}
              placeholder="UPI ref / cheque #"
            />
          )}

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Button variant="ghost" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
            <Button
              variant="primary"
              iconName="checkmark-outline"
              label={isPending ? 'Saving…' : 'Save expense'}
              onPress={save}
              loading={isPending}
              block
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerBox: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
    backgroundColor: colors.bg,
  },

  cardSub: { fontSize: 11, color: colors.textDim, fontWeight: '600', lineHeight: 15 },
  smallNote: { fontSize: 10.5, color: colors.textDim, fontWeight: '700' },

  swatch: { width: 9, height: 9, borderRadius: 3 },
  catName: { fontSize: 11.5, fontWeight: '800', color: colors.text, flexShrink: 1 },
  catPct: { fontSize: 10.5, fontWeight: '700', color: colors.textDim },
  catValue: { fontSize: 11.5, fontWeight: '800', color: colors.text },

  listHeading: { fontSize: fontSize.small, fontWeight: '800', color: colors.textMuted },
  clearLink: { fontSize: fontSize.small, fontWeight: '800', color: colors.accent },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginBottom: space.sm,
    marginHorizontal: space.lg,
    padding: space.md,
  },
  rowTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.text },
  rowMeta: { fontSize: 10.5, color: colors.textDim, fontWeight: '600' },
  rowAmount: { fontSize: fontSize.body, fontWeight: '800', color: colors.text },
  noReceipt: { fontSize: 9.5, color: colors.textDim, fontWeight: '700' },

  filterLabel: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: space.xs,
  },

  modalBg: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    padding: space.lg,
    paddingBottom: space.xxl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '95%',
  },
  modalTitle: { fontSize: fontSize.h2, fontWeight: '700', color: colors.text },

  modeChip: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeChipText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textMuted },
  modeChipTextActive: { color: colors.white },
});
