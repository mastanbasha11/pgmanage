import { useEffect, useState } from 'react';
import { Copy, Check, Globe, Plug, Loader2, CircleCheck, CircleX, ShieldAlert, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { useWebsiteIntegration, useUpdateWebsiteIntegration } from '@/hooks/useWebsiteLeads';

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  }
  return (
    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={copy}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

export default function WebsiteIntegrationPage() {
  const { data, isLoading } = useWebsiteIntegration();
  const { toast } = useToast();
  const updateIntegration = useUpdateWebsiteIntegration();
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  useEffect(() => {
    if (data?.notify_email) setNotifyEmail(data.notify_email);
  }, [data?.notify_email]);

  async function saveNotifyEmail() {
    try {
      await updateIntegration.mutateAsync({ notify_email: notifyEmail.trim() });
      toast({ title: 'Saved', description: 'New website leads will be emailed here.' });
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
    }
  }

  async function testConnection() {
    if (!data?.token) return;
    setTestState('testing');
    setTestMsg('');
    try {
      // Same-origin POST to the public endpoint with a clearly-labelled dummy lead.
      const res = await fetch(`/api/v1/leads/website?token=${data.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Connection',
          email: 'test@pgmanage.in',
          phone: '+910000000000',
          message: 'Test lead fired from the pgmanage dashboard.',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        setTestState('ok');
        setTestMsg(`Lead received (id ${String(body.leadId).slice(0, 8)}…). Check Leads → Website Leads.`);
      } else if (res.status === 429) {
        setTestState('fail');
        setTestMsg('Rate limit hit (10/hour). Wait a bit and retry.');
      } else {
        setTestState('fail');
        setTestMsg(body?.error?.message ?? `Failed (HTTP ${res.status}).`);
      }
    } catch (e) {
      setTestState('fail');
      setTestMsg('Network error — could not reach the endpoint.');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Globe className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Website Integration</h1>
          <p className="text-sm text-muted-foreground">
            Send booking-form submissions from your website straight into Leads.
          </p>
        </div>
      </div>

      {/* Webhook URL */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-medium">Your booking webhook URL</p>
            <p className="text-xs text-muted-foreground">
              Your website's form POSTs here. The token routes leads to your account.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
              {data?.webhook_url ?? '—'}
            </code>
            {data?.webhook_url && <CopyButton value={data.webhook_url} label="Copy URL" />}
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This token is a <strong>public site key</strong> — it's visible in your website's code.
              It can't do anything except submit leads (rate-limited to {data?.rate_limit_per_hour ?? 10}/hour).
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Email notifications */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-accent" />
            <div>
              <p className="font-medium">Email new leads to</p>
              <p className="text-xs text-muted-foreground">
                We'll send a copy of every website booking enquiry to this address.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="owner@example.com"
              className="sm:flex-1"
            />
            <Button
              onClick={saveNotifyEmail}
              disabled={updateIntegration.isPending || !notifyEmail.trim()}
              className="shrink-0 gap-2"
            >
              {updateIntegration.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Embed snippet */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">Paste this into your website</p>
              <p className="text-xs text-muted-foreground">
                Wire your form's submit handler to this function.
              </p>
            </div>
            {data?.snippet && <CopyButton value={data.snippet} label="Copy code" />}
          </div>
          <pre className="overflow-x-auto rounded-md border bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
            <code>{data?.snippet}</code>
          </pre>
        </CardContent>
      </Card>

      {/* Test connection */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Test the connection</p>
            <p className="text-xs text-muted-foreground">
              Fires a dummy "Test Connection" lead and confirms it arrived.
            </p>
            {testState === 'ok' && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CircleCheck className="h-4 w-4" /> Connected — {testMsg}
              </p>
            )}
            {testState === 'fail' && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <CircleX className="h-4 w-4" /> {testMsg}
              </p>
            )}
          </div>
          <Button onClick={testConnection} disabled={testState === 'testing'} className="gap-2 shrink-0">
            {testState === 'testing' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            {testState === 'testing' ? 'Testing…' : 'Test Connection'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
