/**
 * Settings → WhatsApp & Rent Reminders.
 *
 * Owner-only. Per property the owner configures:
 *   - phone_number_id  (Meta WhatsApp Manager → Phone Numbers)
 *   - display number   (+91… that tenants see)
 *   - System User access token (long-lived; stored on the property row)
 *   - UPI VPA          (lands in the {{5}} placeholder of `rent_reminder`)
 *
 * "Send test" fires one approved-template message so the owner can verify
 * everything end-to-end before the monthly cron actually pings tenants.
 */
import { useEffect, useState } from 'react';
import { Loader2, CircleCheck, CircleX, MessageSquare, ShieldAlert, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { useProperties } from '@/hooks/useProperties';
import {
  useWhatsAppSettings,
  useUpdateWhatsAppSettings,
  useTestSendWhatsApp,
} from '@/hooks/useWhatsApp';

type TestState = 'idle' | 'sending' | 'ok' | 'fail';

export default function WhatsAppPage() {
  const { data: propsResp, isLoading: propsLoading } = useProperties();
  const properties = propsResp?.items ?? [];
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!propertyId && properties.length > 0) setPropertyId(properties[0].id);
  }, [propertyId, properties]);

  const { data: settings, isLoading: settingsLoading } = useWhatsAppSettings(propertyId);
  const update = useUpdateWhatsAppSettings(propertyId);
  const test = useTestSendWhatsApp(propertyId);
  const { toast } = useToast();

  // Local form state — reset whenever the chosen property's settings refresh.
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [reminderTplName, setReminderTplName] = useState('');
  const [reminderTplLang, setReminderTplLang] = useState('');
  const [overdueTplName, setOverdueTplName] = useState('');
  const [overdueTplLang, setOverdueTplLang] = useState('');
  useEffect(() => {
    if (settings) {
      setPhoneNumberId(settings.whatsapp_phone_number_id ?? '');
      setWhatsappNumber(settings.whatsapp_number ?? '');
      setUpiVpa(settings.upi_vpa ?? '');
      setAccessToken(''); // never prefill — server only tells us whether one exists
      setReminderTplName(settings.wa_rent_reminder_template_name ?? '');
      setReminderTplLang(settings.wa_rent_reminder_template_language ?? '');
      setOverdueTplName(settings.wa_rent_overdue_template_name ?? '');
      setOverdueTplLang(settings.wa_rent_overdue_template_language ?? '');
    }
  }, [settings]);

  const [testPhone, setTestPhone] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');

  async function onSave() {
    try {
      const payload: Record<string, string | null> = {
        whatsapp_phone_number_id: phoneNumberId.trim() || null,
        whatsapp_number: whatsappNumber.trim() || null,
        upi_vpa: upiVpa.trim() || null,
        // Empty string → NULL so we fall back to the server default.
        wa_rent_reminder_template_name: reminderTplName.trim() || null,
        wa_rent_reminder_template_language: reminderTplLang.trim() || null,
        wa_rent_overdue_template_name: overdueTplName.trim() || null,
        wa_rent_overdue_template_language: overdueTplLang.trim() || null,
      };
      // Only send the token if the user typed one — otherwise leave whatever's saved alone.
      if (accessToken.trim()) payload.whatsapp_access_token = accessToken.trim();
      await update.mutateAsync(payload);
      setAccessToken('');
      toast({ title: 'Saved', description: 'WhatsApp settings updated for this property.' });
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
    }
  }

  async function onTestSend() {
    if (!testPhone.trim()) {
      toast({ title: 'Enter a phone number to send a test to', variant: 'destructive' });
      return;
    }
    setTestState('sending');
    setTestMsg('');
    try {
      const res = await test.mutateAsync({
        to_phone: testPhone.trim(),
        template_name: 'rent_reminder',
      });
      if (res.success) {
        setTestState('ok');
        setTestMsg(`Sent. Meta message id: ${res.message_id ?? '—'}`);
      } else {
        setTestState('fail');
        setTestMsg(res.error ?? 'Send failed for an unknown reason.');
      }
    } catch (err) {
      setTestState('fail');
      setTestMsg(String(err));
    }
  }

  const connected = !!settings?.whatsapp_phone_number_id && !!settings?.has_access_token;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp & Rent Reminders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect each property to its own WhatsApp number. PGManage sends rent reminders on
          the 1st of every month and overdue notices daily after that, using your Meta-approved
          templates.
        </p>
      </div>

      {/* Property picker */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Label className="text-sm shrink-0">Property</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder={propsLoading ? 'Loading…' : 'Choose a property'} />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {p.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs">
            {connected ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CircleCheck className="h-4 w-4" /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <ShieldAlert className="h-4 w-4" /> Not connected yet
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings form */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4 text-accent" /> Meta Cloud API credentials
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input
                id="phoneNumberId"
                placeholder="e.g. 111222333444555"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                disabled={settingsLoading}
              />
              <p className="text-xs text-muted-foreground">
                From WhatsApp Manager → Phone Numbers. Not the +91 number itself.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="whatsappNumber">Display number (with country code)</Label>
              <Input
                id="whatsappNumber"
                placeholder="+919876543210"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                disabled={settingsLoading}
              />
              <p className="text-xs text-muted-foreground">
                What tenants see as the sender. Used for click-to-chat links too.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="accessToken" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> System User access token
              </Label>
              <Input
                id="accessToken"
                type="password"
                placeholder={
                  settings?.has_access_token
                    ? '••••••••••••••••  (already saved — leave blank to keep)'
                    : 'EAAxxxxxxxxxxxxx…'
                }
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                disabled={settingsLoading}
              />
              <p className="text-xs text-muted-foreground">
                Long-lived token with <span className="font-mono">whatsapp_business_messaging</span>{' '}
                + <span className="font-mono">whatsapp_business_management</span> scopes. Generate
                from a Meta System User — never use a temporary user token.
              </p>
            </div>
          </div>

          <div className="border-t pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="upiVpa">UPI VPA (for rent reminders)</Label>
              <Input
                id="upiVpa"
                placeholder="loopliving@okhdfc"
                value={upiVpa}
                onChange={(e) => setUpiVpa(e.target.value)}
                disabled={settingsLoading}
              />
              <p className="text-xs text-muted-foreground">
                Goes into <span className="font-mono">{'{{5}}'}</span> of the{' '}
                <span className="font-mono">rent_reminder</span> template — tenants tap to pay.
              </p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-medium">
              Approved Meta templates (per property)
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Leave blank to use defaults <span className="font-mono">rent_reminder</span> /{' '}
              <span className="font-mono">rent_overdue</span> in language{' '}
              <span className="font-mono">en_US</span>. Override here if Meta approved your
              templates under different names or languages (e.g. plain <span className="font-mono">en</span>).
              Find the exact values in Meta → WhatsApp Manager → Message Templates.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="reminderTplName">Rent-reminder template name</Label>
                <Input
                  id="reminderTplName"
                  placeholder="rent_reminder"
                  value={reminderTplName}
                  onChange={(e) => setReminderTplName(e.target.value)}
                  disabled={settingsLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminderTplLang">Rent-reminder language code</Label>
                <Input
                  id="reminderTplLang"
                  placeholder="en_US"
                  value={reminderTplLang}
                  onChange={(e) => setReminderTplLang(e.target.value)}
                  disabled={settingsLoading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="overdueTplName">Rent-overdue template name</Label>
                <Input
                  id="overdueTplName"
                  placeholder="rent_overdue"
                  value={overdueTplName}
                  onChange={(e) => setOverdueTplName(e.target.value)}
                  disabled={settingsLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overdueTplLang">Rent-overdue language code</Label>
                <Input
                  id="overdueTplLang"
                  placeholder="en_US"
                  value={overdueTplLang}
                  onChange={(e) => setOverdueTplLang(e.target.value)}
                  disabled={settingsLoading}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={update.isPending || settingsLoading}>
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test send */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4 text-accent" /> Send test message
          </div>
          <p className="text-xs text-muted-foreground">
            Fires the <span className="font-mono">rent_reminder</span> template with sample
            content. The number must either be the recipient added to your Meta test list, or your
            account must be out of the test phase. Replies route into <em>Tenants → Activity</em>.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 grow max-w-xs">
              <Label htmlFor="testPhone">Recipient phone (with country code)</Label>
              <Input
                id="testPhone"
                placeholder="+919876543210"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
            </div>
            <Button
              onClick={onTestSend}
              disabled={!connected || testState === 'sending'}
              variant="secondary"
            >
              {testState === 'sending' && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Send test
            </Button>
          </div>

          {testState === 'ok' && (
            <div className="text-sm text-emerald-700 flex items-start gap-1.5 mt-1">
              <CircleCheck className="h-4 w-4 mt-0.5" /> {testMsg}
            </div>
          )}
          {testState === 'fail' && (
            <div className="text-sm text-rose-700 flex items-start gap-1.5 mt-1">
              <CircleX className="h-4 w-4 mt-0.5" /> {testMsg}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="font-medium">Before this works end-to-end you need on Meta:</div>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>A verified WhatsApp Business Account.</li>
            <li>A registered phone number with a display-name in WhatsApp Manager.</li>
            <li>
              A long-lived <span className="font-mono">System User access token</span> with{' '}
              <span className="font-mono">whatsapp_business_messaging</span> +{' '}
              <span className="font-mono">whatsapp_business_management</span> scopes.
            </li>
            <li>
              Webhook subscribed:{' '}
              <span className="font-mono">https://pgmanage.in/api/v1/webhooks/whatsapp</span>{' '}
              (verify token matches <span className="font-mono">WHATSAPP_VERIFY_TOKEN</span>),
              subscribed to <span className="font-mono">messages</span> and{' '}
              <span className="font-mono">message_status</span>.
            </li>
            <li>
              <strong>Approved templates</strong> (Utility category):{' '}
              <span className="font-mono">rent_reminder</span> (5 params: tenant name, amount,
              month, due date, UPI) and <span className="font-mono">rent_overdue</span> (4
              params).
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
