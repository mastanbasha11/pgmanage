/**
 * Lead Detail Drawer — right-side sheet that opens when the rep clicks any
 * Kanban card. Consolidates every action a rep needs on one lead into a
 * single surface: view / edit notes + follow-up / log an activity / mark
 * as booked with an advance / open the check-in wizard.
 *
 * Data flow:
 *   GET /leads/:id   → useLeadDetail  (returns lead + activities[])
 *   PATCH /leads/:id → useSaveLead    (notes / follow-up / status / advance)
 *   POST /leads/:id/activities → useLogActivity
 *   POST /leads/:id/convert   → useConvertLead  (called after check-in
 *                                                completes; also usable via
 *                                                the "Mark as Converted"
 *                                                button on a BOOKED lead)
 *
 * The drawer is a controlled component: the parent owns `leadId` (which
 * lead to show) and `open` (whether the drawer is visible). Passing
 * `leadId={null}` closes it.
 */
import { useState } from 'react';
import {
  Phone,
  MessageCircle,
  Wallet,
  Calendar,
  MapPin,
  IndianRupee,
  Home,
  Megaphone,
  PhoneCall,
  StickyNote,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { formatDate, whatsappLink } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'SITE_VISITED'
  | 'NEGOTIATING'
  | 'BOOKED'
  | 'CONVERTED'
  | 'LOST';

type ActivityType = 'NOTE' | 'CALL' | 'VISIT' | 'WA_MESSAGE';

interface LeadDetail {
  id: string;
  name: string;
  phone: string;
  email?: string;
  whatsapp_number?: string;
  source: string;
  source_campaign_name?: string;
  source_ad_id?: string;
  source_adset_name?: string;
  status: LeadStatus;
  budget_min_paise?: number;
  budget_max_paise?: number;
  interested_room_type?: string;
  interested_bed_count?: number;
  expected_move_in_date?: string;
  notes?: string;
  next_followup_at?: string;
  last_contacted_at?: string;
  advance_paise?: number | null;
  advance_paid_at?: string | null;
  assigned_to_name?: string;
  created_at: string;
  activities: {
    id: string;
    activity_type: ActivityType;
    notes?: string;
    scheduled_at?: string;
    created_at: string;
    done_by_name?: string;
  }[];
}

const STATUS_TONE: Record<LeadStatus, string> = {
  NEW: 'bg-sky-100 text-sky-800 border-sky-200',
  CONTACTED: 'bg-amber-100 text-amber-800 border-amber-200',
  SITE_VISITED: 'bg-violet-100 text-violet-800 border-violet-200',
  NEGOTIATING: 'bg-orange-100 text-orange-800 border-orange-200',
  BOOKED: 'bg-teal-100 text-teal-800 border-teal-200',
  CONVERTED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  LOST: 'bg-rose-100 text-rose-800 border-rose-200',
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  SITE_VISITED: 'Site Visited',
  NEGOTIATING: 'Negotiating',
  BOOKED: 'Booked',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};

const ACTIVITY_ICON: Record<ActivityType, typeof PhoneCall> = {
  NOTE: StickyNote,
  CALL: PhoneCall,
  VISIT: MapPin,
  WA_MESSAGE: MessageCircle,
};

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  NOTE: 'Note',
  CALL: 'Call',
  VISIT: 'Site visit',
  WA_MESSAGE: 'WhatsApp',
};

function formatRupees(paise?: number | null): string {
  if (paise == null) return '—';
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function formatBudget(min?: number, max?: number): string {
  if (!min && !max) return '—';
  if (min && max) return `${formatRupees(min)} – ${formatRupees(max)}`;
  return formatRupees(min ?? max);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeadDetailDrawer({
  leadId,
  onClose,
  onOpenCheckin,
}: {
  leadId: string | null;
  onClose: () => void;
  /** Bubble up so the parent can open the CheckinWizard with the lead's
   *  phone/name pre-visible in the drawer (rep can copy over). */
  onOpenCheckin?: (lead: LeadDetail) => void;
}) {
  const open = leadId != null;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: lead, isLoading } = useQuery<LeadDetail>({
    queryKey: ['lead', leadId],
    queryFn: () => api.get(`/leads/${leadId}`).then((r) => r.data),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead', leadId] });
    qc.invalidateQueries({ queryKey: ['leads'] });
  };

  const savePatch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/leads/${leadId}`, body).then((r) => r.data),
    onSuccess: invalidate,
    onError: (e) =>
      toast({ title: 'Save failed', description: getApiError(e), variant: 'destructive' }),
  });

  const logActivity = useMutation({
    mutationFn: (body: { activity_type: ActivityType; notes?: string }) =>
      api.post(`/leads/${leadId}/activities`, body).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Activity logged' });
    },
    onError: (e) =>
      toast({ title: 'Failed', description: getApiError(e), variant: 'destructive' }),
  });

  // ─── Local edit state — kept out of the query so the input feels snappy.
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [followupDraft, setFollowupDraft] = useState<string | null>(null);
  const [showBookForm, setShowBookForm] = useState(false);
  const [advanceRupees, setAdvanceRupees] = useState('');
  const [bookNote, setBookNote] = useState('');
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>('NOTE');
  const [activityNotes, setActivityNotes] = useState('');
  const [showLostForm, setShowLostForm] = useState(false);
  const [lostReason, setLostReason] = useState('');

  function handleClose() {
    // Reset drafts + sub-panels so the drawer opens clean next time.
    setNotesDraft(null);
    setFollowupDraft(null);
    setShowBookForm(false);
    setAdvanceRupees('');
    setBookNote('');
    setShowActivityForm(false);
    setActivityNotes('');
    setShowLostForm(false);
    setLostReason('');
    onClose();
  }

  async function saveNotes() {
    if (notesDraft == null || !lead) return;
    await savePatch.mutateAsync({ notes: notesDraft });
    setNotesDraft(null);
    toast({ title: 'Notes saved' });
  }

  async function saveFollowup() {
    if (followupDraft == null) return;
    await savePatch.mutateAsync({
      next_followup_at: followupDraft ? new Date(followupDraft).toISOString() : null,
    });
    setFollowupDraft(null);
    toast({ title: 'Follow-up updated' });
  }

  async function submitBook() {
    const paise = Math.round(Number(advanceRupees) * 100);
    if (!Number.isFinite(paise) || paise < 0) {
      toast({ title: 'Enter a valid advance amount', variant: 'destructive' });
      return;
    }
    await savePatch.mutateAsync({
      status: 'BOOKED',
      advance_paise: paise,
      advance_paid_at: new Date().toISOString(),
    });
    // Also log an activity note so the timeline reflects the booking.
    if (bookNote.trim() || paise > 0) {
      await logActivity.mutateAsync({
        activity_type: 'NOTE',
        notes: `Booked with ₹${(paise / 100).toLocaleString('en-IN')} advance${
          bookNote.trim() ? `. ${bookNote.trim()}` : ''
        }`,
      });
    }
    setShowBookForm(false);
    setAdvanceRupees('');
    setBookNote('');
    toast({ title: 'Marked as Booked' });
  }

  async function submitActivity() {
    const notes = activityNotes.trim();
    if (!notes) {
      toast({ title: 'Add a short note', variant: 'destructive' });
      return;
    }
    await logActivity.mutateAsync({ activity_type: activityType, notes });
    setShowActivityForm(false);
    setActivityNotes('');
    setActivityType('NOTE');
  }

  async function markLost() {
    const reason = lostReason.trim();
    if (!reason) {
      toast({ title: 'Add a short reason', variant: 'destructive' });
      return;
    }
    await savePatch.mutateAsync({ status: 'LOST', lost_reason: reason });
    setShowLostForm(false);
    setLostReason('');
    toast({ title: 'Marked as Lost' });
  }

  async function markConverted() {
    await savePatch.mutateAsync({ status: 'CONVERTED' });
    toast({ title: 'Marked as Converted' });
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent className="flex flex-col overflow-hidden p-0">
        {isLoading || !lead ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-24 w-3/4 animate-pulse rounded-md bg-muted" />
          </div>
        ) : (
          <>
            {/* ── Header ────────────────────────────────────────────────── */}
            <SheetHeader className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`border ${STATUS_TONE[lead.status]}`}>
                  {STATUS_LABEL[lead.status]}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {lead.source.replace('_', ' ')}
                </Badge>
              </div>
              <SheetTitle>{lead.name}</SheetTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {lead.phone}
                </a>
                <a
                  href={whatsappLink(lead.phone, `Hi ${lead.name},`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-[#25D366]/10 px-2 py-0.5 text-xs font-medium text-[#128C7E] hover:bg-[#25D366]/20"
                >
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </a>
              </div>
            </SheetHeader>

            {/* ── Scrollable body ────────────────────────────────────────── */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Details grid */}
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Details
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <DetailItem
                    icon={IndianRupee}
                    label="Budget"
                    value={formatBudget(lead.budget_min_paise, lead.budget_max_paise)}
                  />
                  <DetailItem
                    icon={Home}
                    label="Room type"
                    value={
                      lead.interested_room_type ??
                      (lead.interested_bed_count ? `${lead.interested_bed_count} bed` : '—')
                    }
                  />
                  <DetailItem
                    icon={Calendar}
                    label="Move-in"
                    value={
                      lead.expected_move_in_date
                        ? formatDate(lead.expected_move_in_date)
                        : '—'
                    }
                  />
                  <DetailItem
                    icon={UserCheck}
                    label="Assigned to"
                    value={lead.assigned_to_name ?? '—'}
                  />
                  {lead.source_campaign_name && (
                    <DetailItem
                      icon={Megaphone}
                      label="Campaign"
                      value={lead.source_campaign_name}
                      wide
                    />
                  )}
                </dl>
              </section>

              {/* Advance card (only when BOOKED / CONVERTED) */}
              {(lead.status === 'BOOKED' || lead.status === 'CONVERTED') &&
                typeof lead.advance_paise === 'number' &&
                lead.advance_paise > 0 && (
                  <section className="rounded-md border border-teal-200 bg-teal-50/70 p-3">
                    <div className="flex items-center gap-2 text-teal-900">
                      <Wallet className="h-4 w-4" />
                      <p className="text-sm font-medium">
                        Advance received: {formatRupees(lead.advance_paise)}
                      </p>
                    </div>
                    {lead.advance_paid_at && (
                      <p className="mt-1 text-xs text-teal-800">
                        on {formatDate(lead.advance_paid_at)}
                      </p>
                    )}
                  </section>
                )}

              {/* Notes — inline edit */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  {notesDraft != null && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setNotesDraft(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveNotes} disabled={savePatch.isPending}>
                        Save
                      </Button>
                    </div>
                  )}
                </div>
                {notesDraft != null ? (
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={3}
                    className="text-sm"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setNotesDraft(lead.notes ?? '')}
                    className="w-full min-h-[3rem] rounded-md border border-dashed p-2 text-left text-sm text-muted-foreground hover:border-solid hover:bg-muted/30"
                  >
                    {lead.notes || 'Click to add notes…'}
                  </button>
                )}
              </section>

              {/* Follow-up — inline edit */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Next follow-up
                  </p>
                  {followupDraft != null && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setFollowupDraft(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveFollowup} disabled={savePatch.isPending}>
                        Save
                      </Button>
                    </div>
                  )}
                </div>
                {followupDraft != null ? (
                  <Input
                    type="datetime-local"
                    value={followupDraft}
                    onChange={(e) => setFollowupDraft(e.target.value)}
                    className="text-sm"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setFollowupDraft(
                        lead.next_followup_at
                          ? new Date(lead.next_followup_at).toISOString().slice(0, 16)
                          : new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16),
                      )
                    }
                    className="w-full rounded-md border border-dashed p-2 text-left text-sm text-muted-foreground hover:border-solid hover:bg-muted/30"
                  >
                    {lead.next_followup_at
                      ? `${formatDate(lead.next_followup_at)} · click to change`
                      : 'Click to schedule…'}
                  </button>
                )}
              </section>

              {/* Activity timeline */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Activity ({lead.activities.length})
                  </p>
                  {!showActivityForm && (
                    <Button size="sm" variant="outline" onClick={() => setShowActivityForm(true)}>
                      + Log activity
                    </Button>
                  )}
                </div>
                {showActivityForm && (
                  <div className="mb-3 space-y-2 rounded-md border bg-muted/30 p-3">
                    <div className="grid grid-cols-[130px_1fr] gap-2">
                      <Select
                        value={activityType}
                        onValueChange={(v) => setActivityType(v as ActivityType)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NOTE">Note</SelectItem>
                          <SelectItem value="CALL">Call</SelectItem>
                          <SelectItem value="VISIT">Site visit</SelectItem>
                          <SelectItem value="WA_MESSAGE">WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Short description…"
                        value={activityNotes}
                        onChange={(e) => setActivityNotes(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowActivityForm(false);
                          setActivityNotes('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={submitActivity} disabled={logActivity.isPending}>
                        Log
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {lead.activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No activity yet. Log calls, site visits, and notes as they happen.
                    </p>
                  ) : (
                    lead.activities.map((a) => {
                      const Icon = ACTIVITY_ICON[a.activity_type] ?? StickyNote;
                      return (
                        <div key={a.id} className="flex gap-3 rounded-md border p-2">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1 text-xs font-medium">
                              <span>{ACTIVITY_LABEL[a.activity_type]}</span>
                              <span className="text-muted-foreground font-normal">
                                · {formatDate(a.created_at)}
                              </span>
                              {a.done_by_name && (
                                <span className="text-muted-foreground font-normal">
                                  · by {a.done_by_name}
                                </span>
                              )}
                            </p>
                            {a.notes && (
                              <p className="mt-0.5 text-sm text-muted-foreground">{a.notes}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Book form — appears when the "Mark as Booked" button is clicked */}
              {showBookForm && (
                <section className="rounded-md border border-teal-300 bg-teal-50/50 p-4">
                  <p className="mb-2 text-sm font-medium text-teal-900">Mark as Booked</p>
                  <p className="mb-3 text-xs text-teal-800">
                    Records the advance payment on this lead. The tenant record itself is
                    created later via <em>Complete check-in</em> once they physically move in.
                  </p>
                  <div className="space-y-2">
                    <div>
                      <Label>Advance amount (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        placeholder="e.g. 5000"
                        value={advanceRupees}
                        onChange={(e) => setAdvanceRupees(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label>Note (optional)</Label>
                      <Input
                        placeholder="e.g. UPI ref ABCD1234"
                        value={bookNote}
                        onChange={(e) => setBookNote(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowBookForm(false);
                          setAdvanceRupees('');
                          setBookNote('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={submitBook} disabled={savePatch.isPending}>
                        {savePatch.isPending ? 'Saving…' : 'Book'}
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              {/* Lost form */}
              {showLostForm && (
                <section className="rounded-md border border-rose-300 bg-rose-50/50 p-4">
                  <p className="mb-2 text-sm font-medium text-rose-900">Mark as Lost</p>
                  <div className="space-y-2">
                    <Input
                      placeholder="Reason (e.g. 'chose competitor', 'moved out of city')"
                      value={lostReason}
                      onChange={(e) => setLostReason(e.target.value)}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => setShowLostForm(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={markLost}
                        disabled={savePatch.isPending}
                      >
                        Mark Lost
                      </Button>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* ── Sticky footer with contextual action buttons ──────────── */}
            <div className="sticky bottom-0 border-t bg-background p-3">
              {lead.status === 'LOST' || lead.status === 'CONVERTED' ? (
                <p className="text-center text-xs text-muted-foreground">
                  Lead is {STATUS_LABEL[lead.status].toLowerCase()}. Drag the card to another
                  column to reopen.
                </p>
              ) : lead.status === 'BOOKED' ? (
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => onOpenCheckin?.(lead)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete check-in
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={markConverted}>
                      Skip → Converted
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => setShowLostForm(true)}
                    >
                      Mark Lost
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowBookForm(true)}
                    disabled={showBookForm}
                  >
                    <Wallet className="h-4 w-4" />
                    Mark as Booked
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-600 hover:bg-rose-50"
                    onClick={() => setShowLostForm(true)}
                    disabled={showLostForm}
                  >
                    Mark Lost
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Detail row ──────────────────────────────────────────────────────────────

function DetailItem({
  icon: Icon,
  label,
  value,
  wide = false,
}: {
  icon: typeof PhoneCall;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
