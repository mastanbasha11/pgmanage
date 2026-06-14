/**
 * Refer & earn — empty-state placeholder while the backend stub
 * returns blank code/zero earnings. Real pipeline once it lands.
 */
import { format, parseISO } from 'date-fns';
import { Award, Gift, Hourglass, Share2, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import {
  useTenantReferrals,
  useTenantReferralSummary,
} from '@/lib/tenant-data/hooks';
import type { ReferralStage } from '@/lib/tenant-data/types';

import { EmptyState, Money, PageHeader, SectionHeader, SkeletonLines, StatusPill, type PillTone } from './_shared';

const STAGE_LABEL: Record<ReferralStage, string> = {
  invited: 'Invited',
  signed_up: 'Signed up',
  moved_in: 'Moved in',
  bonus_credited: 'Bonus credited',
};

const STAGE_ORDER: ReferralStage[] = ['invited', 'signed_up', 'moved_in', 'bonus_credited'];

const STAGE_TONE: Record<ReferralStage, PillTone> = {
  invited: 'info',
  signed_up: 'info',
  moved_in: 'success',
  bonus_credited: 'celebration',
};

export default function ReferralScreen() {
  const summaryQ = useTenantReferralSummary();
  const refsQ = useTenantReferrals();
  const { toast } = useToast();

  const summary = summaryQ.data;
  const refs = refsQ.data ?? [];

  async function share() {
    if (!summary?.shareUrl) return;
    const text = `Use my code ${summary.code} to sign up at our PG: ${summary.shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url: summary.shareUrl });
        toast({ title: 'Shared' });
      } catch {
        // user cancelled — fine
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied to clipboard' });
    }
  }

  if (summaryQ.isLoading) {
    return (
      <div>
        <PageHeader title="Refer & earn" />
        <SkeletonLines count={6} />
      </div>
    );
  }

  if (!summary || !summary.code) {
    return (
      <div>
        <PageHeader title="Refer & earn" />
        <EmptyState
          icon={<Gift className="h-6 w-6" />}
          title="Coming soon"
          message="We're putting together a referral programme. Your code and earnings will appear here as soon as it goes live."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Refer & earn" />

      <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-transparent">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white">
              <Gift className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
                Refer & earn
              </p>
              <p className="text-2xl font-extrabold">
                Up to{' '}
                <Money
                  paise={summary.bonusPerSignupPaise + summary.bonusPerMoveInPaise}
                  size="lg"
                  className="text-violet-700"
                />
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm">
            Help a friend become a resident, and we'll add{' '}
            <Money paise={summary.bonusPerSignupPaise} size="sm" /> when they sign up
            plus <Money paise={summary.bonusPerMoveInPaise} size="sm" /> when they move in.
          </p>
          <div className="mt-4 rounded-lg bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Your code
            </p>
            <p className="text-2xl font-extrabold tracking-widest">{summary.code}</p>
          </div>
          <div className="mt-3">
            <Button onClick={share} className="gap-2 bg-violet-600 hover:bg-violet-700">
              <Share2 className="h-4 w-4" />
              Share code
            </Button>
          </div>
        </CardContent>
      </Card>

      <SectionHeader title="Your earnings" />
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Earned" paise={summary.totalEarnedPaise} icon={Award} tint="text-violet-700" />
        <KpiTile label="In wallet" paise={summary.creditedToWalletPaise} icon={Wallet} tint="text-emerald-700" />
        <KpiTile label="Pending" paise={summary.pendingPaise} icon={Hourglass} tint="text-amber-700" />
      </div>

      <SectionHeader
        title="Your referrals"
        subtitle={`${refs.length} ${refs.length === 1 ? 'friend' : 'friends'}`}
      />
      {refs.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-center text-sm text-muted-foreground">
            No referrals yet. Share your code to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {refs.map((r) => {
            const currentIdx = STAGE_ORDER.indexOf(r.stage);
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold">{r.friendName}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited {format(parseISO(r.invitedAt), 'd MMM')}
                      </p>
                    </div>
                    <Money paise={r.totalBonusPaise} size="md" />
                  </div>
                  <ol className="space-y-3">
                    {STAGE_ORDER.map((stage, i) => {
                      const reached = i <= currentIdx;
                      const event = r.stageHistory.find((e) => e.stage === stage);
                      return (
                        <li key={stage} className="flex gap-3">
                          <span
                            className={`mt-1 h-3 w-3 flex-none rounded-full ${
                              reached ? 'bg-violet-600' : 'bg-border'
                            }`}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p
                                className={`text-sm font-semibold ${
                                  reached ? 'text-foreground' : 'text-muted-foreground'
                                }`}
                              >
                                {STAGE_LABEL[stage]}
                              </p>
                              {event?.bonusPaise ? (
                                <StatusPill
                                  label={`+₹${Math.round(event.bonusPaise / 100)}`}
                                  tone={STAGE_TONE[stage]}
                                />
                              ) : null}
                            </div>
                            {event ? (
                              <p className="text-[11px] text-muted-foreground">
                                {format(parseISO(event.at), 'd MMM yyyy')}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiTile({
  label,
  paise,
  icon: Icon,
  tint,
}: {
  label: string;
  paise: number;
  icon: React.ElementType;
  tint: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <Icon className={`h-4 w-4 ${tint}`} />
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <Money paise={paise} size="lg" className={`mt-1 block ${tint}`} />
    </div>
  );
}
