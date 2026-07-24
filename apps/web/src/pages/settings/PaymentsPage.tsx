/**
 * Settings → Payments (owner-only).
 *
 * A guided, plain-language setup so a non-technical PG owner can connect their
 * OWN Razorpay account and let residents pay rent / advance / deposit online.
 * Money flows tenant→owner; the platform never holds funds.
 *
 * Secrets are write-only: the page shows whether each is set, never the value,
 * and an empty field on save leaves the stored secret untouched.
 */
import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { getApiError } from '@/lib/api';
import { usePaymentGateway, useUpdatePaymentGateway } from '@/hooks/usePaymentGateway';

/** A numbered step wrapper with a done/undone circle. */
function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-extrabold ${
              done ? 'bg-accent text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            {done ? <Check className="h-4 w-4" /> : n}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{title}</h2>
            <div className="mt-2 space-y-3 text-sm">{children}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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

  const keysDone = !!config?.key_secret_set && !!config?.key_id;
  const webhookDone = !!config?.webhook_secret_set;
  const liveOn = !!config?.payments_enabled;

  async function saveKeys() {
    try {
      await update.mutateAsync({
        razorpay_key_id: keyId.trim() || undefined,
        razorpay_key_secret: keySecret.trim() || undefined,
      });
      setKeySecret('');
      toast({ title: 'Saved your keys' });
    } catch (err) {
      toast({ title: 'Could not save', description: getApiError(err), variant: 'destructive' });
    }
  }

  async function saveWebhook() {
    try {
      await update.mutateAsync({ razorpay_webhook_secret: webhookSecret.trim() || undefined });
      setWebhookSecret('');
      toast({ title: 'Saved the secret word' });
    } catch (err) {
      toast({ title: 'Could not save', description: getApiError(err), variant: 'destructive' });
    }
  }

  async function toggleEnabled(next: boolean) {
    try {
      await update.mutateAsync({ payments_enabled: next });
      toast({ title: next ? 'Online payments are ON 🎉' : 'Online payments paused' });
    } catch (err) {
      toast({ title: 'Could not update', description: getApiError(err), variant: 'destructive' });
    }
  }

  function copyWebhook() {
    if (config?.webhook_url) {
      void navigator.clipboard.writeText(config.webhook_url);
      toast({ title: 'Copied! Now paste it in Razorpay.' });
    }
  }

  if (isLoading || !config) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Accept payments online</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Let your residents pay rent, advance and deposit from their phone. The money goes
          straight to your bank account. Just follow the steps below one by one.
        </p>
      </div>

      {/* Big status ribbon */}
      <div
        className={`rounded-xl px-4 py-3 text-sm font-bold ${
          liveOn ? 'bg-accent/10 text-accent' : 'bg-amber-50 text-amber-700'
        }`}
      >
        {liveOn
          ? '✅ Online payments are ON. Residents can pay you now.'
          : '⏳ Not on yet. Finish the steps below, then turn it on in Step 4.'}
      </div>

      {/* Step 1 — account */}
      <Step n={1} title="Make a free Razorpay account">
        <p className="text-muted-foreground">
          Razorpay is a trusted company that safely moves money from your residents into your bank.
          Making an account is <span className="font-semibold">free</span>. Use your PG's phone
          number and email.
        </p>
        <a href="https://razorpay.com/" target="_blank" rel="noreferrer">
          <Button variant="outline" className="gap-1.5">
            Open Razorpay <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
      </Step>

      {/* Step 2 — keys */}
      <Step n={2} title="Copy your two secret keys" done={keysDone}>
        <p className="text-muted-foreground">
          Inside Razorpay, tap{' '}
          <span className="font-semibold text-foreground">Settings → API Keys → Generate Key</span>.
          You'll get two words — a <span className="font-semibold text-foreground">Key Id</span> and
          a <span className="font-semibold text-foreground">Key Secret</span>. Copy each one and
          paste it below.
        </p>
        <div>
          <Label htmlFor="key_id">Key Id (starts with rzp_)</Label>
          <Input
            id="key_id"
            placeholder="rzp_test_XXXXXXXX"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="key_secret">
            Key Secret {config.key_secret_set && <span className="text-accent">· saved ✓</span>}
          </Label>
          <Input
            id="key_secret"
            type="password"
            placeholder={config.key_secret_set ? 'Already saved — leave blank to keep it' : 'Paste the secret'}
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
          />
        </div>
        <Button onClick={saveKeys} disabled={update.isPending}>
          Save keys
        </Button>
      </Step>

      {/* Step 3 — webhook */}
      <Step n={3} title="Connect the two apps (webhook)" done={webhookDone}>
        <p className="text-muted-foreground">
          This lets Razorpay tell PGManage the moment a resident pays. Do these three little things:
        </p>
        <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
          <li>
            Copy the web address below (tap <span className="font-semibold text-foreground">Copy</span>).
          </li>
          <li>
            In Razorpay, go to{' '}
            <span className="font-semibold text-foreground">Settings → Webhooks → Add New Webhook</span>,
            paste it, and tick the box named{' '}
            <span className="font-semibold text-foreground">payment.captured</span>.
          </li>
          <li>
            Razorpay asks for a <span className="font-semibold text-foreground">secret</span> — type any
            password you like (e.g. <span className="italic">myloop2026</span>), then type the{' '}
            <span className="font-semibold text-foreground">same</span> word below.
          </li>
        </ol>
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
            The same secret word{' '}
            {config.webhook_secret_set && <span className="text-accent">· saved ✓</span>}
          </Label>
          <Input
            id="webhook_secret"
            type="password"
            placeholder={config.webhook_secret_set ? 'Already saved — leave blank to keep it' : 'Type your secret word'}
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
          />
        </div>
        <Button onClick={saveWebhook} disabled={update.isPending}>
          Save secret word
        </Button>
      </Step>

      {/* Step 4 — turn on */}
      <Step n={4} title="Turn on online payments" done={liveOn}>
        {keysDone ? (
          <>
            <p className="text-muted-foreground">
              Everything's ready. Flip the switch and your residents will see a{' '}
              <span className="font-semibold text-foreground">Pay</span> button.
            </p>
            <Button
              onClick={() => toggleEnabled(!liveOn)}
              disabled={update.isPending}
              variant={liveOn ? 'outline' : 'default'}
            >
              {liveOn ? 'Turn OFF payments' : 'Turn ON payments'}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">
            Finish Step 2 (your keys) first — then you can turn it on here.
          </p>
        )}
      </Step>

      {/* Step 5 — KYC / real money */}
      <Step n={5} title="Get real money in your bank (one-time KYC)">
        <p className="text-muted-foreground">
          The keys above start you in <span className="font-semibold text-foreground">test mode</span> —
          great for trying it out with pretend money. To receive{' '}
          <span className="font-semibold text-foreground">real money</span> in your bank, Razorpay must
          check who you are. This is called <span className="font-semibold text-foreground">KYC</span> and
          you do it once.
        </p>
        <p className="text-muted-foreground">In Razorpay, tap <span className="font-semibold text-foreground">Complete KYC</span> (or “Activate Account”) and keep these ready:</p>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>Your <span className="font-semibold text-foreground">PAN card</span> number.</li>
          <li>
            Your <span className="font-semibold text-foreground">bank account number</span> and{' '}
            <span className="font-semibold text-foreground">IFSC code</span> (money lands here).
          </li>
          <li>Your PG / business name and address.</li>
        </ul>
        <p className="text-muted-foreground">
          Razorpay usually approves within <span className="font-semibold text-foreground">1–2 days</span>.
          After that, open Razorpay → <span className="font-semibold text-foreground">Settings → API Keys</span>,
          switch from <span className="font-semibold text-foreground">Test</span> to{' '}
          <span className="font-semibold text-foreground">Live</span>, generate live keys, and paste
          those into Step 2 above (and add a Live webhook in Step 3). That's it — you're taking real
          payments.
        </p>
        <a href="https://dashboard.razorpay.com/" target="_blank" rel="noreferrer">
          <Button variant="outline" className="gap-1.5">
            Open Razorpay dashboard <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
      </Step>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        Stuck on a step? Send this page's step number to PGManage support and we'll help.
      </p>
    </div>
  );
}
