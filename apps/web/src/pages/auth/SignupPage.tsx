import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api, getApiError } from '@/lib/api';
import { cn, normaliseIndianPhone, PHONE_HELP } from '@/lib/utils';
import PendingApprovalPage from './PendingApprovalPage';

const STEPS = ['PG Details', 'Your Info', 'Security', 'Done'];

const schema = z.object({
  org_name: z.string().min(3, 'PG name required (min 3 chars)'),
  city: z.string().min(2, 'City required'),
  owner_name: z.string().min(2, 'Your name required'),
  owner_email: z.string().email('Valid email required'),
  owner_phone: z
    .string()
    .refine((v) => normaliseIndianPhone(v) !== null, PHONE_HELP),
  password: z.string().min(8, 'Min 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

type FormData = z.infer<typeof schema>;

export default function SignupPage() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ ownerName: string; ownerEmail: string } | null>(null);

  const { register, handleSubmit, trigger, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  if (pending) {
    return <PendingApprovalPage ownerName={pending.ownerName} ownerEmail={pending.ownerEmail} />;
  }

  async function nextStep() {
    const fieldsPerStep: Array<Array<keyof FormData>> = [
      ['org_name', 'city'],
      ['owner_name', 'owner_email', 'owner_phone'],
      ['password', 'confirm_password'],
    ];
    const valid = await trigger(fieldsPerStep[step]);
    if (valid) setStep((s) => s + 1);
  }

  async function onSubmit(data: FormData) {
    setError('');
    try {
      const phone = normaliseIndianPhone(data.owner_phone) ?? data.owner_phone;
      await api.post('/auth/signup', {
        org_name: data.org_name,
        city: data.city,
        owner_name: data.owner_name,
        owner_email: data.owner_email,
        owner_phone: phone,
        password: data.password,
      });
      setPending({ ownerName: data.owner_name, ownerEmail: data.owner_email });
    } catch (err) {
      setError(getApiError(err));
      setStep(0);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white text-xl font-bold">
            P
          </div>
          <CardTitle>Create your PGManage account</CardTitle>
          <CardDescription>30-day Growth trial, no credit card needed</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step indicator */}
          <div className="mb-6 flex items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    i < step
                      ? 'bg-green-500 text-white'
                      : i === step
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('h-px w-6', i < step ? 'bg-green-500' : 'bg-muted')} />
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Step 0: PG details */}
            {step === 0 && (
              <>
                <div>
                  <Label>PG / Hostel Name *</Label>
                  <Input {...register('org_name')} placeholder="Sri Balaji PG" />
                  {errors.org_name && (
                    <p className="mt-1 text-xs text-destructive">{errors.org_name.message}</p>
                  )}
                </div>
                <div>
                  <Label>City *</Label>
                  <Input {...register('city')} placeholder="Bangalore" />
                  {errors.city && (
                    <p className="mt-1 text-xs text-destructive">{errors.city.message}</p>
                  )}
                </div>
              </>
            )}

            {/* Step 1: Owner info */}
            {step === 1 && (
              <>
                <div>
                  <Label>Your Name *</Label>
                  <Input {...register('owner_name')} placeholder="Suresh Kumar" />
                  {errors.owner_name && (
                    <p className="mt-1 text-xs text-destructive">{errors.owner_name.message}</p>
                  )}
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input {...register('owner_email')} type="email" placeholder="suresh@mypg.com" />
                  {errors.owner_email && (
                    <p className="mt-1 text-xs text-destructive">{errors.owner_email.message}</p>
                  )}
                </div>
                <div>
                  <Label>Phone *</Label>
                  <Input {...register('owner_phone')} placeholder="9876543210" />
                  {errors.owner_phone && (
                    <p className="mt-1 text-xs text-destructive">{errors.owner_phone.message}</p>
                  )}
                </div>
              </>
            )}

            {/* Step 2: Password */}
            {step === 2 && (
              <>
                <div>
                  <Label>Password *</Label>
                  <Input {...register('password')} type="password" placeholder="Min 8 characters" />
                  {errors.password && (
                    <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>
                <div>
                  <Label>Confirm Password *</Label>
                  <Input {...register('confirm_password')} type="password" placeholder="Repeat password" />
                  {errors.confirm_password && (
                    <p className="mt-1 text-xs text-destructive">{errors.confirm_password.message}</p>
                  )}
                </div>
              </>
            )}

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                disabled={step === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>

              {step < 2 ? (
                <Button type="button" onClick={nextStep}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account...' : 'Create Account'}
                </Button>
              )}
            </div>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/auth/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
