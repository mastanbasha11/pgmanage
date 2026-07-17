/**
 * Redesign primitives — shared visual language from the UX mocks
 * (Claude UX/pgmanageredesign.html + dashboard.html).
 *
 *   Pill        status chip with dot   — Paid/Overdue/Ready/…
 *   Tag         room-type chip         — 2-Share / AC / Suite
 *   FilterChip  pressable filter pill  — dark fill when active
 *   KpiTile     stat card              — label / value / foot
 *   RankBar     ranked horizontal bar  — collectors, owners, spenders
 *   RoomBadge   room+bed stacked badge — green bordered
 *   NameAvatar  hashed-color initials avatar
 *   SectionCard title + sub + children card
 *
 * Every screen of the revamp builds from these so the look stays consistent.
 */
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ── Pill (status w/ dot) ─────────────────────────────────────────────────────

export type PillTone = 'g' | 'a' | 'r' | 's' | 'v' | 'b';

const PILL_TONES: Record<PillTone, string> = {
  g: 'bg-[#eafaf0] text-[#15803d] border-[#c8ecd5]',
  a: 'bg-[#fff6e2] text-[#b45309] border-[#f3d59b]',
  r: 'bg-[#fdecec] text-[#dc2626] border-[#f5caca]',
  s: 'bg-[#eef1f6] text-[#5c6472] border-[#e0e5ee]',
  v: 'bg-[#efeaff] text-[#5b3ec9] border-[#d8ccff]',
  b: 'bg-[#e8f1fd] text-[#1c5cab] border-[#c4dbf7]',
};

const PILL_DOTS: Record<PillTone, string> = {
  g: 'bg-[#22a559]',
  a: 'bg-[#e0912f]',
  r: 'bg-[#dc2626]',
  s: 'bg-[#9aa1ad]',
  v: 'bg-[#5b3ec9]',
  b: 'bg-[#2a78d6]',
};

export function Pill({
  tone = 's',
  children,
  dot = true,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
        PILL_TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', PILL_DOTS[tone])} />}
      {children}
    </span>
  );
}

// ── Tag (room type) ──────────────────────────────────────────────────────────

export function Tag({
  kind = 'share',
  children,
  className,
}: {
  kind?: 'share' | 'ac' | 'suite';
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    share: 'bg-[#fff6e2] text-[#92600b] border-[#f3d59b]',
    ac: 'bg-[#eef1f6] text-[#4b5566] border-[#e0e5ee]',
    suite: 'bg-[#efeaff] text-[#5b3ec9] border-[#d8ccff]',
  }[kind];
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-md border px-1.5 py-px text-[10.5px] font-bold',
        styles,
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── FilterChip ───────────────────────────────────────────────────────────────

export function FilterChip({
  active,
  onClick,
  children,
  count,
  warn,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number | string;
  warn?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
        active
          ? 'border-[#161b26] bg-[#161b26] text-white'
          : warn
            ? 'border-[#f3d59b] bg-[#fff6e2] text-[#b45309] hover:bg-[#fdefd0]'
            : 'border-border bg-card text-[#42495a] hover:bg-secondary',
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn('text-[10.5px] font-extrabold', active ? 'opacity-70' : 'opacity-50')}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── KpiTile ──────────────────────────────────────────────────────────────────

export function KpiTile({
  label,
  value,
  foot,
  delta,
  deltaTone,
  className,
  valueClassName,
  labelHint,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
  delta?: ReactNode;
  deltaTone?: 'up' | 'down' | 'warn';
  className?: string;
  valueClassName?: string;
  labelHint?: string;
  children?: ReactNode;
}) {
  const deltaStyles = {
    up: 'text-[#15803d] bg-[#eafaf0]',
    down: 'text-[#dc2626] bg-[#fdecec]',
    warn: 'text-[#b45309] bg-[#fff6e2]',
  };
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4 shadow-sm', className)}>
      <div
        className="flex items-center justify-between gap-1.5 text-xs font-bold text-muted-foreground"
        title={labelHint}
      >
        {label}
      </div>
      <div className={cn('tnum mt-1.5 text-[21px] font-extrabold tracking-tight', valueClassName)}>
        {value}
      </div>
      {(foot || delta) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#98a0ad]">
          {delta && deltaTone && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10.5px] font-extrabold',
                deltaStyles[deltaTone],
              )}
            >
              {delta}
            </span>
          )}
          {foot}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Progress track ───────────────────────────────────────────────────────────

export function Track({
  pct,
  color = 'hsl(var(--accent))',
  className,
}: {
  pct: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-md bg-[#eef1f6]', className)}>
      <div
        className="h-full rounded-md transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  );
}

// ── RankBar list ─────────────────────────────────────────────────────────────

export interface RankRow {
  label: string;
  sub?: string;
  value: number;
  display: string;
  color: string;
}

export function RankBars({
  rows,
  className,
  labelWidth = 120,
}: {
  rows: RankRow[];
  className?: string;
  /** px width of the name column — widen when subs are long (e.g. "83 payments · adv ₹1,08,000"). */
  labelWidth?: number;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: `${labelWidth}px 1fr auto` }}
        >
          <span className="min-w-0 text-[13px] font-bold leading-tight">
            <span className="block truncate">{r.label}</span>
            {r.sub && (
              <span className="block truncate whitespace-nowrap text-[11px] font-semibold text-[#98a0ad]">
                {r.sub}
              </span>
            )}
          </span>
          <Track pct={Math.max(4, (r.value / max) * 100)} color={r.color} className="h-[9px]" />
          <span className="tnum text-[13px] font-extrabold tracking-tight">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

// ── RoomBadge ────────────────────────────────────────────────────────────────

export function RoomBadge({
  room,
  bed,
  className,
}: {
  room: string;
  bed?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[40px] flex-col items-center justify-center rounded-lg border border-[#c8ecd5] bg-[#eafaf0] px-1.5 py-1 leading-none',
        className,
      )}
    >
      <b className="text-[13px] text-[#146c37]">{room}</b>
      {bed && <span className="mt-0.5 text-[9px] font-extrabold text-[#3f9d63]">·{bed}</span>}
    </span>
  );
}

// ── NameAvatar ───────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#0ea5a3', '#f59e0b', '#ec4899',
  '#14b8a6', '#6366f1', '#e11d48', '#0891b2', '#7c3aed',
];

export function nameColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function NameAvatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/[ .]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full font-extrabold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.37,
        background: nameColor(name),
      }}
    >
      {initials || '?'}
    </span>
  );
}

// ── SectionCard ──────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  sub,
  right,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  /** flush = table card with no inner padding */
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card shadow-sm',
        flush ? 'overflow-hidden' : 'p-4',
        className,
      )}
    >
      {(title || right) && (
        <div className={cn('flex items-start justify-between gap-2', flush && 'px-4 pt-4')}>
          <div>
            {title && (
              <p className="flex items-center gap-2 text-[13px] font-extrabold">{title}</p>
            )}
            {sub && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      <div className={cn((title || right) && !flush && 'mt-3')}>{children}</div>
    </div>
  );
}

// ── Page header ──────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  sub,
  actions,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3.5', className)}>
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-[12.5px] text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
