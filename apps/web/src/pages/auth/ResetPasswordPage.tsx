import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { api, getApiError } from '@/lib/api';

const schema = z
  .object({
    new_password: z.string().min(8, 'At least 8 characters'),
    confirm_password: z.string().min(1, 'Confirm your password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });
type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setError('');
    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: data.new_password,
      });
      setDone(true);
      setTimeout(() => navigate('/auth/login'), 1800);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>
              This reset link is missing its token. Request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/auth/forgot-password"
              className="block text-center text-sm text-primary hover:underline font-medium"
            >
              Request new reset link
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white text-xl font-bold">
            P
          </div>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose something memorable but secure.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 border border-emerald-200">
              Password updated. Redirecting to sign in…
            </p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label>New password</Label>
                <Input
                  {...register('new_password')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                {errors.new_password && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.new_password.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Confirm new password</Label>
                <Input
                  {...register('confirm_password')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                {errors.confirm_password && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.confirm_password.message}
                  </p>
                )}
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Set new password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
