import { useState } from 'react';
import { Plus, Phone, Calendar, Globe, MessageCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProperties } from '@/hooks/useProperties';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/useToast';
import { formatDate, rupeesToPaise, normaliseIndianPhone, PHONE_HELP, whatsappLink } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WebsiteLeadsView from './WebsiteLeadsView';
import { useNewWebsiteLeadCount } from '@/hooks/useWebsiteLeads';

type LeadStatus = 'NEW' | 'CONTACTED' | 'SITE_VISITED' | 'NEGOTIATING' | 'CONVERTED' | 'LOST';
type LeadSource = 'META_AD' | 'INSTAGRAM' | 'REFERRAL' | 'WALKIN' | 'JUSTDIAL' | 'OTHER';

interface Lead {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  budget_min_paise?: number;
  budget_max_paise?: number;
  next_followup_at?: string;
  created_at: string;
}

const COLUMNS: { status: LeadStatus; label: string; tone: string }[] = [
  { status: 'NEW', label: 'New', tone: 'bg-sky-50 border-sky-200' },
  { status: 'CONTACTED', label: 'Contacted', tone: 'bg-amber-50 border-amber-200' },
  { status: 'SITE_VISITED', label: 'Site Visited', tone: 'bg-violet-50 border-violet-200' },
  { status: 'NEGOTIATING', label: 'Negotiating', tone: 'bg-orange-50 border-orange-200' },
  { status: 'CONVERTED', label: 'Converted', tone: 'bg-emerald-50 border-emerald-200' },
  { status: 'LOST', label: 'Lost', tone: 'bg-rose-50 border-rose-200' },
];

const SOURCE_LABEL: Record<LeadSource, string> = {
  META_AD: 'Meta Ad',
  INSTAGRAM: 'Instagram',
  REFERRAL: 'Referral',
  WALKIN: 'Walk-in',
  JUSTDIAL: 'JustDial',
  OTHER: 'Other',
};

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-tight">{lead.name}</p>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {SOURCE_LABEL[lead.source]}
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-1 text-muted-foreground text-xs">
        <Phone className="h-3 w-3" />
        {lead.phone}
      </div>
      <a
        href={whatsappLink(
          lead.phone,
          `Hi ${lead.name}, thanks for your interest in our PG! How can we help you with your stay?`,
        )}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#25D366]/10 px-2 py-1 text-xs font-medium text-[#128C7E] hover:bg-[#25D366]/20"
      >
        <MessageCircle className="h-3 w-3" /> WhatsApp
      </a>
      {lead.next_followup_at && (
        <div className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
          <Calendar className="h-3 w-3" />
          Follow up: {formatDate(lead.next_followup_at)}
        </div>
      )}
    </div>
  );
}

const leadSchema = z.object({
  property_id: z.string().uuid('Pick a property'),
  name: z.string().min(2, 'Name required'),
  phone: z.string().refine((v) => normaliseIndianPhone(v) !== null, PHONE_HELP),
  source: z.enum(['META_AD', 'INSTAGRAM', 'REFERRAL', 'WALKIN', 'JUSTDIAL', 'OTHER']),
  interested_room_type: z.string().optional(),
  budget_min_rupees: z.coerce.number().min(0).optional(),
  budget_max_rupees: z.coerce.number().min(0).optional(),
  expected_move_in_date: z.string().optional(),
  notes: z.string().optional(),
});

type LeadFormData = z.infer<typeof leadSchema>;

function CreateLeadDialog({
  open,
  onClose,
  defaultPropertyId,
}: {
  open: boolean;
  onClose: () => void;
  defaultPropertyId?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: propertiesData } = useProperties();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      source: 'WALKIN',
      property_id: defaultPropertyId,
    },
  });

  const mutate = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/leads', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  async function onSubmit(data: LeadFormData) {
    try {
      const phone = normaliseIndianPhone(data.phone) ?? data.phone;
      await mutate.mutateAsync({
        property_id: data.property_id,
        name: data.name,
        phone,
        source: data.source,
        interested_room_type: data.interested_room_type || undefined,
        budget_min_paise: data.budget_min_rupees
          ? rupeesToPaise(data.budget_min_rupees)
          : undefined,
        budget_max_paise: data.budget_max_rupees
          ? rupeesToPaise(data.budget_max_rupees)
          : undefined,
        expected_move_in_date: data.expected_move_in_date || undefined,
        notes: data.notes || undefined,
      });
      toast({ title: 'Lead added', description: `${data.name} created.` });
      reset();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not create lead.';
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
          <DialogTitle>Add a lead</DialogTitle>
          <DialogDescription>
            Capture a prospective tenant. Track follow-ups and convert to a tenant later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Property *</Label>
            <Select
              value={watch('property_id') ?? ''}
              onValueChange={(v) => setValue('property_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick property" />
              </SelectTrigger>
              <SelectContent>
                {propertiesData?.items.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.property_id && (
              <p className="text-xs text-destructive mt-1">{errors.property_id.message}</p>
            )}
          </div>
          <div>
            <Label>Name *</Label>
            <Input {...register('name')} placeholder="Rahul Sharma" />
            {errors.name && (
              <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
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
            <Label>Source *</Label>
            <Select
              value={watch('source')}
              onValueChange={(v) => setValue('source', v as LeadFormData['source'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Budget min (₹)</Label>
              <Input {...register('budget_min_rupees')} type="number" placeholder="6000" />
            </div>
            <div>
              <Label>Budget max (₹)</Label>
              <Input {...register('budget_max_rupees')} type="number" placeholder="9000" />
            </div>
          </div>
          <div>
            <Label>Interested room type</Label>
            <Input
              {...register('interested_room_type')}
              placeholder="Single AC / Double Sharing"
            />
          </div>
          <div>
            <Label>Expected move-in</Label>
            <Input {...register('expected_move_in_date')} type="date" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input {...register('notes')} placeholder="Any preferences or context" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Add Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadsPage() {
  const { data, isLoading } = useQuery<{ items: Lead[] }>({
    queryKey: ['leads'],
    queryFn: () => api.get('/leads').then((r) => r.data),
  });
  const [showCreate, setShowCreate] = useState(false);
  const { selectedPropertyId } = useAuthStore();
  const newWebsiteCount = useNewWebsiteLeadCount();

  const leads = data?.items ?? [];
  const byStatus = (s: LeadStatus) => leads.filter((l) => l.status === s);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'} in the pipeline
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Add Lead
        </Button>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="website" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Website Leads
            {newWebsiteCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                {newWebsiteCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4 space-y-6">
      {/* Pipeline stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {COLUMNS.map(({ status, label }) => (
          <Card key={status}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">
                {byStatus(status).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="font-medium">No leads yet</p>
          <p className="text-sm text-muted-foreground">
            Add a walk-in, referral, or import from an ad.
          </p>
          <Button className="mt-4 gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add your first lead
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map(({ status, label, tone }) => (
            <div key={status} className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>{label}</span>
                <span className="text-muted-foreground">{byStatus(status).length}</span>
              </div>
              <div className={`min-h-32 space-y-2 rounded-lg border ${tone} p-2`}>
                {byStatus(status).map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
                {byStatus(status).length === 0 && (
                  <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
                    None
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </TabsContent>

        <TabsContent value="website" className="mt-4">
          <WebsiteLeadsView />
        </TabsContent>
      </Tabs>

      <CreateLeadDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        defaultPropertyId={selectedPropertyId ?? undefined}
      />
    </div>
  );
}
