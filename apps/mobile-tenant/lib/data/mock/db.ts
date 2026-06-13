/**
 * Mock seed data for the Resident app.
 *
 * Modeled on a real Bangalore PG so the design feels grounded — names,
 * room numbers, menu items, and amounts are realistic. The dataset is
 * intentionally small (one tenant in one property) since this phase is
 * single-property. Add more residents to the directory + tickets list
 * as community/referral features land.
 *
 * All dates are RELATIVE to NOW so screenshots / demos always feel fresh
 * regardless of when someone runs them.
 */
import type {
  AppNotification,
  Event,
  LedgerEntry,
  MealServing,
  Notice,
  PartnerOffer,
  Payment,
  Profile,
  Referral,
  ReferralSummary,
  Resident,
  Ticket,
  Visitor,
} from '../types';

// ── Helpers to build dates ──────────────────────────────────────────────

const now = () => new Date();
const iso = (d: Date) => d.toISOString();
const addDays = (n: number) => {
  const d = now();
  d.setDate(d.getDate() + n);
  return d;
};
const atHour = (d: Date, h: number, m = 0) => {
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
};

// ── Identity ────────────────────────────────────────────────────────────

// Mutable on purpose: the resident-app KYC mutation rewrites parts of
// this in mock mode so the UI demos the round-trip without a backend.
export const mockProfile: Profile = {
  id: 'tenant-1',
  name: 'Aditya Sai Kumar',
  phone: '+919676751760',
  email: 'aditya@example.com',
  language: 'en',
  property: {
    id: 'prop-1',
    name: 'Sunrise Residency',
    addressLine: '12, 1st Cross, HSR Layout Sector 2',
    city: 'Bengaluru',
    managerName: 'Suresh Reddy',
    managerPhone: '+919876500001',
    emergencyPhone: '+919876500002',
  },
  room: {
    id: 'room-1',
    floor: 2,
    roomNumber: '204',
    bedLabel: 'B',
    sharing: 'twin',
  },
  lease: {
    startDate: iso(addDays(-90)),
    expectedEndDate: iso(addDays(275)),
    monthlyRentPaise: 1_200_000,
    depositPaise: 2_400_000,
    billingDay: 5,
  },
  walletBalancePaise: 150_000, // ₹1,500 from prior referrals
  emergency: null,        // intentionally blank so the demo enters onboarding
  vehicle: { type: 'NONE', registration: null },
  kycComplete: false,
};

// ── Dues / Ledger ───────────────────────────────────────────────────────

export const mockDuesLines = [
  {
    kind: 'rent' as const,
    label: 'Room rent',
    amountPaise: 1_200_000,
    explanation: 'Bed B · Twin sharing · ₹12,000 / month',
  },
  {
    kind: 'food' as const,
    label: 'Food charges',
    amountPaise: 350_000,
    explanation: 'Breakfast + Lunch + Dinner · 30 days',
    expandable: true,
    items: [
      { label: 'Breakfast (30 days)', amountPaise: 90_000 },
      { label: 'Lunch (30 days)', amountPaise: 150_000 },
      { label: 'Dinner (30 days)', amountPaise: 110_000 },
    ],
  },
  {
    kind: 'electricity' as const,
    label: 'Electricity',
    amountPaise: 24_000,
    explanation: '12 units × ₹20.00',
    expandable: true,
    items: [
      { label: 'Reading start (15 May)', amountPaise: 0 },
      { label: 'Reading end (14 Jun)', amountPaise: 0 },
      { label: '12 units × ₹20', amountPaise: 24_000 },
    ],
  },
  {
    kind: 'cleaning' as const,
    label: 'Room cleaning',
    amountPaise: 20_000,
    explanation: 'Weekly · 4 visits',
  },
  {
    kind: 'late_fee' as const,
    label: 'Late fee',
    amountPaise: 0,
    explanation: 'No late fees — paid on time previously',
  },
];

export const mockDues = {
  monthLabel: 'June 2026',
  totalPaise: mockDuesLines.reduce((s, l) => s + l.amountPaise, 0),
  dueDate: iso(addDays(5)),
  daysUntilDue: 5,
  status: 'due' as const,
  walletAppliedPaise: 0,
  lines: mockDuesLines,
};

const months = [
  { label: 'Jun 2026', m: 6, y: 2026, total: 1_594_000, paid: 0, status: 'due' as const, paidOn: null },
  { label: 'May 2026', m: 5, y: 2026, total: 1_594_000, paid: 1_594_000, status: 'paid' as const, paidOn: iso(addDays(-25)) },
  { label: 'Apr 2026', m: 4, y: 2026, total: 1_594_000, paid: 1_594_000, status: 'paid' as const, paidOn: iso(addDays(-55)) },
  { label: 'Mar 2026', m: 3, y: 2026, total: 1_594_000, paid: 1_594_000, status: 'paid' as const, paidOn: iso(addDays(-85)) },
];

export const mockLedger: LedgerEntry[] = months.map((m, i) => ({
  id: `ledger-${i}`,
  month: m.m,
  year: m.y,
  totalPaise: m.total,
  paidPaise: m.paid,
  status: m.status as LedgerEntry['status'],
  paidOn: m.paidOn,
  lines: mockDuesLines,
}));

export const mockPayments: Payment[] = [
  {
    id: 'pay-1',
    date: iso(addDays(-25)),
    amountPaise: 1_594_000,
    mode: 'upi',
    reference: 'UPI/623542/HDFC',
    forMonth: 5,
    forYear: 2026,
    receiptUrl: 'https://example.com/receipt/pay-1.pdf',
    status: 'success',
  },
  {
    id: 'pay-2',
    date: iso(addDays(-55)),
    amountPaise: 1_594_000,
    mode: 'upi',
    reference: 'UPI/619201/HDFC',
    forMonth: 4,
    forYear: 2026,
    receiptUrl: 'https://example.com/receipt/pay-2.pdf',
    status: 'success',
  },
  {
    id: 'pay-3',
    date: iso(addDays(-85)),
    amountPaise: 1_594_000,
    mode: 'bank',
    reference: 'NEFT/H8XGY1924',
    forMonth: 3,
    forYear: 2026,
    receiptUrl: 'https://example.com/receipt/pay-3.pdf',
    status: 'success',
  },
];

// ── Meals ───────────────────────────────────────────────────────────────

function meal(date: Date, slot: MealServing['slot'], items: MealServing['items'], optedIn = true, cutoff = 1): MealServing {
  const slotTimes = { breakfast: [7, 9], lunch: [12, 14], dinner: [19, 21] } as const;
  const [start, end] = slotTimes[slot];
  const cutoffAt = atHour(addDays(-cutoff), 22);
  return {
    date: iso(atHour(date, start)),
    slot,
    startsAt: iso(atHour(date, start)),
    endsAt: iso(atHour(date, end)),
    items,
    optedIn,
    cutoffAt: iso(cutoffAt),
  };
}

const dishes = {
  southBreakfast: [
    { name: 'Idli & Sambar', isVeg: true },
    { name: 'Coconut chutney', isVeg: true },
    { name: 'Filter coffee', isVeg: true },
  ],
  pohaBreakfast: [
    { name: 'Poha', isVeg: true },
    { name: 'Boiled eggs', isVeg: false },
    { name: 'Banana', isVeg: true },
  ],
  vegThali: [
    { name: 'Rice', isVeg: true },
    { name: 'Dal tadka', isVeg: true },
    { name: 'Aloo gobi', isVeg: true },
    { name: 'Curd', isVeg: true },
    { name: 'Chapati × 2', isVeg: true },
  ],
  chickenLunch: [
    { name: 'Chicken curry', isVeg: false },
    { name: 'Jeera rice', isVeg: true },
    { name: 'Chapati × 2', isVeg: true },
    { name: 'Salad', isVeg: true },
  ],
  paneerDinner: [
    { name: 'Paneer butter masala', isVeg: true },
    { name: 'Chapati × 3', isVeg: true },
    { name: 'Salad', isVeg: true },
    { name: 'Kheer', isVeg: true },
  ],
  fishDinner: [
    { name: 'Fish fry', isVeg: false },
    { name: 'Rice', isVeg: true },
    { name: 'Sambar', isVeg: true },
  ],
};

export const mockMealsThisWeek: MealServing[] = (() => {
  const list: MealServing[] = [];
  for (let i = -1; i <= 5; i++) {
    const d = addDays(i);
    const isVegDay = i % 2 === 0;
    list.push(meal(d, 'breakfast', i % 3 === 0 ? dishes.pohaBreakfast : dishes.southBreakfast));
    list.push(meal(d, 'lunch', isVegDay ? dishes.vegThali : dishes.chickenLunch));
    list.push(meal(d, 'dinner', isVegDay ? dishes.paneerDinner : dishes.fishDinner));
  }
  return list;
})();

// ── Tickets ─────────────────────────────────────────────────────────────

export const mockTickets: Ticket[] = [
  {
    id: 'tkt-1',
    category: 'wifi',
    title: 'Wi-Fi disconnects in the evening',
    description: 'Around 8–10pm the Wi-Fi keeps dropping for 5–10 min at a time.',
    status: 'in_progress',
    createdAt: iso(addDays(-2)),
    timeline: [
      { status: 'raised', at: iso(addDays(-2)), note: 'You raised this ticket' },
      { status: 'assigned', at: iso(addDays(-2)), note: 'Assigned to Suresh (Tech)' },
      { status: 'in_progress', at: iso(addDays(-1)), note: 'Router replacement ordered' },
    ],
  },
  {
    id: 'tkt-2',
    category: 'plumbing',
    title: 'Bathroom tap dripping',
    description: 'Cold-water tap in the en-suite drips continuously.',
    status: 'resolved',
    createdAt: iso(addDays(-10)),
    resolvedAt: iso(addDays(-8)),
    rating: 5,
    timeline: [
      { status: 'raised', at: iso(addDays(-10)) },
      { status: 'assigned', at: iso(addDays(-10)), note: 'Plumber will visit tomorrow 10am' },
      { status: 'in_progress', at: iso(addDays(-9)) },
      { status: 'resolved', at: iso(addDays(-8)), note: 'Washer replaced' },
    ],
  },
  {
    id: 'tkt-3',
    category: 'cleaning',
    title: 'Skipped weekly room cleaning',
    description: 'Saturday cleaning round missed our room.',
    status: 'raised',
    createdAt: iso(addDays(-1)),
    timeline: [{ status: 'raised', at: iso(addDays(-1)) }],
  },
];

// ── Visitors ────────────────────────────────────────────────────────────

export const mockVisitors: Visitor[] = [
  {
    id: 'visit-1',
    name: 'Riya Mehta',
    phone: '+919876512345',
    purpose: 'Friend visiting',
    expectedAt: iso(addDays(1)),
    passCode: '482910',
    status: 'pending',
  },
  {
    id: 'visit-2',
    name: 'Karan Patel',
    purpose: 'College senior',
    expectedAt: iso(addDays(-7)),
    passCode: '124903',
    status: 'left',
    arrivedAt: iso(addDays(-7)),
  },
];

// ── Notices ─────────────────────────────────────────────────────────────

export const mockNotices: Notice[] = [
  {
    id: 'notice-1',
    title: 'Water supply maintenance — Sunday 8am–12pm',
    body: 'BWSSB has scheduled a tank cleaning. We will switch to backup tanks; please use water sparingly during this window.',
    publishedAt: iso(addDays(-1)),
    pinned: true,
  },
  {
    id: 'notice-2',
    title: 'Diwali decoration drive — bring your own diyas',
    body: 'We are putting up rangoli + lights in the courtyard on Saturday evening. Snacks on the house!',
    publishedAt: iso(addDays(-5)),
  },
  {
    id: 'notice-3',
    title: 'New laundry vendor onboarded',
    body: 'WashBros has replaced the previous vendor. Pickup is now Mon/Thu mornings. Add bag tags at reception.',
    publishedAt: iso(addDays(-12)),
  },
];

// ── Referrals ───────────────────────────────────────────────────────────

export const mockReferralSummary: ReferralSummary = {
  code: 'ADITYA1760',
  shareUrl: 'https://pgmanage.in/r/ADITYA1760',
  bonusPerSignupPaise: 50_000,    // ₹500 when friend signs up
  bonusPerMoveInPaise: 200_000,   // ₹2,000 once they move in
  totalEarnedPaise: 250_000,
  pendingPaise: 50_000,
  creditedToWalletPaise: 200_000,
};

export const mockReferrals: Referral[] = [
  {
    id: 'ref-1',
    friendName: 'Vikram Rao',
    invitedAt: iso(addDays(-30)),
    stage: 'bonus_credited',
    totalBonusPaise: 250_000,
    stageHistory: [
      { stage: 'invited', at: iso(addDays(-30)) },
      { stage: 'signed_up', at: iso(addDays(-28)), bonusPaise: 50_000 },
      { stage: 'moved_in', at: iso(addDays(-22)) },
      { stage: 'bonus_credited', at: iso(addDays(-20)), bonusPaise: 200_000 },
    ],
  },
  {
    id: 'ref-2',
    friendName: 'Priya Sharma',
    invitedAt: iso(addDays(-12)),
    stage: 'signed_up',
    totalBonusPaise: 50_000,
    stageHistory: [
      { stage: 'invited', at: iso(addDays(-12)) },
      { stage: 'signed_up', at: iso(addDays(-9)), bonusPaise: 50_000 },
    ],
  },
  {
    id: 'ref-3',
    friendName: 'Rahul Iyer',
    invitedAt: iso(addDays(-4)),
    stage: 'invited',
    totalBonusPaise: 0,
    stageHistory: [{ stage: 'invited', at: iso(addDays(-4)) }],
  },
];

// ── Community ───────────────────────────────────────────────────────────

export const mockEvents: Event[] = [
  {
    id: 'event-1',
    title: 'Friday games night',
    description: 'Carrom, board games, snacks. Dress: chill.',
    startsAt: iso(atHour(addDays(2), 20)),
    location: 'Common lounge',
    scope: 'property',
    rsvpd: true,
    attendeeCount: 14,
  },
  {
    id: 'event-2',
    title: 'Bengaluru Marathon prep run',
    description: 'Sunday 6am, Cubbon Park. Group transport at 5:30am.',
    startsAt: iso(atHour(addDays(4), 6)),
    location: 'Lobby',
    scope: 'local',
    rsvpd: false,
    attendeeCount: 7,
  },
];

export const mockResidents: Resident[] = [
  { id: 'r-1', name: 'Vikram Rao', bio: 'Software engineer @ a fintech', interests: ['cricket', 'chess'] },
  { id: 'r-2', name: 'Priya Sharma', bio: 'Design student', interests: ['movies', 'sketching'] },
  { id: 'r-3', name: 'Karan Patel', interests: ['gym', 'gaming'] },
];

export const mockPartners: PartnerOffer[] = [
  {
    id: 'po-1',
    partnerName: 'Cult Fit',
    category: 'Fitness',
    title: '30% off the first month',
    description: 'PG residents only. Walk-in at any Cult Fit centre.',
  },
  {
    id: 'po-2',
    partnerName: 'Salon X',
    category: 'Grooming',
    title: 'Flat ₹200 off haircuts',
    description: 'Show the resident card at the counter.',
  },
  {
    id: 'po-3',
    partnerName: 'Rapido',
    category: 'Travel',
    title: '₹50 off your next 5 rides',
    description: 'Use code SUNRISE50 in the Rapido app.',
  },
];

// ── Notifications ───────────────────────────────────────────────────────

export const mockNotifications: AppNotification[] = [
  {
    id: 'notif-1',
    kind: 'rent_due',
    title: 'June rent is due in 5 days',
    message: '₹15,940 by 5 Jun. Tap to pay.',
    at: iso(addDays(-1)),
    read: false,
  },
  {
    id: 'notif-2',
    kind: 'referral_credit',
    title: 'Bonus credited!',
    message: '₹2,000 added to your wallet for Vikram moving in.',
    at: iso(addDays(-20)),
    read: false,
  },
  {
    id: 'notif-3',
    kind: 'ticket_update',
    title: 'Wi-Fi ticket update',
    message: 'Router replacement ordered. ETA 1 day.',
    at: iso(addDays(-1)),
    read: true,
  },
  {
    id: 'notif-4',
    kind: 'notice',
    title: 'Water supply notice posted',
    message: 'Maintenance window Sunday 8am–12pm.',
    at: iso(addDays(-1)),
    read: true,
  },
];
