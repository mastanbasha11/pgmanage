import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Phone, Globe, MessageCircle, Wallet } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { NameAvatar, Pill } from '@/components/ui/redesign';
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
import { useProperties, useRoomTypes } from '@/hooks/useProperties';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/useToast';
import { formatDate, rupeesToPaise, normaliseIndianPhone, PHONE_HELP, whatsappLink } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WebsiteLeadsView from './WebsiteLeadsView';
import { useNewWebsiteLeadCount } from '@/hooks/useWebsiteLeads';
import LeadDetailDrawer from './LeadDetailDrawer';
import CheckinWizard from '@/pages/tenants/CheckinWizard';
import LeadWorklist, { type WorklistLead } from './LeadWorklist';

type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'SITE_VISITED'
  | 'NEGOTIATING'
  | 'BOOKED'
  | 'CONVERTED'
  | 'LOST';
type LeadSource = 'META_AD' | 'INSTAGRAM' | 'REFERRAL' | 'WALKIN' | 'JUSTDIAL' | 'WEBSITE' | 'OTHER';

interface Lead {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  interested_room_type?: string | null;
  budget_min_paise?: number;
  budget_max_paise?: number;
  advance_paise?: number | null;
  next_followup_at?: string;
  last_contacted_at?: string;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  created_at: string;
}

/** Follow-up state pill — Overdue (red) / Due today (amber) / date (slate). */
function FollowupPill({ iso }: { iso?: string }) {
  if (!iso) return null;
  const due = new Date(iso);
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueStart < dayStart) {
    const days = Math.round((dayStart.getTime() - dueStart.getTime()) / 86_400_000);
    return <Pill tone="r">Overdue {days}d</Pill>;
  }
  if (dueStart.getTime() === dayStart.getTime()) {
    return <Pill tone="a">Due today</Pill>;
  }
  return (
    <Pill tone="s" dot={false}>
      📅 {formatDate(iso)}
    </Pill>
  );
}

// Pipeline columns shown on the board. NEGOTIATING and BOOKED are intentionally
// omitted — this PG's flow goes New → Contacted → Site Visited → Converted/Lost.
// The two statuses still exist in the backend enum, so any legacy lead in them
// stays valid; it just isn't a board column or a move target.
const COLUMNS: { status: LeadStatus; label: string; tone: string }[] = [
  { status: 'NEW', label: 'New', tone: 'bg-sky-50 border-sky-200' },
  { status: 'CONTACTED', label: 'Contacted', tone: 'bg-amber-50 border-amber-200' },
  { status: 'SITE_VISITED', label: 'Site Visited', tone: 'bg-violet-50 border-violet-200' },
  { status: 'CONVERTED', label: 'Converted', tone: 'bg-emerald-50 border-emerald-200' },
  { status: 'LOST', label: 'Lost', tone: 'bg-rose-50 border-rose-200' },
];

const SOURCE_LABEL: Record<LeadSource, string> = {
  META_AD: 'Meta Ad',
  INSTAGRAM: 'Instagram',
  REFERRAL: 'Referral',
  WALKIN: 'Walk-in',
  JUSTDIAL: 'JustDial',
  WEBSITE: 'Website',
  OTHER: 'Other',
};

/** Presentational card body — shared between the draggable card and the
 *  DragOverlay clone. Kept separate so the overlay renders identically
 *  without inheriting drag listeners. */
function LeadCardBody({ lead }: { lead: Lead }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <b className="truncate text-[12.5px] font-bold leading-tight">{lead.name}</b>
        <Pill
          tone={lead.source === 'INSTAGRAM' || lead.source === 'META_AD' ? 'v' : 'b'}
          dot={false}
          className="shrink-0 px-1.5 text-[9.5px]"
        >
          {SOURCE_LABEL[lead.source]}
        </Pill>
        {lead.assigned_to_name && (
          <span className="ml-auto shrink-0" title={`Assigned to ${lead.assigned_to_name}`}>
            <NameAvatar name={lead.assigned_to_name} size={20} />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#98a0ad]">
        <Phone className="h-3 w-3" />
        {lead.phone}
      </div>
      {lead.interested_room_type && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          wants <b className="text-foreground">{lead.interested_room_type}</b>
        </div>
      )}
      {lead.status === 'BOOKED' && typeof lead.advance_paise === 'number' && lead.advance_paise > 0 && (
        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-accent">
          <Wallet className="h-3 w-3" />
          Advance ₹{(lead.advance_paise / 100).toLocaleString('en-IN')}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <FollowupPill iso={lead.next_followup_at} />
        <a
          href={whatsappLink(
            lead.phone,
            `Hi ${lead.name}, thanks for your interest in our PG! How can we help you with your stay?`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[#c8ecd5] text-[#128C7E] hover:bg-[#eafaf0]"
          title="WhatsApp"
        >
          <MessageCircle className="h-3 w-3" />
        </a>
      </div>
    </>
  );
}

/** Draggable Kanban card. The `useDraggable` listeners attach to the outer
 *  div; nested interactive controls (WhatsApp link) call
 *  `stopPropagation()` on their own pointer events so they still work. */
function DraggableLeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { status: lead.status },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // With PointerSensor's 6px activation constraint, a plain click never
      // starts a drag — normal onClick still fires. On mouse-up after a real
      // drag, `isDragging` was true, dnd-kit swallows the click, and onOpen
      // never fires. That's exactly what we want.
      onClick={onOpen}
      className={`rounded-lg border bg-card p-3 text-sm shadow-sm cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging ? 'opacity-40' : 'hover:shadow-md'
      }`}
    >
      <LeadCardBody lead={lead} />
    </div>
  );
}

/** Droppable column body. Renders the drop-target styling when a card is
 *  hovering, and the empty-state placeholder when the column has no cards. */
/** Cards rendered per column before collapsing into a "+N more" note —
 *  keeps a 300-card Lost column from bloating the DOM. */
const COLUMN_RENDER_CAP = 40;

function KanbanColumn({
  status,
  tone,
  leads,
  onOpenLead,
}: {
  status: LeadStatus;
  tone: string;
  leads: Lead[];
  onOpenLead: (leadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}`, data: { status } });
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? leads : leads.slice(0, COLUMN_RENDER_CAP);
  return (
    <div
      ref={setNodeRef}
      className={`min-h-32 space-y-2 rounded-lg border ${tone} p-2 transition-colors ${
        isOver ? 'ring-2 ring-accent/50 bg-accent/5' : ''
      }`}
    >
      {shown.map((lead) => (
        <DraggableLeadCard key={lead.id} lead={lead} onOpen={() => onOpenLead(lead.id)} />
      ))}
      {leads.length > COLUMN_RENDER_CAP && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-lg border border-dashed border-border py-1.5 text-center text-[11.5px] font-bold text-muted-foreground hover:bg-card"
        >
          Show all {leads.length} →
        </button>
      )}
      {leads.length === 0 && (
        <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
          {isOver ? 'Drop to move here' : 'None'}
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

/**
 * Room-type picker for the Add Lead dialog. Pulls the actual configured
 * room types for the selected property so reps pick a real option instead
 * of typing free text that later has to be reconciled by hand. An "Other…"
 * option keeps the escape hatch open for one-off leads whose interest
 * doesn't match any configured type — selecting it reveals a text input.
 *
 * Falls back to a plain text input entirely when the property has no
 * room_types configured yet (a common state during property onboarding),
 * so this component never blocks the flow.
 */
const OTHER_ROOM_TYPE = '__other__';

function RoomTypeField({
  propertyId,
  value,
  onChange,
}: {
  propertyId?: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  const { data, isLoading } = useRoomTypes(propertyId);
  const items = data?.items ?? [];
  const configuredNames = items.map((i) => i.name);
  // A value is "custom" when the rep chose Other… OR when we've hydrated
  // from an existing lead whose room type is no longer in the configured
  // list (e.g. the type was renamed / removed since).
  const isCustom = !!value && !configuredNames.includes(value);
  const selectValue = isCustom ? OTHER_ROOM_TYPE : value ?? '';

  // Property not chosen yet OR the property has no configured room types.
  // Degrade to a plain text input so the rep isn't blocked either way.
  if (!propertyId || (!isLoading && items.length === 0)) {
    return (
      <div>
        <Label>Interested room type</Label>
        <Input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Single AC / Double Sharing"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <Label>Interested room type</Label>
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (v === OTHER_ROOM_TYPE) {
              // Clear so the "Other" input starts empty; the rep types
              // the actual value in the text field below.
              onChange('');
            } else {
              onChange(v);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? 'Loading…' : 'Pick a room type'} />
          </SelectTrigger>
          <SelectContent>
            {items.map((rt) => (
              <SelectItem key={rt.id} value={rt.name}>
                {rt.name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_ROOM_TYPE}>Other…</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {selectValue === OTHER_ROOM_TYPE && (
        <Input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the room type"
          autoFocus
        />
      )}
    </div>
  );
}

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
          <RoomTypeField
            propertyId={watch('property_id')}
            value={watch('interested_room_type')}
            onChange={(v) => setValue('interested_room_type', v)}
          />
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
    queryFn: () => api.get('/leads', { params: { limit: 500 } }).then((r) => r.data),
  });
  const [showCreate, setShowCreate] = useState(false);
  const { selectedPropertyId, user } = useAuthStore();
  const newWebsiteCount = useNewWebsiteLeadCount();
  const canManage = user?.role === 'OWNER' || user?.role === 'PARTNER';

  // Open the Website Leads tab directly when arrived via the email deep-link.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'website' ? 'website' : 'pipeline');

  const leads = data?.items ?? [];

  // ── Drag-to-move (Board view) ───────────────────────────────────────────
  // Optimistic status update: patch the cache immediately so the card jumps
  // to the new column with no wait, then fire the PATCH. On error, invalidate
  // to snap the cache back to the server truth.
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      api.patch(`/leads/${id}`, { status }).then((r) => r.data),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['leads'] });
      const prev = qc.getQueryData<{ items: Lead[] }>(['leads']);
      if (prev) {
        qc.setQueryData<{ items: Lead[] }>(['leads'], {
          ...prev,
          items: prev.items.map((l) => (l.id === id ? { ...l, status } : l)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['leads'], ctx.prev);
      toast({
        title: "Couldn't move lead",
        description: 'Restoring previous column.',
        variant: 'destructive',
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDraggedLead = activeDragId ? leads.find((l) => l.id === activeDragId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const draggedId = String(e.active.id);
    const fromStatus = e.active.data.current?.status as LeadStatus | undefined;
    const toStatus = e.over?.data.current?.status as LeadStatus | undefined;
    if (!toStatus || !fromStatus || fromStatus === toStatus) return;
    updateStatus.mutate({ id: draggedId, status: toStatus });
  };

  // ── Drawer + check-in wizard state ──────────────────────────────────────
  const initialOpenLead = searchParams.get('openLead');
  const [openLeadId, setOpenLeadId] = useState<string | null>(initialOpenLead);
  const [checkinOpen, setCheckinOpen] = useState(false);

  // The Board view for a given already-filtered set. Passed to LeadWorklist as
  // `boardSlot` so the worklist owns the filters/views and the board just
  // renders. The rows ARE Lead objects at runtime — WorklistLead only widens
  // source/status to string — so the cast is safe.
  const renderBoard = (filteredWorklist: WorklistLead[]) => {
    const filtered = filteredWorklist as unknown as Lead[];
    const byStatus = (s: LeadStatus) => filtered.filter((l) => l.status === s);
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      );
    }
    return (
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map(({ status, label, tone }) => (
            <div key={status} className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5 text-[11.5px] font-extrabold text-muted-foreground">
                <span>{label}</span>
                <span>{byStatus(status).length}</span>
              </div>
              <KanbanColumn
                status={status}
                tone={tone}
                leads={byStatus(status)}
                onOpenLead={setOpenLeadId}
              />
            </div>
          ))}
        </div>
        <DragOverlay>
          {activeDraggedLead ? (
            <div className="w-64 rounded-lg border bg-card p-3 text-sm shadow-lg ring-2 ring-accent">
              <LeadCardBody lead={activeDraggedLead} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
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

        <TabsContent value="pipeline" className="mt-4">
          <LeadWorklist
            leads={leads}
            onOpenLead={setOpenLeadId}
            onAddLead={() => setShowCreate(true)}
            canManage={canManage}
            boardSlot={renderBoard}
          />
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

      <LeadDetailDrawer
        leadId={openLeadId}
        onClose={() => setOpenLeadId(null)}
        onOpenCheckin={() => {
          setOpenLeadId(null);
          setCheckinOpen(true);
        }}
      />

      <CheckinWizard open={checkinOpen} onClose={() => setCheckinOpen(false)} />
    </div>
  );
}
