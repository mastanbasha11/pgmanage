/**
 * Settings → Menu — owner uploads a weekly menu (PDF or image).
 *
 * Layout: hero upload card on top + reverse-chronological list of past
 * weeks below. Re-uploading the same week replaces the existing file
 * (backend deactivates the prior row).
 *
 * The presigned-upload flow is three steps client-side:
 *
 *   1. POST /menu/upload-url to mint a PUT URL.
 *   2. PUT the File directly to S3.
 *   3. POST /menu with the returned s3_key + metadata to persist.
 *
 * Why direct-to-S3 rather than streaming through the backend: keeps the
 * backend stateless for large files (a 5MB PDF would otherwise sit in
 * uvicorn's memory) + matches the existing tenant-ID-proof upload pattern.
 */
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, startOfWeek, addDays } from 'date-fns';
import {
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  UtensilsCrossed,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/auth';
import { useProperties } from '@/hooks/useProperties';
import {
  uploadFileToS3,
  useCreateMenu,
  useDeleteMenu,
  useMenuFileUrl,
  useMenuUploadUrl,
  useMenus,
  type MenuUpload,
} from '@/hooks/useMenu';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

function mondayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

function isoDate(d: Date): string {
  // Local-timezone-safe ISO date (avoids the toISOString() UTC drift bug).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MenuPage() {
  const { toast } = useToast();
  const propertyId = useAuthStore((s) => s.selectedPropertyId);
  const { data: properties } = useProperties();
  const propertyName = useMemo(
    () => properties?.items?.find((p) => p.id === propertyId)?.name ?? '',
    [properties, propertyId],
  );

  const menusQ = useMenus(propertyId);
  const uploadUrlM = useMenuUploadUrl();
  const createMenuM = useCreateMenu();
  const fileUrlM = useMenuFileUrl();
  const deleteMenuM = useDeleteMenu();

  // Upload form state
  const [weekStart, setWeekStart] = useState(isoDate(mondayOf(new Date())));
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Keep weekStart snapped to a Monday client-side so the UI agrees with
  // the server's normalisation. If user picks Wed, we snap forward to Mon.
  useEffect(() => {
    const picked = parseISO(weekStart);
    const monday = mondayOf(picked);
    const snapped = isoDate(monday);
    if (snapped !== weekStart) setWeekStart(snapped);
  }, [weekStart]);

  async function handleUpload() {
    if (!propertyId) {
      toast({ title: 'Select a property first', variant: 'destructive' });
      return;
    }
    if (!file) {
      toast({ title: 'Choose a file', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const presigned = await uploadUrlM.mutateAsync({
        property_id: propertyId,
        filename: file.name,
      });
      await uploadFileToS3(presigned, file);
      await createMenuM.mutateAsync({
        property_id: propertyId,
        week_start_date: weekStart,
        s3_key: presigned.s3_key,
        content_type: presigned.content_type,
        original_filename: file.name,
        title: title.trim() || undefined,
      });
      toast({
        title: 'Menu uploaded',
        description: `${propertyName || 'Property'} — week of ${format(parseISO(weekStart), 'MMM d, yyyy')}`,
      });
      setFile(null);
      setTitle('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Upload failed';
      toast({ title: 'Could not upload', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function preview(menu: MenuUpload) {
    try {
      const { url } = await fileUrlM.mutateAsync(menu.id);
      window.open(url, '_blank', 'noopener');
    } catch {
      toast({ title: 'Could not open preview', variant: 'destructive' });
    }
  }

  async function remove(menu: MenuUpload) {
    if (!propertyId) return;
    if (!confirm(`Remove menu for week of ${format(parseISO(menu.week_start_date), 'MMM d')}?`))
      return;
    try {
      await deleteMenuM.mutateAsync({ id: menu.id, property_id: propertyId });
      toast({ title: 'Menu removed' });
    } catch {
      toast({ title: 'Could not remove', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-accent/10 p-2.5">
          <UtensilsCrossed className="h-6 w-6 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Weekly menu</h1>
          <p className="text-sm text-muted-foreground">
            Upload the food menu residents see in their app. PDF or image — one file per week.
          </p>
        </div>
      </header>

      {/* Upload card */}
      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-medium">Week starting</Label>
              <div className="mt-1 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="max-w-[200px]"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Snaps to Monday. Covers Mon –{' '}
                {format(addDays(parseISO(weekStart), 6), 'EEE, d MMM')}.
              </p>
            </div>
            <div>
              <Label className="text-xs font-medium">Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. North-Indian week, Diwali special"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">File</Label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="file"
                accept={ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="sm:max-w-md"
              />
              {file ? (
                <span className="text-xs text-muted-foreground">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              PDF, JPG, PNG, or WEBP. A new upload for the same week replaces the old one.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={uploading || !file || !propertyId}
              className="gap-2"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? 'Uploading…' : 'Upload menu'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Uploaded menus
        </h2>
        {menusQ.isLoading ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </CardContent>
          </Card>
        ) : !menusQ.data?.items?.length ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No menus uploaded yet. Use the form above to add this week's.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {menusQ.data.items.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-muted p-2.5">
                      {m.content_type === 'application/pdf' ? (
                        <FileText className="h-5 w-5 text-rose-600" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-sky-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          Week of {format(parseISO(m.week_start_date), 'd MMM yyyy')}
                        </span>
                        {isCurrentWeek(m.week_start_date) ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                            Current
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {m.title || m.original_filename || 'Menu'} ·{' '}
                        {format(parseISO(m.uploaded_at), 'd MMM, h:mm a')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => preview(m)}>
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function isCurrentWeek(weekStartDateIso: string): boolean {
  return weekStartDateIso === isoDate(mondayOf(new Date()));
}
