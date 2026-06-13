/**
 * Domain types for the Resident app.
 *
 * Money is always integer paise (matches backend convention). Dates are
 * ISO-8601 strings (parse with date-fns when needed).
 *
 * SCOPE NOTE: This v1 is single-property. `propertyId` / `orgId` fields
 * are intentionally OMITTED from most shapes — there's only one, the
 * server knows it from the JWT, and threading it through the UI just
 * adds noise. When multi-property lands, add a `propertyId` to the
 * relevant entity and a property switcher above the bottom tabs; the
 * data hooks here become per-property queries.
 */

// ── Identity ─────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  language: 'en' | 'hi' | 'te';
  property: PropertySummary;
  room: RoomSummary;
  lease: LeaseSummary;
  walletBalancePaise: number;
}

export interface PropertySummary {
  id: string;
  name: string;
  addressLine: string;
  city: string;
  managerName: string;
  managerPhone: string;
  emergencyPhone: string;
}

export interface RoomSummary {
  id: string;
  floor: number;
  roomNumber: string;
  bedLabel: string;
  sharing: 'single' | 'twin' | 'triple' | 'quad';
}

export interface LeaseSummary {
  startDate: string;       // ISO date
  expectedEndDate?: string | null;
  monthlyRentPaise: number;
  depositPaise: number;
  billingDay: number;      // 1-28
}

// ── Money ────────────────────────────────────────────────────────────────

export type DueLineKind =
  | 'rent'
  | 'food'
  | 'electricity'
  | 'utilities'
  | 'cleaning'
  | 'late_fee'
  | 'adjustment'
  | 'other';

export interface DueLine {
  kind: DueLineKind;
  label: string;
  amountPaise: number;
  /** Optional human explanation expanded inline ("12 units × ₹20"). */
  explanation?: string;
  /** True if this can be expanded to show line-items. */
  expandable?: boolean;
  /** Itemised sub-rows when expandable. */
  items?: { label: string; amountPaise: number }[];
}

export interface DuesSummary {
  monthLabel: string;         // e.g. "June 2026"
  totalPaise: number;
  dueDate: string;            // ISO date
  daysUntilDue: number;       // negative if overdue
  status: 'paid' | 'due' | 'overdue' | 'partial';
  lines: DueLine[];
  walletAppliedPaise: number; // wallet credit applied to this month's bill
}

export type LedgerStatus = 'paid' | 'partial' | 'due' | 'overdue';

export interface LedgerEntry {
  id: string;
  month: number;      // 1-12
  year: number;
  totalPaise: number;
  paidPaise: number;
  status: LedgerStatus;
  paidOn?: string | null;
  lines?: DueLine[];  // present when expanded
}

export type PaymentMode = 'upi' | 'cash' | 'bank' | 'wallet';

export interface Payment {
  id: string;
  date: string;
  amountPaise: number;
  mode: PaymentMode;
  reference?: string;
  forMonth?: number;
  forYear?: number;
  receiptUrl?: string | null;
  status: 'success' | 'failed' | 'pending';
}

// ── Food ─────────────────────────────────────────────────────────────────

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface MealItem {
  name: string;
  imageUrl?: string | null;
  isVeg: boolean;
}

export interface MealServing {
  date: string;
  slot: MealSlot;
  startsAt: string;          // ISO datetime of slot start
  endsAt: string;
  items: MealItem[];
  /** True if the user opted in for this slot. */
  optedIn: boolean;
  /** Cutoff for opt-in/out. */
  cutoffAt: string;
  /** 1-5 if the user has rated this serving. */
  yourRating?: number;
}

// ── Tickets ──────────────────────────────────────────────────────────────

export type TicketCategory =
  | 'housekeeping'
  | 'laundry'
  | 'electrical'
  | 'plumbing'
  | 'wifi'
  | 'cleaning'
  | 'other';

export type TicketStatus = 'raised' | 'assigned' | 'in_progress' | 'resolved' | 'reopened';

export interface TicketTimelineEvent {
  status: TicketStatus;
  at: string;
  note?: string;
}

export interface Ticket {
  id: string;
  category: TicketCategory;
  title: string;
  description: string;
  status: TicketStatus;
  createdAt: string;
  resolvedAt?: string | null;
  rating?: number | null;
  timeline: TicketTimelineEvent[];
  photoUrls?: string[];
}

// ── Visitors ─────────────────────────────────────────────────────────────

export type VisitorStatus = 'pending' | 'arrived' | 'left' | 'expired' | 'denied';

export interface Visitor {
  id: string;
  name: string;
  phone?: string;
  purpose?: string;
  expectedAt: string;
  passCode: string;
  status: VisitorStatus;
  arrivedAt?: string | null;
}

// ── Notices ──────────────────────────────────────────────────────────────

export interface Notice {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  pinned?: boolean;
}

// ── Referrals ────────────────────────────────────────────────────────────

export type ReferralStage = 'invited' | 'signed_up' | 'moved_in' | 'bonus_credited';

export interface Referral {
  id: string;
  friendName: string;
  invitedAt: string;
  stage: ReferralStage;
  stageHistory: { stage: ReferralStage; at: string; bonusPaise?: number }[];
  totalBonusPaise: number;
}

export interface ReferralSummary {
  code: string;
  shareUrl: string;
  bonusPerSignupPaise: number;
  bonusPerMoveInPaise: number;
  totalEarnedPaise: number;
  pendingPaise: number;
  creditedToWalletPaise: number;
}

// ── Community ────────────────────────────────────────────────────────────

export interface Event {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  location: string;
  scope: 'national' | 'local' | 'property';
  rsvpd: boolean;
  attendeeCount: number;
}

export interface Resident {
  id: string;
  name: string;
  bio?: string;
  interests: string[];
}

export interface PartnerOffer {
  id: string;
  partnerName: string;
  category: string;
  title: string;
  description: string;
  imageUrl?: string | null;
}

// ── Notifications ────────────────────────────────────────────────────────

export type NotificationKind =
  | 'rent_due'
  | 'rent_paid'
  | 'ticket_update'
  | 'referral_credit'
  | 'event'
  | 'notice'
  | 'visitor'
  | 'food';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  at: string;
  read: boolean;
  /** Where tapping the row should take the user. */
  deepLink?: string;
}
