import { useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  CalendarClock,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { useJobRuns, downloadJobRunLog, type JobRun } from '@/hooks/useJobRuns';

const JOB_LABEL: Record<string, string> = {
  rent_reminders_monthly: 'Monthly rent reminders',
  rent_overdue_daily: 'Daily overdue chase',
};

const STATUS_META: Record<
  JobRun['status'],
  { cls: string; Icon: typeof CheckCircle2 }
> = {
  SUCCESS: { cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  PARTIAL: { cls: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
  FAILED: { cls: 'bg-red-100 text-red-700', Icon: XCircle },
};

const PAGE_SIZE = 50;

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-base font-semibold ${danger && value > 0 ? 'text-red-600' : ''}`}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export default function JobMonitorPage() {
  const { toast } = useToast();
  const [jobName, setJobName] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading, isError } = useJobRuns({
    page,
    page_size: PAGE_SIZE,
    job_name: jobName === 'all' ? undefined : jobName,
    status: status === 'all' ? undefined : status,
  });
  const items = data?.items ?? [];

  async function onDownload(run: JobRun) {
    setDownloading(run.id);
    try {
      await downloadJobRunLog(run.id, run.job_name, 'txt');
    } catch {
      toast({ title: 'Download failed', description: 'Could not fetch the log file.', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Job Monitor</h1>
          <p className="text-sm text-muted-foreground">
            Every run of the rent-reminder &amp; overdue jobs — with a downloadable log.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <CalendarClock className="mr-1.5 inline h-3.5 w-3.5" />
        <strong>Monthly reminders</strong> run on the 1st at 10:00 IST ·{' '}
        <strong>Overdue chase</strong> runs daily at 10:00 IST. A run appears here even when it
        sends nothing.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={jobName}
          onValueChange={(v) => {
            setJobName(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[210px]">
            <SelectValue placeholder="Job" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            <SelectItem value="rent_reminders_monthly">Monthly rent reminders</SelectItem>
            <SelectItem value="rent_overdue_daily">Daily overdue chase</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="SUCCESS">Success</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-destructive">Couldn't load job runs.</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No job runs yet</p>
          <p className="text-xs text-muted-foreground">
            The next scheduled run (10:00 IST) will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((run) => {
            const s = STATUS_META[run.status] ?? STATUS_META.PARTIAL;
            const started = run.started_at ? new Date(run.started_at) : null;
            return (
              <div key={run.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium truncate">
                        {JOB_LABEL[run.job_name] ?? run.job_name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
                      >
                        <s.Icon className="h-3 w-3" />
                        {run.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {started ? format(started, 'd MMM yyyy, HH:mm') : '—'}
                      {run.duration_seconds != null && <> · {run.duration_seconds}s</>}
                      {run.error_count > 0 && (
                        <> · <span className="text-red-600">{run.error_count} error(s)</span></>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownload(run)}
                    disabled={downloading === run.id}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {downloading === run.id ? 'Preparing…' : 'Log'}
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 border-t pt-2">
                  <Stat label="Sent" value={run.messages_sent} />
                  <Stat label="Failed" value={run.messages_failed} danger />
                  <Stat label="Orgs" value={run.orgs_processed} />
                  <Stat label="Ledger" value={run.ledger_entries_created} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && (data.has_next || page > 1) && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            Page {page} · {data.total} runs
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!data.has_next} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
