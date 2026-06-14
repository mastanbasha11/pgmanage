import { useState } from 'react';
import { Send, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';

import { PageHeader, SectionHeader } from './_shared';

const GOOGLE_MAPS_URL = 'https://www.google.com/maps';
const INSTAGRAM_URL = 'https://www.instagram.com';

export default function FeedbackScreen() {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  async function submit() {
    if (rating === 0) {
      toast({ title: 'Pick a star', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 400));
    setSubmitting(false);
    toast({ title: 'Thanks for the feedback!' });
    setRating(0);
    setMessage('');
  }

  return (
    <div>
      <PageHeader
        title="Tell us how we're doing"
        subtitle="Your honest feedback helps us improve."
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="font-bold">How would you rate your stay?</p>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} stars`}
                  className="p-1"
                >
                  <Star
                    className={`h-8 w-8 ${
                      n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Anything to tell us?</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Compliments, complaints, suggestions — all welcome."
              rows={5}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button onClick={submit} disabled={submitting} className="gap-2">
            <Send className="h-4 w-4" />
            {submitting ? 'Sending…' : 'Submit feedback'}
          </Button>
        </CardContent>
      </Card>

      <SectionHeader title="Share publicly" subtitle="Help others discover us" />
      <div className="grid grid-cols-2 gap-3">
        <a
          href={GOOGLE_MAPS_URL}
          target="_blank"
          rel="noopener"
          className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-700">
            G
          </div>
          <p className="mt-3 text-sm font-bold">Google Maps</p>
          <p className="text-xs text-muted-foreground">Leave a review</p>
        </a>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener"
          className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-50 text-pink-700">
            I
          </div>
          <p className="mt-3 text-sm font-bold">Instagram</p>
          <p className="text-xs text-muted-foreground">Follow us</p>
        </a>
      </div>
    </div>
  );
}
