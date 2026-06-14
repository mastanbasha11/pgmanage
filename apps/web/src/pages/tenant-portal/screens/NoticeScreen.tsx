/**
 * Notice to vacate — 30-day rule with conditional warning.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { AlertTriangle, LogOut, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { useTenantGiveNotice } from '@/lib/tenant-data/hooks';

import { PageHeader } from './_shared';

const POLICY_DAYS = 30;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NoticeScreen() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const noticeM = useTenantGiveNotice();

  const [dateStr, setDateStr] = useState(isoDate(addDays(new Date(), POLICY_DAYS)));
  const daysNotice = useMemo(() => {
    try {
      return differenceInCalendarDays(parseISO(dateStr), new Date());
    } catch {
      return 0;
    }
  }, [dateStr]);

  const tooSoon = daysNotice < POLICY_DAYS;
  const invalid = daysNotice < 0;

  async function submit() {
    if (invalid) {
      toast({ title: 'Choose a future date', variant: 'destructive' });
      return;
    }
    const msg = tooSoon
      ? `Since this is ${daysNotice} day${daysNotice === 1 ? '' : 's'} away, your refundable advance will NOT be returned per the PG's 30-day notice policy. Proceed?`
      : `Your move-out date is ${format(parseISO(dateStr), 'd MMM yyyy')}. Your refundable advance will be returned at checkout. Proceed?`;
    if (!confirm(msg)) return;
    try {
      await noticeM.mutateAsync({ move_out_date: dateStr });
      toast({ title: 'Notice recorded' });
      navigate('/portal/home');
    } catch (err: unknown) {
      const m =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not record notice';
      toast({ title: 'Failed', description: m, variant: 'destructive' });
    }
  }

  return (
    <div>
      <PageHeader
        title="Moving out?"
        subtitle="Pick your intended move-out date — we'll let your PG manager know."
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label>Move-out date</Label>
            <Input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="mt-1 max-w-[220px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {invalid
                ? 'Choose today or a future date.'
                : `${daysNotice} day${daysNotice === 1 ? '' : 's'} from today`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[15, 30, 60].map((d) => (
              <Button
                key={d}
                variant="outline"
                size="sm"
                onClick={() => setDateStr(isoDate(addDays(new Date(), d)))}
              >
                +{d} days
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card
        className={`mt-4 ${
          tooSoon && !invalid
            ? 'border-amber-200 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50'
        }`}
      >
        <CardContent className="flex items-start gap-3 p-5">
          {tooSoon && !invalid ? (
            <AlertTriangle className="h-5 w-5 flex-none text-amber-700" />
          ) : (
            <ShieldCheck className="h-5 w-5 flex-none text-emerald-700" />
          )}
          <div>
            <p
              className={`font-bold ${
                tooSoon && !invalid ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {tooSoon && !invalid
                ? "Advance won't be refunded"
                : 'Advance will be refunded'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The PG's policy requires at least 30 days' notice for the refundable
              advance to be returned. Move-outs with less than 30 days' notice
              forfeit it.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6">
        <Button
          onClick={submit}
          disabled={invalid || noticeM.isPending}
          variant={tooSoon ? 'destructive' : 'default'}
          className="w-full gap-2"
        >
          <LogOut className="h-4 w-4" />
          {noticeM.isPending ? 'Submitting…' : 'Confirm notice'}
        </Button>
      </div>
    </div>
  );
}
