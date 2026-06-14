/**
 * Shared bits used across portal screens.
 *
 *   StatusPill     — single source of truth for the 7 status tones.
 *   PageHeader     — H1 + subtitle for every screen, consistent margins.
 *   Money          — paise → ₹ via the existing formatPaise helper.
 *   EmptyState     — friendly "nothing yet" placeholder.
 *   SectionHeader  — section title + optional trailing action.
 */
import { type ReactNode } from 'react';
import { cn, formatPaise } from '@/lib/utils';

export type PillTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'celebration'
  | 'neutral';

const TONE_CLASS: Record<PillTone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  accent: 'bg-accent/10 text-accent ring-accent/20',
  celebration: 'bg-violet-50 text-violet-700 ring-violet-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export function StatusPill({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
        TONE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 mt-6 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Money({
  paise,
  size = 'md',
  className,
}: {
  paise: number;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}) {
  const sizeClass = {
    sm: 'text-sm font-semibold',
    md: 'text-base font-semibold',
    lg: 'text-2xl font-bold',
    hero: 'text-4xl font-extrabold tracking-tight tabular-nums',
  }[size];
  return <span className={cn('tabular-nums', sizeClass, className)}>{formatPaise(paise)}</span>;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-10 text-center">
      {icon ? (
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold">{title}</p>
      {message ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SkeletonRow({ height = 14 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded bg-muted"
      style={{ height, width: '100%' }}
    />
  );
}

export function SkeletonLines({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} height={i === count - 1 ? 10 : 14} />
      ))}
    </div>
  );
}
