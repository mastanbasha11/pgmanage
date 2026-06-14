import { useState } from 'react';
import { AlertTriangle, HeartPulse, Moon, Phone, Shield, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import { useTenantProfile } from '@/lib/tenant-data/hooks';

import { PageHeader, SectionHeader, StatusPill } from './_shared';

export default function SafetyScreen() {
  const profileQ = useTenantProfile();
  const { toast } = useToast();
  const [checkedIn, setCheckedIn] = useState(false);
  const [stayingOut, setStayingOut] = useState(false);

  const p = profileQ.data;

  function call(num?: string) {
    if (num) window.location.href = `tel:${num}`;
  }

  function sos() {
    const num = p?.property.emergencyPhone ?? '112';
    if (confirm(`Emergency call — dial ${num}?`)) call(num);
  }

  return (
    <div>
      <PageHeader title="Safety" subtitle="Peace of mind for you and your family." />

      <button
        type="button"
        onClick={sos}
        className="mb-6 flex w-full flex-col items-center justify-center gap-2 rounded-2xl bg-rose-600 p-6 text-white hover:bg-rose-700"
      >
        <AlertTriangle className="h-8 w-8" />
        <span className="text-2xl font-extrabold tracking-widest">SOS</span>
        <span className="text-xs text-rose-200">Tap to call emergency number</span>
      </button>

      <SectionHeader title="Check-in" />
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <HeartPulse className="h-6 w-6 text-emerald-600" />
          <div className="flex-1">
            <p className="font-bold">{checkedIn ? "You're checked in today" : 'Daily check-in'}</p>
            <p className="text-xs text-muted-foreground">
              Lets the team know you're safe each day.
            </p>
          </div>
          {checkedIn ? (
            <StatusPill label="Done" tone="success" />
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setCheckedIn(true);
                toast({ title: 'Checked in' });
              }}
            >
              Check in
            </Button>
          )}
        </CardContent>
      </Card>

      <SectionHeader title="Out tonight?" />
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Moon className="h-6 w-6 text-accent" />
          <div className="flex-1">
            <p className="font-bold">Staying out tonight</p>
            <p className="text-xs text-muted-foreground">
              Skips tonight's headcount + lets reception know.
            </p>
          </div>
          <Button
            size="sm"
            variant={stayingOut ? 'default' : 'outline'}
            onClick={() => {
              setStayingOut((s) => !s);
              toast({
                title: stayingOut ? "We'll expect you tonight" : 'Got it — staying out',
              });
            }}
          >
            {stayingOut ? 'On' : 'Off'}
          </Button>
        </CardContent>
      </Card>

      <SectionHeader title="Emergency contacts" />
      <Card>
        <CardContent className="divide-y p-0">
          <ContactRow
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Property manager"
            value={p?.property.managerName ?? '—'}
            phone={p?.property.managerPhone}
            onCall={call}
          />
          <ContactRow
            icon={<Shield className="h-4 w-4" />}
            label="Property emergency"
            value="Reception (24/7)"
            phone={p?.property.emergencyPhone}
            onCall={call}
          />
          <ContactRow
            icon={<HeartPulse className="h-4 w-4" />}
            label="Your emergency contact"
            value={p?.emergency?.name ?? 'Not set'}
            phone={p?.emergency?.phone}
            onCall={call}
          />
          <ContactRow
            icon={<Phone className="h-4 w-4" />}
            label="Police"
            value="Emergency services"
            phone="100"
            onCall={call}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  phone,
  onCall,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  phone?: string;
  onCall: (n?: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{value}</p>
      </div>
      {phone ? (
        <Button size="sm" onClick={() => onCall(phone)} className="gap-1.5">
          <Phone className="h-3.5 w-3.5" />
          Call
        </Button>
      ) : null}
    </div>
  );
}
