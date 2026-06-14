/**
 * Raise a new ticket — POSTs to /tenant/complaints, then back to /portal/services.
 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Send, Wrench } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tenantApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';

import { PageHeader } from './_shared';

const CATEGORY_TO_BACKEND: Record<string, string> = {
  housekeeping: 'CLEANLINESS',
  cleaning: 'CLEANLINESS',
  laundry: 'OTHER',
  wifi: 'OTHER',
  electrical: 'MAINTENANCE',
  plumbing: 'MAINTENANCE',
  other: 'OTHER',
};

export default function NewTicketScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const categoryLabel = params.get('categoryLabel') ?? 'Other';
  const categoryValue = params.get('category') ?? 'other';
  const backendCategory = CATEGORY_TO_BACKEND[categoryValue] ?? 'OTHER';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (title.trim().length < 4 || description.trim().length < 10) {
      toast({
        title: 'A bit more detail',
        description: 'Title (4+ chars) and a description (10+ chars).',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    try {
      // Backend complaint table doesn't store a `title` column; we
      // prepend it to the description so the staff app sees both.
      const body = `${title.trim()}\n\n${description.trim()}`;
      await tenantApi.post('/complaints', {
        category: backendCategory,
        description: body,
      });
      qc.invalidateQueries({ queryKey: ['tenant-tickets'] });
      toast({ title: 'Ticket raised' });
      navigate('/portal/services');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not raise ticket';
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="New ticket" subtitle={categoryLabel} />

      <Card className="mb-4">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Category
            </p>
            <p className="font-bold">{categoryLabel}</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div>
          <Label>What's the issue?</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title (e.g. Wi-Fi dropping in the evening)"
            maxLength={120}
            className="mt-1"
          />
        </div>
        <div>
          <Label>Describe in detail</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When it happens, what you've tried, anything else useful."
            rows={5}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} className="gap-2">
            <Send className="h-4 w-4" />
            {submitting ? 'Sending…' : 'Raise ticket'}
          </Button>
        </div>
      </div>
    </div>
  );
}
