import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, ChevronLeft, Check, BedDouble, FileUp, FileText, Image as ImageIcon, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCheckin, useVacantBeds, useUploadIdProof } from '@/hooks/useTenants';
import { useProperties } from '@/hooks/useProperties';
import { useToast } from '@/hooks/useToast';
import { rupeesToPaise, formatPaise, cn, normaliseIndianPhone, PHONE_HELP } from '@/lib/utils';

const STEPS = ['Personal', 'Identity', 'Emergency', 'Bed', 'Rent', 'Confirm'];

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  phone: z.string().refine((v) => normaliseIndianPhone(v) !== null, PHONE_HELP),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  id_type: z.enum(['AADHAR', 'PASSPORT', 'DRIVING_LICENSE', 'OTHER']),
  id_number: z.string().min(4, 'ID number required'),
  emergency_contact_name: z.string().min(2, 'Name required'),
  emergency_contact_phone: z
    .string()
    .refine((v) => normaliseIndianPhone(v) !== null, PHONE_HELP),
  emergency_contact_relation: z.string().min(2, 'Relation required'),
  property_id: z.string().uuid('Select a property'),
  bed_id: z.string().uuid('Select a bed'),
  move_in_date: z.string().min(1, 'Date required'),
  monthly_rent_rupees: z.coerce.number().positive('Rent required'),
  security_deposit_rupees: z.coerce.number().min(0).default(0),
  advance_rupees: z.coerce.number().min(0).default(0),
  non_refundable_advance_rupees: z.coerce.number().min(0).default(0),
  billing_day: z.coerce.number().int().min(1).max(28).default(1),
  food_included: z.boolean().default(false),
  food_charges_rupees: z.coerce.number().min(0).default(0),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CheckinWizard({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [idProofFile, setIdProofFile] = useState<File | null>(null);
  const { toast } = useToast();
  const { mutateAsync: checkin, isPending } = useCheckin();
  const { mutateAsync: uploadIdProof } = useUploadIdProof();
  const { data: propertiesData } = useProperties();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      id_type: 'AADHAR',
      billing_day: 1,
      security_deposit_rupees: 0,
      advance_rupees: 0,
      non_refundable_advance_rupees: 0,
      food_included: false,
      food_charges_rupees: 0,
      move_in_date: new Date().toISOString().slice(0, 10),
    },
  });

  const selectedPropertyId = watch('property_id');
  const selectedBedId = watch('bed_id');
  const monthlyRent = watch('monthly_rent_rupees');

  const { data: vacantBeds, isLoading: loadingBeds } = useVacantBeds(selectedPropertyId, {
    includeUpcoming: false,
  });

  // Pre-fill rent from selected bed's room base rent
  useEffect(() => {
    if (!selectedBedId || !vacantBeds) return;
    const bed = vacantBeds.items.find((b) => b.id === selectedBedId);
    if (bed && !monthlyRent) {
      setValue('monthly_rent_rupees', Math.round(bed.monthly_base_rent_paise / 100));
    }
  }, [selectedBedId, vacantBeds, setValue, monthlyRent]);

  function reset_form() {
    reset();
    setStep(0);
  }

  async function onSubmit(data: FormData) {
    try {
      const phone = normaliseIndianPhone(data.phone) ?? data.phone;
      const ecPhone =
        normaliseIndianPhone(data.emergency_contact_phone) ?? data.emergency_contact_phone;
      const checkinRes = await checkin({
        name: data.name,
        phone,
        email: data.email || undefined,
        bed_id: data.bed_id,
        id_type: data.id_type,
        id_number: data.id_number,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: ecPhone,
        emergency_contact_relation: data.emergency_contact_relation,
        move_in_date: data.move_in_date,
        rent_plan: {
          monthly_rent_paise: rupeesToPaise(data.monthly_rent_rupees),
          security_deposit_paise: rupeesToPaise(data.security_deposit_rupees ?? 0),
          advance_paid_paise: rupeesToPaise(data.advance_rupees ?? 0),
          non_refundable_advance_paise: rupeesToPaise(
            data.non_refundable_advance_rupees ?? 0,
          ),
          food_included: data.food_included,
          food_charges_paise: data.food_included
            ? rupeesToPaise(data.food_charges_rupees ?? 0)
            : 0,
          billing_day: data.billing_day,
          effective_from: data.move_in_date,
        },
      });
      // Best-effort: upload ID proof if attached. Failure here doesn't roll
      // back the check-in — the tenant exists; the user can retry from the
      // tenant detail page.
      const newTenantId: string | undefined =
        (checkinRes as { tenant_id?: string; id?: string } | undefined)?.tenant_id ??
        (checkinRes as { tenant_id?: string; id?: string } | undefined)?.id;
      if (idProofFile && newTenantId) {
        try {
          await uploadIdProof({ id: newTenantId, file: idProofFile });
        } catch {
          toast({
            title: 'Check-in saved, but ID proof upload failed',
            description: 'You can retry uploading from the tenant page.',
            variant: 'destructive',
          });
        }
      }
      toast({
        title: 'Tenant checked in',
        description: `${data.name} has been checked in successfully.`,
      });
      setIdProofFile(null);
      onClose();
      reset_form();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Could not record check-in.';
      toast({ title: 'Check-in failed', description: message, variant: 'destructive' });
    }
  }

  const FIELDS_PER_STEP: Array<Array<keyof FormData>> = [
    ['name', 'phone', 'email'],
    ['id_type', 'id_number'],
    ['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation'],
    ['property_id', 'bed_id'],
    ['move_in_date', 'monthly_rent_rupees', 'billing_day'],
    [],
  ];

  async function next() {
    const valid = await trigger(FIELDS_PER_STEP[step]);
    if (valid && step < STEPS.length - 1) setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          reset_form();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tenant Check-In</DialogTitle>
          <DialogDescription>
            {STEPS[step]} — step {step + 1} of {STEPS.length}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 shrink-0">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                  i < step
                    ? 'bg-accent text-accent-foreground'
                    : i === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  'hidden sm:block',
                  i === step ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {step === 0 && (
            <div className="space-y-3">
              <div>
                <Label>Full Name *</Label>
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
                <Label>Email (optional)</Label>
                <Input {...register('email')} type="email" placeholder="rahul@example.com" />
                {errors.email && (
                  <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <Label>ID Type *</Label>
                <Select
                  value={watch('id_type')}
                  onValueChange={(v) => setValue('id_type', v as FormData['id_type'])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(['AADHAR', 'PASSPORT', 'DRIVING_LICENSE', 'OTHER'] as const).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.id_type && (
                  <p className="text-xs text-destructive mt-1">{errors.id_type.message}</p>
                )}
              </div>
              <div>
                <Label>ID Number *</Label>
                <Input {...register('id_number')} placeholder="xxxx xxxx xxxx" />
                {errors.id_number && (
                  <p className="text-xs text-destructive mt-1">{errors.id_number.message}</p>
                )}
              </div>
              <div>
                <Label>ID proof (optional)</Label>
                <label
                  htmlFor="id-proof-input"
                  className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                >
                  {idProofFile ? (
                    idProofFile.type === 'application/pdf' ? (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )
                  ) : (
                    <FileUp className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">
                    {idProofFile?.name ?? 'Choose image or PDF'}
                  </span>
                  {idProofFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setIdProofFile(null);
                      }}
                      className="rounded p-0.5 hover:bg-muted"
                      aria-label="Clear file"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                  <input
                    id="id-proof-input"
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setIdProofFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Aadhar / passport / address proof — image or PDF, max 15 MB.
                  Auto-compressed for images.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <Label>Emergency Contact Name *</Label>
                <Input {...register('emergency_contact_name')} placeholder="Parent name" />
                {errors.emergency_contact_name && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.emergency_contact_name.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Phone *</Label>
                <Input {...register('emergency_contact_phone')} placeholder="9876543211" />
                {errors.emergency_contact_phone && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.emergency_contact_phone.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Relation *</Label>
                <Input
                  {...register('emergency_contact_relation')}
                  placeholder="Father / Mother / Sibling"
                />
                {errors.emergency_contact_relation && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.emergency_contact_relation.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <BedPickerStep
              properties={propertiesData?.items ?? []}
              propertyId={selectedPropertyId}
              onChangeProperty={(v) => {
                setValue('property_id', v);
                setValue('bed_id', '');
              }}
              vacantBeds={vacantBeds?.items ?? []}
              loadingBeds={loadingBeds}
              bedId={selectedBedId}
              onChangeBed={(v) => setValue('bed_id', v)}
              propertyError={errors.property_id?.message}
              bedError={errors.bed_id?.message}
            />
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div>
                <Label>Move-in Date *</Label>
                <Input {...register('move_in_date')} type="date" />
                {errors.move_in_date && (
                  <p className="text-xs text-destructive mt-1">{errors.move_in_date.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Monthly Rent (₹) *</Label>
                  <Input
                    {...register('monthly_rent_rupees')}
                    type="number"
                    placeholder="7000"
                  />
                  {errors.monthly_rent_rupees && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.monthly_rent_rupees.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Billing Day (1–28)</Label>
                  <Input {...register('billing_day')} type="number" min={1} max={28} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Security Deposit (₹)</Label>
                  <Input
                    {...register('security_deposit_rupees')}
                    type="number"
                    placeholder="0"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Refundable</p>
                </div>
                <div>
                  <Label>Refundable Advance (₹)</Label>
                  <Input {...register('advance_rupees')} type="number" placeholder="0" />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Refundable; adjusted against unpaid rent
                  </p>
                </div>
              </div>
              <div>
                <Label>Non-refundable Advance (₹)</Label>
                <Input
                  {...register('non_refundable_advance_rupees')}
                  type="number"
                  placeholder="0"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Joining fee / one-time charge — not returned at checkout
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...register('food_included')}
                    className="h-4 w-4 rounded border-input"
                  />
                  Food included
                </label>
                {watch('food_included') && (
                  <div>
                    <Label className="text-xs">Food charges per month (₹)</Label>
                    <Input
                      {...register('food_charges_rupees')}
                      type="number"
                      placeholder="3000"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="rounded-lg border p-4 space-y-3 text-sm bg-muted/30">
              <p className="font-medium flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-accent" />
                Review check-in details
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
                <dt>Name</dt>
                <dd className="text-foreground font-medium">{watch('name')}</dd>
                <dt>Phone</dt>
                <dd className="text-foreground">{watch('phone')}</dd>
                <dt>ID</dt>
                <dd className="text-foreground">
                  {watch('id_type')} · {watch('id_number')}
                </dd>
                <dt>Bed</dt>
                <dd className="text-foreground">
                  {vacantBeds?.items.find((b) => b.id === selectedBedId)
                    ? `${
                        vacantBeds.items.find((b) => b.id === selectedBedId)!.floor_name
                      } · Room ${
                        vacantBeds.items.find((b) => b.id === selectedBedId)!.room_number
                      } · Bed ${vacantBeds.items.find((b) => b.id === selectedBedId)!.bed_label}`
                    : '—'}
                </dd>
                <dt>Move-in</dt>
                <dd className="text-foreground">{watch('move_in_date')}</dd>
                <dt>Rent</dt>
                <dd className="text-foreground">
                  ₹{watch('monthly_rent_rupees')}/mo · billing day {watch('billing_day')}
                </dd>
              </dl>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button type="button" variant="outline" onClick={back} disabled={step === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Checking in...' : 'Confirm Check-In'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Cascading Floor → Room → Bed picker
// ────────────────────────────────────────────────────────────────────────────────

interface BedPickerProps {
  properties: Array<{ id: string; name: string }>;
  propertyId: string | undefined;
  onChangeProperty: (id: string) => void;
  vacantBeds: Array<{
    id: string;
    bed_label: string;
    room_id: string;
    room_number: string;
    floor_id: string;
    floor_name: string;
    floor_number: number;
    room_type?: string;
    monthly_base_rent_paise: number;
  }>;
  loadingBeds: boolean;
  bedId: string | undefined;
  onChangeBed: (id: string) => void;
  propertyError?: string;
  bedError?: string;
}

function BedPickerStep({
  properties,
  propertyId,
  onChangeProperty,
  vacantBeds,
  loadingBeds,
  bedId,
  onChangeBed,
  propertyError,
  bedError,
}: BedPickerProps) {
  const [floorId, setFloorId] = useState('');
  const [roomId, setRoomId] = useState('');

  // Sync local floor/room when bed already chosen (e.g. coming back to this step)
  useEffect(() => {
    if (!bedId) return;
    const bed = vacantBeds.find((b) => b.id === bedId);
    if (bed) {
      setFloorId(bed.floor_id);
      setRoomId(bed.room_id);
    }
  }, [bedId, vacantBeds]);

  const floors = Array.from(
    new Map(
      vacantBeds.map((b) => [
        b.floor_id,
        { id: b.floor_id, name: b.floor_name, num: b.floor_number },
      ]),
    ).values(),
  ).sort((a, b) => a.num - b.num);

  const rooms = Array.from(
    new Map(
      vacantBeds
        .filter((b) => b.floor_id === floorId)
        .map((b) => [
          b.room_id,
          { id: b.room_id, number: b.room_number, type: b.room_type },
        ]),
    ).values(),
  ).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  const beds = vacantBeds.filter((b) => b.room_id === roomId);

  return (
    <div className="space-y-3">
      <div>
        <Label>Property *</Label>
        <Select
          value={propertyId ?? ''}
          onValueChange={(v) => {
            onChangeProperty(v);
            setFloorId('');
            setRoomId('');
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select property" />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {propertyError && <p className="text-xs text-destructive mt-1">{propertyError}</p>}
      </div>

      {!propertyId ? (
        <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          Select a property to load vacant beds.
        </p>
      ) : loadingBeds ? (
        <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          Loading vacant beds...
        </p>
      ) : floors.length === 0 ? (
        <p className="rounded border border-dashed border-destructive/40 p-3 text-xs text-destructive">
          No vacant beds in this property. Add rooms or free up beds first.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Floor</Label>
            <Select
              value={floorId}
              onValueChange={(v) => {
                setFloorId(v);
                setRoomId('');
                onChangeBed('');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Floor" />
              </SelectTrigger>
              <SelectContent>
                {floors.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Room</Label>
            <Select
              value={roomId}
              onValueChange={(v) => {
                setRoomId(v);
                onChangeBed('');
              }}
              disabled={!floorId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Room" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.number}
                    {r.type ? ` · ${r.type}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Bed</Label>
            <Select
              value={bedId ?? ''}
              onValueChange={onChangeBed}
              disabled={!roomId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Bed" />
              </SelectTrigger>
              <SelectContent>
                {beds.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    Bed {b.bed_label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {bedId && (
        <p className="text-xs text-muted-foreground">
          Base rent for this room:{' '}
          <span className="font-medium text-foreground">
            {formatPaise(
              vacantBeds.find((b) => b.id === bedId)?.monthly_base_rent_paise ?? 0,
            )}
            /mo
          </span>
        </p>
      )}

      {bedError && <p className="text-xs text-destructive">{bedError}</p>}
    </div>
  );
}
