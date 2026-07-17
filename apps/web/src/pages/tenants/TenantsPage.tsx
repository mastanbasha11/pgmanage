/**
 * Tenants — redesigned per Claude UX/tenants.html.
 *
 * Header sub shows active count · beds free · on-notice count.
 * Toolbar: rounded search + segmented status control with colored dots
 * and live counts. Table: green room badge (room·bed) with share/floor
 * meta, avatar + phone tenant cell, move-in with tenure, right-aligned
 * rent, stacked Active/Notice pills, hover edit icon.
 */
import { useState } from 'react';
import { Plus, Search, Phone, UserPlus, Users, Upload, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NameAvatar, Pill } from '@/components/ui/redesign';
import { useTenants } from '@/hooks/useTenants';
import { useProperties } from '@/hooks/useProperties';
import { useAuthStore } from '@/store/auth';
import { cn, formatPaise, formatDate, shortRoomType } from '@/lib/utils';
import CheckinWizard from './CheckinWizard';
import ImportTenantsDialog from './ImportTenantsDialog';

/**
 * Filter options for the tenants page. NOTICE is a virtual filter — under the
 * hood it sends status=ACTIVE + has_notice=true to the API, so it only
 * surfaces tenants who are still around but on the way out.
 */
type StatusFilter = 'ACTIVE' | 'NOTICE' | 'CHECKED_OUT' | 'ALL';

/** "4 mo here" / "12 days here" tenure string under the move-in date. */
function tenure(iso: string): string {
  const days = Math.round((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 0) return 'starts soon';
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} here`;
  const mo = Math.round(days / 30.4);
  if (mo < 12) return `${mo} mo here`;
  const yr = Math.floor(mo / 12);
  const rem = mo % 12;
  return rem ? `${yr}y ${rem}m here` : `${yr} yr${yr === 1 ? '' : 's'} here`;
}

export default function TenantsPage() {
  const [search, setSearch] = useState('');
  const [showCheckin, setShowCheckin] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const { selectedPropertyId } = useAuthStore();

  const { data, isLoading } = useTenants({
    property_id: selectedPropertyId ?? undefined,
    search: search || undefined,
    status:
      statusFilter === 'ALL'
        ? undefined
        : statusFilter === 'NOTICE'
          ? 'ACTIVE'
          : statusFilter,
    has_notice: statusFilter === 'NOTICE' ? true : undefined,
    sort_by: 'room',
    limit: 200,
  });

  // Counts for the segmented control + header sub, independent of the
  // filter currently applied (limit 1 keeps them cheap).
  const { data: activeCount } = useTenants({
    property_id: selectedPropertyId ?? undefined,
    status: 'ACTIVE',
    limit: 1,
  });
  const { data: noticeCount } = useTenants({
    property_id: selectedPropertyId ?? undefined,
    status: 'ACTIVE',
    has_notice: true,
    limit: 1,
  });
  const { data: propertiesData } = useProperties();
  const vacantBeds =
    propertiesData?.items.find((p) => p.id === selectedPropertyId)?.vacant_beds ?? null;

  const SEGMENTS: { key: StatusFilter; label: string; dot?: string; count?: number }[] = [
    { key: 'ACTIVE', label: 'Active', dot: '#22a559', count: activeCount?.total },
    { key: 'NOTICE', label: 'Notice given', dot: '#e0912f', count: noticeCount?.total },
    { key: 'CHECKED_OUT', label: 'Checked-out', dot: '#9aa1ad' },
    { key: 'ALL', label: 'All' },
  ];

  return (
    <>
      <div className="mx-auto max-w-[1240px] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3.5">
          <div>
            <h1 className="text-[21px] font-extrabold tracking-tight">Tenants</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              <b className="text-foreground">{activeCount?.total ?? '…'}</b> active tenants
              {vacantBeds != null && (
                <>
                  {' '}
                  · <b className="text-foreground">{vacantBeds}</b> beds free
                </>
              )}
              {(noticeCount?.total ?? 0) > 0 && <> · {noticeCount!.total} on notice</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-2 rounded-xl font-bold"
              onClick={() => setShowImport(true)}
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button
              size="sm"
              className="h-9 gap-2 rounded-xl font-bold"
              onClick={() => setShowCheckin(true)}
            >
              <UserPlus className="h-4 w-4" />
              Check-In
            </Button>
          </div>
        </div>

        {/* Toolbar — search + segmented status control */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-[420px] flex-1 basis-[320px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a0ad]" />
            <Input
              placeholder="Search by name, phone or room…"
              className="h-10 rounded-xl pl-9 text-sm shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
            {SEGMENTS.map((s) => {
              const on = statusFilter === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatusFilter(s.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors',
                    on ? 'bg-[#161b26] text-white' : 'text-[#4a5261] hover:bg-secondary',
                  )}
                >
                  {s.dot && (
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: s.dot }} />
                  )}
                  {s.label}
                  {s.count != null && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-[11px] font-extrabold',
                        on ? 'bg-white/20 text-white' : 'bg-secondary text-[#5c6472]',
                      )}
                    >
                      {s.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-bold">
              {statusFilter === 'CHECKED_OUT'
                ? 'No checked-out tenants'
                : statusFilter === 'NOTICE'
                ? 'No tenants on notice'
                : search
                ? 'No matches'
                : 'No tenants yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'CHECKED_OUT'
                ? 'Tenants who have checked out will appear here.'
                : statusFilter === 'NOTICE'
                ? 'Use the “Give notice” button on a tenant’s page when they tell you they’re vacating.'
                : search
                ? 'Try a different name or phone number.'
                : 'Check in your first tenant to get started.'}
            </p>
            {statusFilter !== 'CHECKED_OUT' && statusFilter !== 'NOTICE' && !search && (
              <Button className="mt-4 gap-2 rounded-xl font-bold" onClick={() => setShowCheckin(true)}>
                <Plus className="h-4 w-4" />
                Check in tenant
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-md">
            {/* header row */}
            <div className="hidden grid-cols-[220px_1.4fr_150px_130px_200px_52px] items-center gap-2.5 border-b bg-[#fbfcfe] px-5 py-3 md:grid">
              {['Room', 'Tenant', 'Move-in', 'Rent', 'Status', ''].map((h, i) => (
                <span
                  key={i}
                  className={cn(
                    'text-[11px] font-extrabold uppercase tracking-wider text-[#98a0ad]',
                    h === 'Rent' && 'text-right',
                  )}
                >
                  {h}
                </span>
              ))}
            </div>

            {data?.items.map((t) => (
              <Link
                key={t.id}
                to={`/tenants/${t.id}`}
                className="group grid grid-cols-1 items-center gap-2.5 border-b border-[#eceff4] px-5 py-3 transition-colors last:border-b-0 hover:bg-[#f8fafd] md:grid-cols-[220px_1.4fr_150px_130px_200px_52px]"
              >
                {/* Room */}
                <div className="flex items-center gap-2.5">
                  {t.room_number ? (
                    <>
                      <span className="flex h-10 min-w-[44px] flex-col items-center justify-center rounded-xl border border-[#c3e9d0] bg-[#e9f9ef] px-2 leading-none">
                        <b className="text-[15px] tracking-tight text-[#146c37]">
                          {t.room_number}
                        </b>
                        {t.bed_label && (
                          <span className="mt-0.5 text-[10px] font-extrabold text-[#3f9d63]">
                            ·{t.bed_label}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        {t.room_type && (
                          <span className="text-xs font-bold text-[#40485a]">
                            {shortRoomType(t.room_type)}
                          </span>
                        )}
                        {t.floor_name && (
                          <span className="text-[11.5px] text-[#98a0ad]">{t.floor_name}</span>
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </div>

                {/* Tenant */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <NameAvatar name={t.name} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold tracking-tight group-hover:text-accent">
                      {t.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 flex-none text-[#98a0ad]" />
                      {t.phone}
                    </p>
                  </div>
                </div>

                {/* Move-in */}
                <div>
                  <p className="text-[13.5px] font-semibold text-[#3a4150]">
                    {formatDate(t.move_in_date)}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[#98a0ad]">{tenure(t.move_in_date)}</p>
                </div>

                {/* Rent */}
                <div className="md:text-right">
                  {t.monthly_rent_paise ? (
                    <>
                      <span className="tnum text-sm font-extrabold tracking-tight">
                        {formatPaise(t.monthly_rent_paise)}
                      </span>
                      <span className="text-[11px] font-semibold text-[#98a0ad]">/mo</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </div>

                {/* Status */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={t.is_active ? 'g' : 's'}>
                    {t.is_active ? 'Active' : t.status ?? 'Inactive'}
                  </Pill>
                  {t.is_active && t.notice_given_date && t.expected_move_out_date && (
                    <Pill
                      tone="a"
                      dot={false}
                      className="cursor-help"
                    >
                      Notice · {formatDate(t.expected_move_out_date)}
                    </Pill>
                  )}
                </div>

                {/* Edit */}
                <div className="hidden justify-end md:flex">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[#98a0ad] transition-colors group-hover:text-[#4a5261] hover:border hover:border-border hover:bg-secondary">
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}

            {/* footer */}
            <div className="flex items-center justify-between border-t border-[#eceff4] bg-[#fbfcfe] px-5 py-3 text-[12.5px] text-muted-foreground">
              <span>
                Showing {data?.items.length ?? 0}
                {statusFilter === 'ACTIVE' && activeCount?.total
                  ? ` of ${activeCount.total}`
                  : ''}
              </span>
              {(data?.total ?? 0) === 200 && <span>first 200 shown — refine the search</span>}
            </div>
          </div>
        )}
      </div>

      <CheckinWizard open={showCheckin} onClose={() => setShowCheckin(false)} />
      <ImportTenantsDialog open={showImport} onClose={() => setShowImport(false)} />
    </>
  );
}
