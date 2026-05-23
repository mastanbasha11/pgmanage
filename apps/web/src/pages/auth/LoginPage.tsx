import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api, getApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import PendingApprovalPage from './PendingApprovalPage';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  if (pendingApproval) return <PendingApprovalPage />;

  async function onSubmit(data: FormData) {
    setError('');
    try {
      const res = await api.post<{ access_token: string; refresh_token: string; user: Parameters<typeof setAuth>[0] }>(
        '/auth/login',
        data,
      );
      setAuth(res.data.user, res.data.access_token, res.data.refresh_token);
      navigate('/');
    } catch (err) {
      // FastAPI HTTPException(detail=...) ends up under err.response.data.detail.error
      let code: string | undefined;
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as
          | { detail?: { error?: { code?: string } }; error?: { code?: string } }
          | undefined;
        code = data?.detail?.error?.code ?? data?.error?.code;
      }
      if (code === 'PENDING_APPROVAL') {
        setPendingApproval(true);
        return;
      }
      setError(getApiError(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white text-xl font-bold">
            P
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to PGManage</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                {...register('email')}
                type="email"
                placeholder="owner@mypg.com"
                autoComplete="email"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <Label>Password</Label>
                <Link
                  to="/auth/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            New to PGManage?{' '}
            <Link to="/auth/signup" className="text-primary hover:underline font-medium">
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
