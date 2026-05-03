import { useRef, useState } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/useToast';

interface ImportError {
  row: number;
  name?: string;
  error: string;
}

interface ImportResult {
  created: number;
  errors: ImportError[];
  total_rows: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ImportTenantsDialog({ open, onClose }: Props) {
  const { selectedPropertyId } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const upload = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      const r = await api.post<ImportResult>(
        `/tenants/bulk-import?property_id=${selectedPropertyId}`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return r.data;
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      toast({
        title: `${data.created} tenants imported`,
        description: data.errors.length
          ? `${data.errors.length} row${data.errors.length === 1 ? '' : 's'} skipped`
          : 'No errors.',
      });
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Upload failed';
      toast({ title: 'Import failed', description: message, variant: 'destructive' });
    },
  });

  function downloadSample() {
    const token = localStorage.getItem('access_token');
    fetch('/api/v1/tenants/import/sample.csv', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pgmanage_tenants_sample.csv';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast({ title: 'Could not download sample', variant: 'destructive' }));
  }

  function close() {
    setFile(null);
    setResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import tenants from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV with one tenant per row. Each tenant is checked into a specific bed.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-medium mb-1">Required columns</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <code className="font-mono">name, phone, id_type, id_number, emergency_contact_name,
                  emergency_contact_phone, emergency_contact_relation, bed_label, room_number,
                  floor_name, move_in_date, monthly_rent</code>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Optional columns: <code>email, security_deposit, advance_paid, billing_day</code>.
                Phone numbers can be 10-digit or +91 format. <code>floor_name</code> and{' '}
                <code>room_number</code> must already exist.
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={downloadSample}>
                <Download className="h-4 w-4" />
                Download sample CSV
              </Button>
            </div>

            <div>
              <label
                htmlFor="csv-file"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted/20 px-6 py-8 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {file ? file.name : 'Click to choose a CSV file'}
                </p>
                <p className="text-xs text-muted-foreground">.csv, up to 5 MB</p>
                <input
                  ref={fileRef}
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {!selectedPropertyId && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Pick a property from the sidebar before importing.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => file && upload.mutate(file)}
                disabled={!file || !selectedPropertyId || upload.isPending}
              >
                {upload.isPending ? 'Importing...' : 'Start Import'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-semibold">
                  {result.created} of {result.total_rows} tenants imported
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {result.errors.length} row
                    {result.errors.length === 1 ? '' : 's'} skipped
                  </p>
                  <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 rounded bg-muted/40 p-2 text-xs">
                    {result.errors.map((e, i) => (
                      <li key={i} className="border-b last:border-0 border-border/40 pb-1">
                        <span className="font-medium">Row {e.row}</span>{' '}
                        {e.name ? `(${e.name})` : ''} — {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
