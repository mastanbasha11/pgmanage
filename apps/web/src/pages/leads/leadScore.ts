/**
 * Lead prioritisation for the scalable worklist.
 *
 * At 300+ leads growing ~40/week you don't browse a board — the handful that
 * need action must rise to the top. These pure helpers compute a 0-100 score,
 * the follow-up state, the priority sort, and the saved-view predicates. Pure +
 * unit-tested so the ranking can't silently drift.
 */

export interface ScorableLead {
  status: string;
  source: string;
  next_followup_at?: string | null;
  last_contacted_at?: string | null;
  created_at: string;
  interested_room_type?: string | null;
  budget_max_paise?: number | null;
}

/** Statuses still in play (not Converted/Lost). */
const OPEN = new Set(['NEW', 'CONTACTED', 'SITE_VISITED', 'NEGOTIATING', 'BOOKED']);
export function isOpen(l: { status: string }): boolean {
  return OPEN.has(l.status);
}

const DAY = 86_400_000;

/** Local-midnight day index, so "overdue/today" respect the calendar day. */
function dayIndex(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY);
}

export type FollowupState = 'overdue' | 'today' | 'future' | 'none';

export function followupState(
  l: { next_followup_at?: string | null },
  now: Date = new Date(),
): { state: FollowupState; overdueDays: number } {
  if (!l.next_followup_at) return { state: 'none', overdueDays: 0 };
  const due = new Date(l.next_followup_at);
  if (Number.isNaN(due.getTime())) return { state: 'none', overdueDays: 0 };
  const diff = dayIndex(now) - dayIndex(due);
  if (diff > 0) return { state: 'overdue', overdueDays: diff };
  if (diff === 0) return { state: 'today', overdueDays: 0 };
  return { state: 'future', overdueDays: 0 };
}

/** Days since we last touched the lead (falls back to when it was created). */
export function daysSinceTouch(l: ScorableLead, now: Date = new Date()): number {
  const last = new Date(l.last_contacted_at ?? l.created_at);
  if (Number.isNaN(last.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / DAY));
}

/**
 * 0-100 heuristic. Higher = warmer / more worth a rep's time. Combines how far
 * down the funnel the lead is, how fresh the contact is, whether an action is
 * due, and a small nudge for warmer sources and known budget/room intent.
 */
export function leadScore(l: ScorableLead, now: Date = new Date()): number {
  if (!isOpen(l)) return 0;

  // Funnel depth — further along = hotter.
  const stage =
    { NEW: 30, CONTACTED: 45, SITE_VISITED: 80, NEGOTIATING: 85, BOOKED: 92 }[l.status] ?? 30;

  // Freshness — decays over ~30 days of silence.
  const idle = daysSinceTouch(l, now);
  const freshness = Math.max(0, 20 - (idle / 30) * 20);

  // Action-due urgency.
  const { state, overdueDays } = followupState(l, now);
  const urgency =
    state === 'overdue' ? Math.min(15, 6 + overdueDays) : state === 'today' ? 12 : 0;

  // Source warmth + intent completeness.
  const source = l.source === 'WEBSITE' || l.source === 'INSTAGRAM' || l.source === 'META_AD' ? 6 : 2;
  const intent = (l.interested_room_type ? 4 : 0) + ((l.budget_max_paise ?? 0) > 0 ? 3 : 0);

  const raw = stage * 0.5 + freshness + urgency + source + intent;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Priority sort for the default worklist order: overdue (most overdue first) →
 * due today → higher score → soonest upcoming follow-up → newest.
 */
export function comparePriority(a: ScorableLead, b: ScorableLead, now: Date = new Date()): number {
  const rank = (s: FollowupState) => (s === 'overdue' ? 0 : s === 'today' ? 1 : 2);
  const fa = followupState(a, now);
  const fb = followupState(b, now);
  if (rank(fa.state) !== rank(fb.state)) return rank(fa.state) - rank(fb.state);
  if (fa.state === 'overdue' && fb.state === 'overdue') {
    if (fa.overdueDays !== fb.overdueDays) return fb.overdueDays - fa.overdueDays;
  }
  const sa = leadScore(a, now);
  const sb = leadScore(b, now);
  if (sa !== sb) return sb - sa;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

// ── Saved views ──────────────────────────────────────────────────────────────

export type SavedView =
  | 'TO_ACTION'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'HOT'
  | 'NO_FOLLOWUP'
  | 'IDLE_30D'
  | 'ALL';

export const HOT_THRESHOLD = 75;
const IDLE_DAYS = 30;

export function matchesView(view: SavedView, l: ScorableLead, now: Date = new Date()): boolean {
  const { state } = followupState(l, now);
  switch (view) {
    case 'ALL':
      return true;
    case 'TO_ACTION':
      return isOpen(l) && (state === 'overdue' || state === 'today' || !l.next_followup_at);
    case 'OVERDUE':
      return isOpen(l) && state === 'overdue';
    case 'DUE_TODAY':
      return state === 'today';
    case 'HOT':
      return isOpen(l) && leadScore(l, now) >= HOT_THRESHOLD;
    case 'NO_FOLLOWUP':
      return isOpen(l) && !l.next_followup_at;
    case 'IDLE_30D':
      return isOpen(l) && daysSinceTouch(l, now) > IDLE_DAYS;
    default:
      return true;
  }
}
