import { Link } from 'react-router-dom';
import { MessageCircle, MessageSquare, Phone, Wrench } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { useTenantProfile } from '@/lib/tenant-data/hooks';

import { PageHeader, SectionHeader } from './_shared';

const FAQS = [
  {
    q: 'When is my rent due?',
    a: 'On your billing day each month. See the Pay tab for the exact date.',
  },
  {
    q: 'How do I raise a complaint?',
    a: 'Services tab → pick a category → describe the issue. You can track status live.',
  },
  {
    q: 'What if I move out early?',
    a: 'Give notice at least 30 days before to keep your refundable advance. Less than 30 days and the advance is forfeit per PG policy.',
  },
  {
    q: 'How do referrals work?',
    a: 'Share your code from Refer & Earn. ₹500 when they sign up, ₹2,000 when they move in — straight to your wallet.',
  },
];

export default function SupportScreen() {
  const profileQ = useTenantProfile();
  const p = profileQ.data;

  return (
    <div>
      <PageHeader title="Need help?" subtitle="We're one tap away." />

      <div className="grid grid-cols-2 gap-3">
        <Tile
          href={`tel:${p?.property.managerPhone ?? ''}`}
          label="Call manager"
          sublabel={p?.property.managerName ?? '—'}
          icon={Phone}
          tint="text-emerald-700 bg-emerald-50"
        />
        <Tile
          href={`https://wa.me/${(p?.property.managerPhone ?? '').replace(/[^\d]/g, '')}`}
          label="WhatsApp"
          sublabel="Quick reply"
          icon={MessageSquare}
          tint="text-emerald-600 bg-emerald-50"
        />
        <Link
          to="/portal/services"
          className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <TileBody icon={Wrench} label="Raise ticket" sublabel="Get help, tracked" tint="text-accent bg-accent/10" />
        </Link>
        <Link
          to="/portal/feedback"
          className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <TileBody
            icon={MessageCircle}
            label="Feedback"
            sublabel="Tell us anything"
            tint="text-violet-700 bg-violet-50"
          />
        </Link>
      </div>

      <SectionHeader title="FAQ" />
      <Card>
        <CardContent className="divide-y p-0">
          {FAQS.map((f) => (
            <div key={f.q} className="p-4">
              <p className="font-bold">{f.q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  href,
  label,
  sublabel,
  icon,
  tint,
}: {
  href: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  tint: string;
}) {
  return (
    <a
      href={href}
      className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <TileBody icon={icon} label={label} sublabel={sublabel} tint={tint} />
    </a>
  );
}

function TileBody({
  icon: Icon,
  label,
  sublabel,
  tint,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  tint: string;
}) {
  return (
    <>
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full ${tint}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-bold">{label}</p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
    </>
  );
}
