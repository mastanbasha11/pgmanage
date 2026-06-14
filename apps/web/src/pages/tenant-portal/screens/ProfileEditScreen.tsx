/**
 * Profile edit — name, emergency contact, vehicle (matches the
 * native-app onboarding flow but in one form on web).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { useTenantProfile, useTenantUpdateKyc } from '@/lib/tenant-data/hooks';
import type { VehicleType } from '@/lib/tenant-data/types';

import { PageHeader, SectionHeader } from './_shared';

export default function ProfileEditScreen() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const profileQ = useTenantProfile();
  const updateM = useTenantUpdateKyc();
  const p = profileQ.data;

  const [name, setName] = useState('');
  const [emName, setEmName] = useState('');
  const [emPhone, setEmPhone] = useState('');
  const [emRelation, setEmRelation] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('NONE');
  const [vehicleReg, setVehicleReg] = useState('');

  useEffect(() => {
    if (!p) return;
    setName(p.name || '');
    setEmName(p.emergency?.name || '');
    setEmPhone(p.emergency?.phone || '');
    setEmRelation(p.emergency?.relation || '');
    setVehicleType(p.vehicle.type);
    setVehicleReg(p.vehicle.registration || '');
  }, [p]);

  async function save() {
    if (vehicleType !== 'NONE' && vehicleReg.trim().length < 4) {
      toast({ title: 'Vehicle registration required', variant: 'destructive' });
      return;
    }
    try {
      await updateM.mutateAsync({
        name: name.trim(),
        emergencyContactName: emName.trim(),
        emergencyContactPhone: emPhone.trim(),
        emergencyContactRelation: emRelation.trim(),
        vehicleType,
        vehicleRegistration: vehicleType === 'NONE' ? undefined : vehicleReg.trim().toUpperCase(),
      });
      toast({ title: 'Profile updated' });
      navigate('/portal/profile');
    } catch (err: unknown) {
      const m =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not save';
      toast({ title: 'Failed', description: m, variant: 'destructive' });
    }
  }

  return (
    <div>
      <PageHeader title="Edit profile" />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <SectionHeader title="Emergency contact" />
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <Label>Name</Label>
            <Input
              value={emName}
              onChange={(e) => setEmName(e.target.value)}
              placeholder="Parent / sibling / friend"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={emPhone}
              onChange={(e) => setEmPhone(e.target.value)}
              placeholder="9876543210"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Relation</Label>
            <Input
              value={emRelation}
              onChange={(e) => setEmRelation(e.target.value)}
              placeholder="Mother / Father / Sibling"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      <SectionHeader title="Vehicle" subtitle="For gate security" />
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <Label>Type</Label>
            <Select
              value={vehicleType}
              onValueChange={(v) => {
                setVehicleType(v as VehicleType);
                if (v === 'NONE') setVehicleReg('');
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No vehicle</SelectItem>
                <SelectItem value="TWO_WHEELER">Two-wheeler</SelectItem>
                <SelectItem value="FOUR_WHEELER">Four-wheeler</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {vehicleType !== 'NONE' ? (
            <div>
              <Label>Registration number</Label>
              <Input
                value={vehicleReg}
                onChange={(e) => setVehicleReg(e.target.value)}
                placeholder="KA 01 AB 1234"
                className="mt-1 uppercase"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button onClick={save} disabled={updateM.isPending}>
          {updateM.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
