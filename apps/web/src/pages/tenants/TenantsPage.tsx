import { useState } from 'react';
import { Plus, Search, Phone, UserPlus, Users, Upload, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTenants } from '@/hooks/useTenants';
import { useAuthStore } from '@/store/auth';
import { formatPaise, formatDate, shortRoomType } from '@/lib/utils';
import CheckinWizard from './CheckinWizard';
import ImportTenantsDialog from './ImportTenantsDialog';

export default function TenantsPage() {
  const [search, setSearch] = useState('');
  const [showCheckin, setShowCheckin] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const { selectedPropertyId } = useAuthStore();

  const { data, isLoading } = useTenants({
    property_id: selectedPropertyId ?? undefined,
    search: search || undefined,
    status: 'ACTIVE',
    sort_by: 'room',
    limit: 200,
  });

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
            <p className="text-sm text-muted-foreground">
              {data?.total ?? 0} active {(data?.total ?? 0) === 1 ? 'tenant' : 'tenants'}
              {(data?.total ?? 0) === 200 && ' (showing first 200)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setShowImport(true)}
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setShowCheckin(true)}>
              <UserPlus className="h-4 w-4" />
              Check-In
            </Button>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No tenants yet</p>
            <p className="text-sm text-muted-foreground">
              Check in your first tenant to get started.
            </p>
            <Button className="mt-4 gap-2" onClick={() => setShowCheckin(true)}>
              <Plus className="h-4 w-4" />
              Check in tenant
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tenant</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Room</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground md:table-cell">
                    Phone
                  </th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground lg:table-cell">
                    Move In
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground xl:table-cell">
                    Rent
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.items.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/tenants/${t.id}`}
                        className="font-medium hover:underline text-foreground hover:text-accent"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {t.room_number ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium tabular-nums">{t.room_number}</span>
                          {t.bed_label && (
                            <span className="text-muted-foreground">·{t.bed_label}</span>
                          )}
                          {t.room_type && (
                            <Badge variant="outline" className="text-[9px] px-1 h-4 ml-1">
                              {shortRoomType(t.room_type)}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                      {t.floor_name && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t.floor_name}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {t.phone}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {formatDate(t.move_in_date)}
                    </td>
                    <td className="hidden px-4 py-3 text-right xl:table-cell tabular-nums">
                      {t.monthly_rent_paise ? (
                        <>
                          {formatPaise(t.monthly_rent_paise)}
                          <span className="text-muted-foreground">/mo</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant={t.is_active ? 'default' : 'secondary'}>
                        {t.is_active ? 'Active' : t.status ?? 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/tenants/${t.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CheckinWizard open={showCheckin} onClose={() => setShowCheckin(false)} />
      <ImportTenantsDialog open={showImport} onClose={() => setShowImport(false)} />
    </>
  );
}
