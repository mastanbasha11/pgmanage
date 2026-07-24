/**
 * Settings → Payments (owner-only).
 *
 * Connects the PG's OWN Razorpay account so tenants can pay rent / advance /
 * deposit online — money flows tenant→owner, the platform never holds funds.
 * Secrets are write-only: the page shows whether each is set, never the value,
 * and an empty field on save leaves the stored secret untouched.
 *
 * Flow the owner follows: paste Test keys → register the webhook URL shown here
 * in their Razorpay dashboard → paste the webhook secret → toggle on. Live keys
 * later, once their Razorpay KYC is done.
 */
import { useEffect, useState } from 'react';
import { Copy, CircleCheck, ExternalLink, KeyRound, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { getApiError } from '@/lib/api';
import {
  usePaymentGateway,
  useUpdatePaymentGateway,
} from '@/hooks/usePaymentGateway';

export default function PaymentsPage() {
  const { data: config, isLoading } = usePaymentGateway();
  const update = useUpdatePaymentGateway();
  const { toast } = useToast();

  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  useEffect(() => {
    if (config) setKeyId(config.key_id ?? '');
  }, [config]);

  async function save(extra?: { payments_enabled?: boolean }) {
    try {
      await update.mutateAsync({
        razorpay_key_id: keyId.trim() || undefined,
        // Only send secrets when the owner actually typed one — empty leaves
        // the stored value intact.
        razorpay_key_secret: keySecret.trim() || undefined,
        razorpay_webhook_secret: webhookSecret.trim() || undefined,
        ...extra,
      });
      setKeySecret('');
      setWebhookSecret('');
      toast({ title: 'Saved' });
    } catch (err) {
      toast({ title: 'Could not save', description: getApiError(err), variant: 'destructive' });
    }
  }

  async function toggleEnabled(next: boolean) {
    try {
      await update.mutateAsync({ payments_enabled: next });
      toast({ title: next ? 'Online payments enabled' : 'Online payments paused' });
    } catch (err) {
      toast({ title: 'Could not update', description: getApiError(err), variant: 'destructive' });
    }
  }

  function copyWebhook() {
    if (config?.webhook_url) {
      void navigator.clipboard.writeText(config.webhook_url);
      toast({ title: 'Webhook URL copied' });
    }
  }

  if (isLoading || !config) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Razorpay account so residents can pay rent, advance and deposit online.
          Money settles directly to your Razorpay account.
        </p>
      </div>

      {/* Status banner */}
      <Card
        className={
          config.payments_enabled
            ? 'border-accent/40 bg-accent/5'
            : 'border-amber-300 bg-amber-50'
        }
      >
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            {config.payments_enabled ? (
              <CircleCheck className="h-5 w-5 text-accent" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            )}
            <div>
              <p className="text-sm font-bold">
                {config.payments_enabled ? 'Online payments are live' : 'Online payments are off'}
              </p>
              <p className="text-xs text-muted-foreground">
                {config.key_secret_set
                  ? 'Keys connected.'
                  : 'Add your Razorpay keys below to get started.'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={config.payments_enabled ? 'outline' : 'default'}
            onClick={() => toggleEnabled(!config.payments_enabled)}
            disabled={update.isPending || !config.key_secret_set}
          >
            {config.payments_enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </CardContent>
      </Card>

      {/* Keys */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-bold">
            <KeyRound className="h-4 w-4 text-muted-foreground" /> API keys
          </div>
          <div>
            <Label htmlFor="key_id">Key ID</Label>
            <Input
              id="key_id"
              placeholder="rzp_test_… or rzp_live_…"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="key_secret">
              Key Secret {config.key_secret_set && <span className="text-accent">· set</span>}
            </Label>
            <Input
              id="key_secret"
              type="password"
              placeholder={config.key_secret_set ? '•••••••• (leave blank to keep)' : 'Key secret'}
              value={keySecret}
              onChange={(e) => setKeySecret(e.target.value)}
            />
          </div>
          <a
            href="https://dashboard.razorpay.com/app/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
          >
            Find these in Razorpay → Settings → API Keys <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      {/* Webhook */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="text-sm font-bold">Webhook</div>
          <p className="text-xs text-muted-foreground">
            In Razorpay → Settings → Webhooks, add this URL for the{' '}
            <span className="font-semibold">payment.captured</span> event, then paste the webhook
            secret you set there below.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs">
              {config.webhook_url}
            </code>
            <Button size="sm" variant="outline" onClick={copyWebhook} className="gap-1">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <div>
            <Label htmlFor="webhook_secret">
              Webhook secret{' '}
              {config.webhook_secret_set && <span className="text-accent">· set</span>}
            </Label>
            <Input
              id="webhook_secret"
              type="password"
              placeholder={
                config.webhook_secret_set ? '•••••••• (leave blank to keep)' : 'Webhook secret'
              }
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
