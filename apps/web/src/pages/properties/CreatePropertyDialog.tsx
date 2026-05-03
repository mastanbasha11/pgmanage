import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Button } from '@/components/ui/button';
import { useCreateProperty } from '@/hooks/useProperties';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/auth';

const schema = z.object({
  name: z.string().min(2, 'Property name required'),
  address_line1: z.string().min(2, 'Address required'),
  address_line2: z.string().optional(),
  city: z.string().min(2, 'City required'),
  state: z.string().min(2, 'State required'),
  pincode: z.string().regex(/^\d{6}$/, 'Enter valid 6-digit PIN'),
  google_maps_url: z.string().url('Invalid URL').optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (propertyId: string) => void;
}

export default function CreatePropertyDialog({ open, onClose, onCreated }: Props) {
  const { mutateAsync, isPending } = useCreateProperty();
  const { toast } = useToast();
  const { setSelectedProperty } = useAuthStore();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    try {
      const created = await mutateAsync({
        name: data.name,
        address_line1: data.address_line1,
        address_line2: data.address_line2 || undefined,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        google_maps_url: data.google_maps_url || undefined,
        amenities: [],
      });
      toast({
        title: 'Property created',
        description: `${data.name} is ready. Add floors and rooms next.`,
      });
      if (created.id) setSelectedProperty(created.id);
      reset();
      onClose();
      if (created.id && onCreated) onCreated(created.id);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not create property.';
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
          <DialogTitle>Add a property</DialogTitle>
          <DialogDescription>
            Create a new property — you can add floors, rooms and beds afterwards.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Property Name *</Label>
            <Input {...register('name')} placeholder="Sri Balaji PG — Block A" />
            {errors.name && (
              <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
            )}
          </div>
          <div>
            <Label>Address *</Label>
            <Input {...register('address_line1')} placeholder="123, Main Road" />
            {errors.address_line1 && (
              <p className="text-xs text-destructive mt-1">{errors.address_line1.message}</p>
            )}
          </div>
          <div>
            <Label>Address Line 2</Label>
            <Input {...register('address_line2')} placeholder="Near landmark" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>City *</Label>
              <Input {...register('city')} placeholder="Bangalore" />
              {errors.city && (
                <p className="text-xs text-destructive mt-1">{errors.city.message}</p>
              )}
            </div>
            <div>
              <Label>State *</Label>
              <Input {...register('state')} placeholder="Karnataka" />
              {errors.state && (
                <p className="text-xs text-destructive mt-1">{errors.state.message}</p>
              )}
            </div>
          </div>
          <div>
            <Label>PIN Code *</Label>
            <Input {...register('pincode')} placeholder="560001" />
            {errors.pincode && (
              <p className="text-xs text-destructive mt-1">{errors.pincode.message}</p>
            )}
          </div>
          <div>
            <Label>Google Maps URL (optional)</Label>
            <Input {...register('google_maps_url')} placeholder="https://maps.google.com/..." />
            {errors.google_maps_url && (
              <p className="text-xs text-destructive mt-1">{errors.google_maps_url.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Property'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
