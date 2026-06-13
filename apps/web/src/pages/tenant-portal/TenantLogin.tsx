import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type Step = 'phone' | 'otp';

export default function TenantLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // When the backend is in inline-OTP mode (pre-SMS) the code rides in
  // the response — show it above the field and pre-fill so the user can
  // just hit Verify. Once SMS/WhatsApp is wired the backend stops
  // returning `code` and this banner disappears automatically.
  const [inlineCode, setInlineCode] = useState<string | null>(null);

  async function requestOtp() {
    setError('');
    setInlineCode(null);
    setLoading(true);
    try {
      const res = await api.post<{
        delivery: 'inline' | 'email' | 'none';
        code?: string;
      }>('/tenant/auth/otp', { phone });
      if (res.data.code) {
        setInlineCode(res.data.code);
        setOtp(res.data.code);
      }
      setStep('otp');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError('');
    setLoading(true);
    try {
      // Backend was renamed to `code` in the phone-first refactor (see
      // tenant_portal.py). Multi-org tenants get a different shape — the
      // web portal is a thin fallback so we just send them to the app.
      const res = await api.post<
        | { access_token: string }
        | { needs_org_pick: true; ticket: string; orgs: { id: string; name: string }[] }
      >('/tenant/auth/verify', { phone, code: otp });
      if ('needs_org_pick' in res.data) {
        setError(
          'You belong to multiple PGs. Please use the PGManage Resident app to sign in.',
        );
        return;
      }
      localStorage.setItem('tenant_access_token', res.data.access_token);
      navigate('/portal/home');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white text-xl font-bold">
            P
          </div>
          <CardTitle>Tenant Portal</CardTitle>
          <CardDescription>View your rent & raise complaints</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'phone' ? (
            <>
              <div>
                <Label>Your Phone Number</Label>
                <Input
                  type="tel"
                  placeholder="+919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              {error && (
                <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button className="w-full" onClick={requestOtp} disabled={loading || !phone}>
                {loading ? 'Sending OTP...' : 'Send OTP'}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground text-center">
                OTP sent to <strong>{phone}</strong>
              </p>
              {inlineCode && (
                <div className="rounded-lg border border-teal-300 bg-teal-50 p-4 text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    Test mode — SMS/WhatsApp coming soon
                  </div>
                  <div className="text-3xl font-extrabold tracking-[0.4em] text-teal-700">
                    {inlineCode}
                  </div>
                </div>
              )}
              <div>
                <Label>Enter OTP</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="text-center text-lg tracking-widest"
                />
              </div>
              {error && (
                <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button className="w-full" onClick={verifyOtp} disabled={loading || otp.length < 4}>
                {loading ? 'Verifying...' : 'Verify OTP'}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
              >
                Change number
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
