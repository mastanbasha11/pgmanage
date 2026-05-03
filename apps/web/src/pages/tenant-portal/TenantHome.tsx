import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, IndianRupee, Bell } from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPaise, formatDate, statusBadgeVariant } from '@/lib/utils';

export default function TenantHome() {
  const navigate = useNavigate();

  const { data: me } = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => tenantApi.get('/me').then((r) => r.data),
  });

  const { data: ledger } = useQuery({
    queryKey: ['tenant-ledger'],
    queryFn: () => tenantApi.get('/ledger').then((r) => r.data),
  });

  const { data: announcements } = useQuery({
    queryKey: ['tenant-announcements'],
    queryFn: () => tenantApi.get('/announcements').then((r) => r.data),
  });

  function logout() {
    localStorage.removeItem('tenant_access_token');
    navigate('/portal/login');
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">PGManage</h1>
          {me && <p className="text-sm text-primary-foreground/70">Hi, {me.name}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          className="text-primary-foreground hover:bg-white/10"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Rent status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-accent" />
              Rent Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Monthly Rent</p>
                <p className="font-bold mt-0.5">
                  {me ? formatPaise(me.monthly_rent_paise) : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-destructive/10 p-3">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="font-bold mt-0.5 text-destructive">
                  {ledger ? formatPaise(ledger.total_due_paise ?? 0) : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ledger entries */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ledger?.entries?.slice(0, 6).map(
                (e: {
                  id: string;
                  month: number;
                  year: number;
                  amount_due_paise: number;
                  status: string;
                }) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {new Date(e.year, e.month - 1).toLocaleString('en-IN', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>{formatPaise(e.amount_due_paise)}</span>
                      <Badge variant={statusBadgeVariant(e.status)} className="text-[10px]">
                        {e.status}
                      </Badge>
                    </div>
                  </div>
                ),
              )}
              {!ledger?.entries?.length && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No payment history yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Announcements */}
        {(announcements?.items?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-accent" />
                Announcements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements.items.slice(0, 3).map(
                  (a: { id: string; title: string; body: string; created_at: string }) => (
                    <div key={a.id} className="border-l-2 border-accent pl-3">
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDate(a.created_at)}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
