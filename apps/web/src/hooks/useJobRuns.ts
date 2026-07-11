import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface JobRun {
  id: string;
  job_name: 'rent_reminders_monthly' | 'rent_overdue_daily' | string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  orgs_processed: number;
  messages_sent: number;
  messages_failed: number;
  ledger_entries_created: number;
  error_count: number;
}

export interface JobRunFilters {
  job_name?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

interface JobRunPage {
  items: JobRun[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

function cleanParams(filters: JobRunFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v as string | number;
  }
  return out;
}

export function useJobRuns(filters: JobRunFilters) {
  return useQuery({
    queryKey: ['job-runs', filters],
    queryFn: async () => {
      const res = await api.get<JobRunPage>('/job-runs', { params: cleanParams(filters) });
      return res.data;
    },
    placeholderData: keepPreviousData,
    // Refetch when the tab regains focus so a just-fired run shows up.
    refetchOnWindowFocus: true,
  });
}

/** Fetch the run's log file (auth header included) and trigger a browser download. */
export async function downloadJobRunLog(
  id: string,
  jobName: string,
  fmt: 'txt' | 'json' = 'txt',
) {
  const res = await api.get(`/job-runs/${id}/logfile`, {
    params: { fmt },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${jobName}_${id.slice(0, 8)}.${fmt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
