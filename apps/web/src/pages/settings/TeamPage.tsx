import { useState } from 'react';
import { Plus, Mail, Phone, ShieldCheck, ShieldX, UserCog } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { normaliseIndianPhone, PHONE_HELP, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { Navigate } from 'react-router-dom';

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone: string;
  role: 'OWNER' | 'PARTNER' | 'PROPERTY_MANAGER' | 'SUPERVISOR' | 'MARKETING';
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

const ROLE_LABEL: Record<StaffMember['role'], string> = {
  OWNER: 'Admin',
  PARTNER: 'Partner',
  PROPERTY_MANAGER: 'Manager',
  SUPERVISOR: 'Supervisor',
  MARKETING: 'Marketing',
};

export default function TeamPage() {
  const { canManageStaff, user } = useAuthStore();
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  if (!canManageStaff()) return <Navigate to="/properties" replace />;

  const { data, isLoading } = useQuery<{ items: StaffMember[]; total: number }>({
    queryKey: ['staff'],
    queryFn: () => api.get('/auth/staff').then((r) => r.data),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.patch(`/auth/staff/${id}/deactivate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Manage who can sign in to PGManage and what they can do.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Add Manager
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <UserCog className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">Just you for now</p>
          <p className="text-sm text-muted-foreground">Add a manager to delegate day-to-day ops.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((s) => (
            <Card key={s.id} className={s.is_active ? '' : 'opacity-60'}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{s.name}</p>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {ROLE_LABEL[s.role] ?? s.role}
                    </Badge>
                  </div>
                  {s.is_active ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ShieldX className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {s.email && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{s.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0" />
                    {s.phone}
                  </div>
                  {s.last_login_at && (
                    <p className="text-[11px] mt-1">
                      Last login: {formatDate(s.last_login_at)}
                    </p>
                  )}
                </div>

                {s.is_active && s.role !== 'OWNER' && s.id !== user?.user_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full text-destructive hover:text-destructive"
                    onClick={async () => {
                      if (!window.confirm(`Deactivate ${s.name}?`)) return;
                      try {
                        await deactivate.mutateAsync(s.id);
                        toast({ title: `${s.name} deactivated` });
                      } catch {
                        toast({ title: 'Failed', variant: 'destructive' });
                      }
                    }}
                  >
                    Deactivate
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddManagerDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}

const addManagerSchema = z.object({
  name: z.string().min(2, 'Name required'),
  email: z.string().email('Valid email required'),
  phone: z.string().refine((v) => normaliseIndianPhone(v) !== null, PHONE_HELP),
  password: z.string().min(8, 'Min 8 characters'),
  role: z.enum(['PROPERTY_MANAGER', 'SUPERVISOR', 'PARTNER', 'MARKETING']),
});
type AddManagerForm = z.infer<typeof addManagerSchema>;

function AddManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddManagerForm>({
    resolver: zodResolver(addManagerSchema),
    defaultValues: { role: 'PROPERTY_MANAGER' },
  });

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/auth/staff', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });

  async function onSubmit(data: AddManagerForm) {
    try {
      const phone = normaliseIndianPhone(data.phone) ?? data.phone;
      await create.mutateAsync({
        name: data.name,
        email: data.email,
        phone,
        password: data.password,
        role: data.role,
      });
      toast({
        title: 'Manager added',
        description: `${data.name} can sign in with ${data.email}.`,
      });
      reset();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not add manager.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add manager</DialogTitle>
          <DialogDescription>
            They'll sign in with this email + password. Share the credentials with them privately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input {...register('name')} placeholder="Suresh Kumar" />
            {errors.name && (
              <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
            )}
          </div>
          <div>
            <Label>Email *</Label>
            <Input {...register('email')} type="email" placeholder="manager@mypg.com" />
            {errors.email && (
              <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
            )}
          </div>
          <div>
            <Label>Phone *</Label>
            <Input {...register('phone')} placeholder="9876543210" />
            {errors.phone && (
              <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>
            )}
          </div>
          <div>
            <Label>Initial Password *</Label>
            <Input {...register('password')} type="text" placeholder="Min 8 characters" />
            {errors.password && (
              <p className="text-xs text-destructive mt-1">{errors.password.message}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Share this with them once — they can change it later.
            </p>
          </div>
          <div>
            <Label>Role *</Label>
            <Select
              value={watch('role')}
              onValueChange={(v) => setValue('role', v as AddManagerForm['role'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PROPERTY_MANAGER">
                  Manager — full property ops, no money totals
                </SelectItem>
                <SelectItem value="SUPERVISOR">
                  Supervisor — bill uploads + check-in/out only
                </SelectItem>
                <SelectItem value="MARKETING">
                  Marketing — leads + tenant onboarding, no financials
                </SelectItem>
                <SelectItem value="PARTNER">Partner — same access as you (admin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add manager'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
