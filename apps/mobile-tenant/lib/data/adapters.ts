/**
 * Wire-shape adapters.
 *
 * The backend returns flat snake_case (idiomatic Python / API style); the
 * resident app's domain types are nested camelCase (idiomatic TS). These
 * adapters bridge the gap so screens consume one consistent shape and
 * the API contract stays separate from the UI contract.
 *
 * Every screen reads through one of these. If the backend shape changes
 * we patch one file, not every screen.
 */
import type {
  AppNotification,
  DueLine,
  DueLineKind,
  DuesSummary,
  Event,
  LedgerEntry,
  LedgerStatus,
  MealServing,
  Notice,
  PartnerOffer,
  Payment,
  PaymentMode,
  Profile,
  Referral,
  ReferralStage,
  ReferralSummary,
  Resident,
  Ticket,
  TicketCategory,
  TicketStatus,
  VehicleType,
  Visitor,
  VisitorStatus,
} from './types';

// ── Profile (/tenant/me) ────────────────────────────────────────────────────

export interface ApiProfile {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  occupation?: string | null;
  employer_name?: string | null;
  hometown?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
  vehicle_type?: VehicleType | null;
  vehicle_registration?: string | null;
  move_in_date?: string | null;
  expected_move_out_date?: string | null;
  bed_label?: string | null;
  room_number?: string | null;
  room_name?: string | null;
  floor_name?: string | null;
  property_name?: string | null;
  address_line1?: string | null;
  kyc_complete: boolean;
}

export function adaptProfile(api: ApiProfile): Profile {
  const hasEmergency = Boolean(
    (api.emergency_contact_name ?? '').trim() &&
      (api.emergency_contact_phone ?? '').trim(),
  );
  return {
    id: api.id,
    name: api.name,
    phone: api.phone,
    email: api.email ?? null,
    language: 'en',
    property: {
      id: '',
      name: api.property_name ?? '',
      addressLine: api.address_line1 ?? '',
      city: '',
      // These three aren't on /me yet — Phase 11 follow-up will add them.
      managerName: '',
      managerPhone: '',
      emergencyPhone: '',
    },
    room: {
      id: '',
      floor: 0,
      roomNumber: api.room_number ?? '',
      bedLabel: api.bed_label ?? '',
      sharing: 'twin',
    },
    lease: {
      startDate: api.move_in_date ?? '',
      expectedEndDate: api.expected_move_out_date ?? null,
      // /me doesn't currently include rent / deposit. They land on
      // /me/dues/current — the Pay tab pulls from there. Profile screen
      // shows them via the dues breakdown.
      monthlyRentPaise: 0,
      depositPaise: 0,
      billingDay: 1,
    },
    walletBalancePaise: 0,
    emergency: hasEmergency
      ? {
          name: api.emergency_contact_name ?? '',
          phone: api.emergency_contact_phone ?? '',
          relation: api.emergency_contact_relation ?? '',
        }
      : null,
    vehicle: {
      type: api.vehicle_type ?? 'NONE',
      registration: api.vehicle_registration ?? null,
    },
    kycComplete: api.kyc_complete,
  };
}

// ── Dues (/tenant/me/dues/current) ──────────────────────────────────────────

export interface ApiDueLine {
  kind: string;
  label: string;
  amount_paise: number;
  explanation?: string | null;
  expandable?: boolean;
  items?: { label: string; amount_paise: number }[];
}
export interface ApiDuesSummary {
  month_label: string;
  total_paise: number;
  due_date: string;
  days_until_due: number;
  status: string;
  lines: ApiDueLine[];
  wallet_applied_paise: number;
}

export function adaptDueLine(api: ApiDueLine): DueLine {
  return {
    kind: (api.kind as DueLineKind) ?? 'other',
    label: api.label,
    amountPaise: api.amount_paise,
    explanation: api.explanation ?? undefined,
    expandable: api.expandable,
    items: api.items?.map((i) => ({
      label: i.label,
      amountPaise: i.amount_paise,
    })),
  };
}

export function adaptDues(api: ApiDuesSummary): DuesSummary {
  const status = (api.status as DuesSummary['status']) ?? 'due';
  return {
    monthLabel: api.month_label,
    totalPaise: api.total_paise,
    dueDate: api.due_date,
    daysUntilDue: api.days_until_due,
    status,
    lines: api.lines.map(adaptDueLine),
    walletAppliedPaise: api.wallet_applied_paise,
  };
}

// ── Ledger (/tenant/ledger) ─────────────────────────────────────────────────

export interface ApiLedgerEntry {
  id: string;
  month: number;
  year: number;
  amount_due_paise: number;
  amount_paid_paise: number;
  outstanding_paise?: number;
  status: string;
  due_date?: string | null;
  paid_on?: string | null;
}

export function adaptLedgerEntry(api: ApiLedgerEntry): LedgerEntry {
  const s = (api.status ?? '').toLowerCase();
  let status: LedgerStatus;
  if (s === 'paid' || s === 'partial' || s === 'overdue') status = s;
  else status = 'due';
  return {
    id: api.id,
    month: api.month,
    year: api.year,
    totalPaise: api.amount_due_paise,
    paidPaise: api.amount_paid_paise,
    status,
    paidOn: api.paid_on ?? null,
  };
}

// ── Payments (/tenant/me/payments) ──────────────────────────────────────────

export interface ApiPayment {
  id: string;
  date: string | null;
  amount_paise: number;
  mode: string;
  payment_type?: string;
  reference?: string | null;
  for_month?: number | null;
  for_year?: number | null;
  status: string;
}

export function adaptPayment(api: ApiPayment): Payment {
  const mode: PaymentMode = (() => {
    const m = (api.mode || '').toLowerCase();
    if (m === 'upi' || m === 'cash' || m === 'bank' || m === 'wallet') return m;
    if (m === 'bank_transfer') return 'bank';
    return 'cash';
  })();
  const status =
    api.status === 'success' || api.status === 'failed' || api.status === 'pending'
      ? api.status
      : 'success';
  return {
    id: api.id,
    date: api.date ?? '',
    amountPaise: api.amount_paise,
    mode,
    reference: api.reference ?? undefined,
    forMonth: api.for_month ?? undefined,
    forYear: api.for_year ?? undefined,
    status,
  };
}

// ── Tickets / complaints (/tenant/complaints) ──────────────────────────────

export interface ApiComplaint {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  resolved_at?: string | null;
  photo_s3_key?: string | null;
}

const COMPLAINT_CAT_MAP: Record<string, TicketCategory> = {
  MAINTENANCE: 'other',
  CLEANLINESS: 'cleaning',
  NOISE: 'other',
  FOOD: 'other',
  SECURITY: 'other',
  OTHER: 'other',
};

const COMPLAINT_STATUS_MAP: Record<string, TicketStatus> = {
  OPEN: 'raised',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'resolved',
};

export function adaptComplaintAsTicket(api: ApiComplaint): Ticket {
  const status = COMPLAINT_STATUS_MAP[api.status] ?? 'raised';
  const title = api.description.split('\n')[0]!.slice(0, 80) || 'Issue';
  const timeline: { status: TicketStatus; at: string }[] = [
    { status: 'raised' as TicketStatus, at: api.created_at },
  ];
  if (api.resolved_at) {
    timeline.push({ status: 'resolved', at: api.resolved_at });
  }
  return {
    id: api.id,
    category: COMPLAINT_CAT_MAP[api.category] ?? 'other',
    title,
    description: api.description,
    status,
    createdAt: api.created_at,
    resolvedAt: api.resolved_at ?? null,
    timeline,
    photoUrls: api.photo_s3_key ? [api.photo_s3_key] : undefined,
  };
}

// ── Notices (/tenant/announcements) ────────────────────────────────────────

export interface ApiNotice {
  id: string;
  title: string;
  body: string;
  created_at: string;
  pinned?: boolean;
}

export function adaptNotice(api: ApiNotice): Notice {
  return {
    id: api.id,
    title: api.title,
    body: api.body,
    publishedAt: api.created_at,
    pinned: api.pinned,
  };
}
