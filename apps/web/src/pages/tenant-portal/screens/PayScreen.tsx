/**
 * Pay — itemised dues + payment history + My Stay.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, ChevronDown, ChevronUp, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import {
  useTenantDues,
  useTenantLedger,
  useTenantPayments,
  useTenantProfile,
} from '@/lib/tenant-data/hooks';
import type { DueLine, LedgerEntry, Payment } from '@/lib/tenant-data/types';

import { Money, PageHeader, SectionHeader, SkeletonLines, StatusPill } from './_shared';

export default function PayScreen() {
  const duesQ = useTenantDues();
  const paymentsQ = useTenantPayments();
  const ledgerQ = useTenantLedger();
  const profileQ = useTenantProfile();
  const { toast } = useToast();

  const [expandedKind, setExpandedKind] = useState<string | null>(null);

  const dues = duesQ.data;
  const payments = paymentsQ.data ?? [];
  const ledger = ledgerQ.data ?? [];
  const profile = profileQ.data;

  function quickPay() {
    if (
      !confirm(
        'UPI integration coming soon. Tap OK to simulate a successful payment for testing.',
      )
    ) {
      return;
    }
    toast({ title: 'Payment recorded' });
  }

  if (duesQ.isLoading || !dues) {
    return (
      <div>
        <PageHeader title="Pay" subtitle="Rent, breakdown, and history" />
        <SkeletonLines count={8} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Pay" subtitle="Rent, breakdown, and history" />

      {/* Hero card */}
      <Card className="mb-6 border-accent/30 bg-gradient-to-br from-accent/5 to-transparent shadow-md">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {dues.monthLabel}
            </p>
            <StatusPill
              label={
                dues.status === 'paid' ? 'Paid' : dues.daysUntilDue < 0 ? 'Overdue' : 'Due'
              }
              tone={
                dues.status === 'paid'
                  ? 'success'
                  : dues.daysUntilDue < 0
                    ? 'danger'
                    : 'warning'
              }
            />
          </div>
          <Money paise={dues.totalPaise} size="hero" className="mt-2 block" />
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Due {format(parseISO(dues.dueDate), 'd MMM yyyy')} ·{' '}
            {dues.daysUntilDue >= 0
              ? `${dues.daysUntilDue} days left`
              : `${Math.abs(dues.daysUntilDue)} days overdue`}
          </p>

          {profile && profile.walletBalancePaise > 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-violet-50 p-3 ring-1 ring-violet-200">
              <Wallet className="h-4 w-4 text-violet-700" />
              <p className="text-xs font-semibold text-violet-700">
                Wallet credit:{' '}
                <Money paise={profile.walletBalancePaise} size="sm" className="ml-1" />
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <Button onClick={quickPay}>Pay now</Button>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown */}
      <SectionHeader title="Breakdown" subtitle="Tap a line to see how it's computed" />
      <Card>
        <CardContent className="p-0">
          {dues.lines.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No charges this month.</p>
          ) : (
            dues.lines.map((l, i) => (
              <LineRow
                key={`${l.kind}-${i}`}
                line={l}
                expanded={expandedKind === l.kind}
                onToggle={() =>
                  setExpandedKind((cur) => (cur === l.kind ? null : l.kind))
                }
              />
            ))
          )}
          <div className="flex items-center justify-between border-t-2 p-4">
            <span className="font-bold">Total</span>
            <Money paise={dues.totalPaise} size="lg" />
          </div>
        </CardContent>
      </Card>

      {/* My Stay */}
      <SectionHeader title="My stay" />
      {profile ? (
        <Card>
          <CardContent className="grid gap-2 p-4 text-sm">
            <Row label="Property" value={profile.property.name} />
            <Row
              label="Room"
              value={`${profile.room.roomNumber} · Bed ${profile.room.bedLabel}`}
            />
            <Row
              label="Move-in"
              value={
                profile.lease.startDate
                  ? format(parseISO(profile.lease.startDate), 'd MMM yyyy')
                  : '—'
              }
            />
            {profile.lease.expectedEndDate ? (
              <Row
                label="Expected move-out"
                value={format(parseISO(profile.lease.expectedEndDate), 'd MMM yyyy')}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Payment history */}
      <SectionHeader title="Payment history" />
      <Card>
        <CardContent className="divide-y p-0">
          {paymentsQ.isLoading ? (
            <div className="p-4">
              <SkeletonLines count={3} />
            </div>
          ) : payments.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            payments.slice(0, 12).map((p) => <PaymentRow key={p.id} p={p} />)
          )}
        </CardContent>
      </Card>

      {/* Ledger (past months) */}
      <SectionHeader title="Past months" />
      <Card>
        <CardContent className="divide-y p-0">
          {ledgerQ.isLoading ? (
            <div className="p-4">
              <SkeletonLines count={3} />
            </div>
          ) : ledger.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No months on record yet.
            </p>
          ) : (
            ledger.map((e) => <LedgerRow key={e.id} entry={e} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LineRow({
  line,
  expanded,
  onToggle,
}: {
  line: DueLine;
  expanded: boolean;
  onToggle: () => void;
}) {
  const canExpand = !!(line.expandable && line.items && line.items.length > 0);
  return (
    <button
      type="button"
      onClick={canExpand ? onToggle : undefined}
      className="flex w-full items-start justify-between border-b px-4 py-3 text-left last:border-b-0"
      disabled={!canExpand}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{line.label}</span>
          {canExpand ? (
            expanded ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )
          ) : null}
        </div>
        {line.explanation ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{line.explanation}</p>
        ) : null}
        {expanded && line.items ? (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {line.items.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>· {item.label}</span>
                <Money paise={item.amountPaise} size="sm" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <Money paise={line.amountPaise} size="md" />
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function PaymentRow({ p }: { p: Payment }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        ✓
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-semibold">
          {p.mode.toUpperCase()} · {p.date ? format(parseISO(p.date), 'd MMM yyyy') : '—'}
        </p>
        <p className="truncate text-xs text-muted-foreground">{p.reference ?? 'Payment'}</p>
      </div>
      <Money paise={p.amountPaise} size="md" />
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const outstanding = entry.totalPaise - entry.paidPaise;
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          {monthName(entry.month)} {entry.year}
        </p>
        <p className="text-xs text-muted-foreground">
          {entry.status === 'paid' && entry.paidOn
            ? `Paid on ${format(parseISO(entry.paidOn), 'd MMM')}`
            : entry.status}
        </p>
      </div>
      {entry.status === 'paid' ? (
        <StatusPill label="Paid" tone="success" />
      ) : (
        <Money paise={outstanding} size="md" />
      )}
    </div>
  );
}

function monthName(m: number): string {
  return [
    'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
  ][m - 1] ?? '';
}
