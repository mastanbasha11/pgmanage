import { useState } from 'react';
import {
  Building2,
  Plus,
  ChevronRight,
  ChevronLeft,
  Check,
  Home,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useAddFloor,
  useAddRoom,
  useCreateRoomType,
  useDeleteFloor,
  useDeleteRoom,
  useDeleteRoomType,
  useProperty,
  usePropertyOccupancy,
  useRoomTypes,
  useUpdateFloor,
  useUpdateRoom,
  useUpdateRoomType,
} from '@/hooks/useProperties';
import { useToast } from '@/hooks/useToast';
import { cn, formatPaise, rupeesToPaise } from '@/lib/utils';
import TeamRoster from '@/pages/properties/TeamRoster';
import PaybackPlanSection from '@/pages/roi/PaybackPlanSection';

type Step = 'floors' | 'roomTypes' | 'rooms' | 'owners' | 'payback' | 'review';

const STEPS: { key: Step; label: string; optional?: boolean }[] = [
  { key: 'floors', label: 'Floors' },
  { key: 'roomTypes', label: 'Room Types' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'owners', label: 'Owners', optional: true },
  { key: 'payback', label: 'Payback Plan', optional: true },
  { key: 'review', label: 'Review' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  propertyId: string;
}

export default function PropertySetupDialog({ open, onClose, propertyId }: Props) {
  const [step, setStep] = useState<Step>('floors');
  const { data: property } = useProperty(propertyId);
  const { data: occupancy } = usePropertyOccupancy(propertyId);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
            <Building2 className="h-5 w-5 text-accent" />
            Configure — {property?.name ?? 'property'}
          </DialogTitle>
          <DialogDescription>
            Floors → room types → rooms &amp; beds → owners → payback plan. Click any step to
            jump.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper — mock-style pill steps: done = green ✓, active = dark fill */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStep(s.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                  s.key === step
                    ? 'border-[#161b26] bg-[#161b26] text-white'
                    : 'border-border bg-card text-[#4a5261] hover:bg-secondary',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-extrabold',
                    i < stepIndex
                      ? 'bg-[#15803d] text-white'
                      : s.key === step
                        ? 'bg-white text-[#161b26]'
                        : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {i < stepIndex ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-[#c5ccd8]" />
              )}
            </div>
          ))}
        </div>

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {step === 'floors' && (
            <FloorsStep
              propertyId={propertyId}
              floors={occupancy?.floors ?? []}
            />
          )}
          {step === 'roomTypes' && <RoomTypesStep propertyId={propertyId} />}
          {step === 'rooms' && (
            <RoomsStep
              propertyId={propertyId}
              floors={occupancy?.floors ?? []}
            />
          )}
          {step === 'owners' && (
            <div className="py-2">
              <p className="mb-3 text-xs text-muted-foreground">
                Optional. Add each owner with their profit share % and (optionally)
                their capital contribution. Managers and collectors captured here
                also populate the Paid To / Paid By dropdowns on payments &amp;
                expenses. You can skip and add them later from the property's
                Team &amp; Owners tab.
              </p>
              <TeamRoster propertyId={propertyId} />
            </div>
          )}
          {step === 'payback' && (
            <div className="py-2">
              <p className="mb-3 text-xs text-muted-foreground">
                Optional. Capture total investment, lease term, grace months,
                monthly lessor rent, and the annual hike ladder. This powers the
                ROI Calculator + dashboard payback chart. Skip to add it later
                from ROI → Payback Plan.
              </p>
              <PaybackPlanSection propertyId={propertyId} />
            </div>
          )}
          {step === 'review' && (
            <ReviewStep floors={occupancy?.floors ?? []} />
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <Button
            variant="outline"
            onClick={() => stepIndex > 0 && setStep(STEPS[stepIndex - 1].key)}
            disabled={stepIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {stepIndex < STEPS.length - 1 ? (
            <div className="flex items-center gap-2">
              {STEPS[stepIndex].optional && (
                <Button
                  variant="ghost"
                  onClick={() => setStep(STEPS[stepIndex + 1].key)}
                >
                  Skip
                </Button>
              )}
              <Button onClick={() => setStep(STEPS[stepIndex + 1].key)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : (
            <Button onClick={onClose}>Done</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Floor step
// ────────────────────────────────────────────────────────────────────────────────

function FloorsStep({
  propertyId,
  floors,
}: {
  propertyId: string;
  floors: Array<{ id: string; floor_number: number; display_name: string }>;
}) {
  const [floorNum, setFloorNum] = useState('');
  const [name, setName] = useState('');
  const { mutateAsync, isPending } = useAddFloor(propertyId);
  const { toast } = useToast();

  async function add() {
    if (!floorNum || !name) {
      toast({ title: 'Floor number and name are required', variant: 'destructive' });
      return;
    }
    try {
      await mutateAsync({ floor_number: Number(floorNum), display_name: name });
      toast({ title: 'Floor added' });
      setFloorNum('');
      setName('');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not add floor.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-[100px_1fr_auto] gap-2 items-end">
        <div>
          <Label className="text-xs">Number</Label>
          <Input
            type="number"
            value={floorNum}
            onChange={(e) => setFloorNum(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label className="text-xs">Display name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ground / 1st / Block A"
          />
        </div>
        <Button onClick={add} disabled={isPending}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {floors.length === 0 ? (
        <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
          No floors yet. Add at least one to continue.
        </p>
      ) : (
        <ul className="space-y-2">
          {floors.map((f) => (
            <FloorRow key={f.id} floor={f} propertyId={propertyId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FloorRow({
  floor,
  propertyId,
}: {
  floor: { id: string; floor_number: number; display_name: string };
  propertyId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(String(floor.floor_number));
  const [name, setName] = useState(floor.display_name);
  const update = useUpdateFloor(propertyId);
  const del = useDeleteFloor(propertyId);
  const { toast } = useToast();

  async function save() {
    try {
      await update.mutateAsync({
        floor_id: floor.id,
        floor_number: Number(num),
        display_name: name,
      });
      toast({ title: 'Floor updated' });
      setEditing(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not update floor.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${floor.display_name}? It must have no rooms.`)) return;
    try {
      await del.mutateAsync(floor.id);
      toast({ title: 'Floor deleted' });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not delete floor.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 rounded border bg-card px-3 py-2 text-sm">
        <Input
          type="number"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          className="h-8 w-20"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 flex-1"
        />
        <Button size="sm" onClick={save} disabled={update.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded border bg-card px-3 py-2 text-sm">
      <span className="font-medium">{floor.display_name}</span>
      <div className="flex items-center gap-2">
        <Badge variant="outline">Floor {floor.floor_number}</Badge>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={remove}
          disabled={del.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Room Types step
// ────────────────────────────────────────────────────────────────────────────────

function RoomTypesStep({ propertyId }: { propertyId: string }) {
  const { data: roomTypes } = useRoomTypes(propertyId);
  const { mutateAsync, isPending } = useCreateRoomType(propertyId);
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: '',
    capacity: 1,
    rent: '',
    description: '',
  });

  async function add() {
    if (!form.name || !form.rent) {
      toast({ title: 'Name and rent are required', variant: 'destructive' });
      return;
    }
    try {
      await mutateAsync({
        name: form.name,
        capacity: form.capacity,
        monthly_base_rent_paise: rupeesToPaise(Number(form.rent)),
        description: form.description || undefined,
      });
      toast({ title: 'Room type added' });
      setForm({ name: '', capacity: 1, rent: '', description: '' });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not add room type.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4 py-2">
      <Card className="bg-muted/30">
        <CardContent className="pt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Single AC / Double Sharing"
              />
            </div>
            <div>
              <Label className="text-xs">Beds per room *</Label>
              <Input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Base rent (₹/month) *</Label>
              <Input
                type="number"
                value={form.rent}
                onChange={(e) => setForm({ ...form, rent: e.target.value })}
                placeholder="7000"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={add} disabled={isPending} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add type
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="With AC, attached bath, etc."
            />
          </div>
        </CardContent>
      </Card>

      {roomTypes && roomTypes.items.length > 0 ? (
        <ul className="space-y-2">
          {roomTypes.items.map((rt) => (
            <RoomTypeRow key={rt.id} rt={rt} propertyId={propertyId} />
          ))}
        </ul>
      ) : (
        <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
          No room types yet. Add common configurations like Single AC, Double Sharing, etc.
        </p>
      )}
    </div>
  );
}

function RoomTypeRow({
  rt,
  propertyId,
}: {
  rt: { id: string; name: string; capacity: number; monthly_base_rent_paise: number; description?: string };
  propertyId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(rt.name);
  const [capacity, setCapacity] = useState(rt.capacity);
  const [rent, setRent] = useState(String(Math.round(rt.monthly_base_rent_paise / 100)));
  const update = useUpdateRoomType(propertyId);
  const del = useDeleteRoomType(propertyId);
  const { toast } = useToast();

  async function save() {
    try {
      await update.mutateAsync({
        room_type_id: rt.id,
        name,
        capacity,
        monthly_base_rent_paise: rupeesToPaise(Number(rent)),
        description: rt.description,
      });
      toast({ title: 'Room type updated' });
      setEditing(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not update room type.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  async function remove() {
    if (!window.confirm(`Delete room type '${rt.name}'?`)) return;
    try {
      await del.mutateAsync(rt.id);
      toast({ title: 'Room type removed' });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not delete room type.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 rounded border bg-card px-3 py-2 text-sm">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 flex-1"
        />
        <Input
          type="number"
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
          className="h-8 w-20"
        />
        <Input
          type="number"
          value={rent}
          onChange={(e) => setRent(e.target.value)}
          className="h-8 w-28"
        />
        <Button size="sm" onClick={save} disabled={update.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded border bg-card px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{rt.name}</p>
        {rt.description && (
          <p className="text-xs text-muted-foreground">{rt.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">
          {rt.capacity} {rt.capacity === 1 ? 'bed' : 'beds'}
        </Badge>
        <span className="text-sm font-semibold tabular-nums">
          {formatPaise(rt.monthly_base_rent_paise)}/mo
        </span>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={remove}
          disabled={del.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Rooms step
// ────────────────────────────────────────────────────────────────────────────────

function RoomsStep({
  propertyId,
  floors,
}: {
  propertyId: string;
  floors: Array<{ id: string; display_name: string; floor_number: number; rooms: Array<{ id: string; room_number: string; display_name?: string; capacity: number; total_beds: number; has_ac?: boolean }> }>;
}) {
  const { data: roomTypes } = useRoomTypes(propertyId);
  const { mutateAsync, isPending } = useAddRoom(propertyId);
  const { toast } = useToast();
  const [form, setForm] = useState({
    floor_id: '',
    room_type_id: '',
    room_number: '',
    display_name: '',
  });

  async function add() {
    if (!form.floor_id || !form.room_number) {
      toast({ title: 'Pick a floor and enter a room number', variant: 'destructive' });
      return;
    }
    try {
      await mutateAsync({
        floor_id: form.floor_id,
        room_type_id: form.room_type_id || undefined,
        room_number: form.room_number,
        display_name: form.display_name || form.room_number,
      });
      toast({ title: 'Room added with beds' });
      setForm({ ...form, room_number: '', display_name: '' });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not add room.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  if (floors.length === 0) {
    return (
      <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
        Add at least one floor in the previous step before creating rooms.
      </p>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <Card className="bg-muted/30">
        <CardContent className="pt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Floor *</Label>
              <Select
                value={form.floor_id}
                onValueChange={(v) => setForm({ ...form, floor_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick floor" />
                </SelectTrigger>
                <SelectContent>
                  {floors.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Room type</Label>
              <Select
                value={form.room_type_id}
                onValueChange={(v) => setForm({ ...form, room_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick type (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {(roomTypes?.items ?? []).map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name} · {rt.capacity} beds
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Room number *</Label>
              <Input
                value={form.room_number}
                onChange={(e) => setForm({ ...form, room_number: e.target.value })}
                placeholder="101"
              />
            </div>
            <div>
              <Label className="text-xs">Display name</Label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Room 101"
              />
            </div>
          </div>
          <Button onClick={add} disabled={isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add room (beds auto-created)
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {floors.map((f) => (
          <div key={f.id}>
            <p className="text-xs font-medium text-muted-foreground mb-1">{f.display_name}</p>
            {(f.rooms?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic ml-1">No rooms yet</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {f.rooms.map((r) => (
                  <RoomRow key={r.id} room={r} propertyId={propertyId} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomRow({
  room,
  propertyId,
}: {
  room: {
    id: string;
    room_number: string;
    capacity: number;
    total_beds?: number;
    has_ac?: boolean;
  };
  propertyId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(room.room_number);
  const update = useUpdateRoom(propertyId);
  const del = useDeleteRoom(propertyId);
  const { toast } = useToast();

  async function save() {
    try {
      await update.mutateAsync({ room_id: room.id, room_number: num });
      toast({ title: 'Room renamed' });
      setEditing(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not rename room.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  /** Toggle the room's has_ac flag inline. Optimistic feel — no dialog. */
  async function toggleAC() {
    try {
      await update.mutateAsync({ room_id: room.id, has_ac: !room.has_ac });
      toast({
        title: !room.has_ac ? 'Marked as AC' : 'AC removed',
        description: `Room ${room.room_number}`,
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not update AC flag.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete Room ${room.room_number}? Beds will also be deleted (only allowed if vacant).`,
      )
    )
      return;
    try {
      await del.mutateAsync(room.id);
      toast({ title: 'Room deleted' });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not delete room.';
      toast({ title: 'Failed', description: message, variant: 'destructive' });
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded border bg-card px-3 py-2 text-sm">
        <Input
          value={num}
          onChange={(e) => setNum(e.target.value)}
          className="h-8 flex-1"
          placeholder="Room number"
        />
        <Button size="sm" onClick={save} disabled={update.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded border bg-card px-3 py-2 text-sm">
      <span className="font-medium">Room {room.room_number}</span>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[10px]">
          {room.total_beds ?? room.capacity} beds
        </Badge>
        <button
          type="button"
          onClick={toggleAC}
          disabled={update.isPending}
          title={room.has_ac ? 'Remove AC' : 'Mark as AC'}
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
            room.has_ac
              ? 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200'
              : 'bg-muted text-muted-foreground border-input hover:bg-muted/70',
          )}
        >
          {room.has_ac ? 'AC' : '+ AC'}
        </button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={remove}
          disabled={del.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Review step
// ────────────────────────────────────────────────────────────────────────────────

function ReviewStep({
  floors,
}: {
  floors: Array<{
    id: string;
    display_name: string;
    rooms: Array<{ id: string; total_beds: number; capacity: number; vacant_count: number; occupied_count: number }>;
  }>;
}) {
  const totalRooms = floors.reduce((s, f) => s + (f.rooms?.length ?? 0), 0);
  const totalBeds = floors.reduce(
    (s, f) => s + (f.rooms?.reduce((rs, r) => rs + (r.total_beds ?? r.capacity ?? 0), 0) ?? 0),
    0,
  );

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xs text-muted-foreground">Floors</p>
            <p className="mt-1 text-2xl font-bold">{floors.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xs text-muted-foreground">Rooms</p>
            <p className="mt-1 text-2xl font-bold">{totalRooms}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xs text-muted-foreground">Beds</p>
            <p className="mt-1 text-2xl font-bold">{totalBeds}</p>
          </CardContent>
        </Card>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Home className="h-4 w-4 text-accent" />
          You're all set.
        </p>
        <p className="mt-1 text-muted-foreground">
          You can now check tenants in from the Tenants page. Come back here any time to add more
          floors, rooms or beds.
        </p>
      </div>
    </div>
  );
}
