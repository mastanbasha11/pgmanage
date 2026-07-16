import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert paise (integer) to formatted rupee string. ₹7,000.00 */
export function formatPaise(paise: number, compact = false): string {
  const rupees = paise / 100;
  if (compact && rupees >= 100_000) {
    return `₹${(rupees / 100_000).toFixed(1)}L`;
  }
  if (compact && rupees >= 1_000) {
    return `₹${(rupees / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
}

/** ₹7,000 → 700000 paise */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatDate(dateStr: string, fmt = 'dd MMM yyyy'): string {
  try {
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

export function formatDatetime(dateStr: string): string {
  return formatDate(dateStr, 'dd MMM yyyy, h:mm a');
}

export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('en-IN', { month: 'long' });
}

export function currentMonthYear(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function occupancyColor(rate: number): string {
  if (rate >= 90) return 'text-green-600';
  if (rate >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

export function statusBadgeVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    PAID: 'default',
    PARTIAL: 'secondary',
    OVERDUE: 'destructive',
    PENDING: 'outline',
    ACTIVE: 'default',
    INACTIVE: 'secondary',
    OCCUPIED: 'default',
    VACANT: 'outline',
    MAINTENANCE: 'destructive',
    APPROVED: 'default',
    REJECTED: 'destructive',
    NEW: 'outline',
    FOLLOW_UP: 'secondary',
    CONVERTED: 'default',
    LOST: 'destructive',
  };
  return map[status] ?? 'outline';
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function truncate(str: string, len = 30): string {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

/**
 * Human-readable room-type label for pills / dropdowns / cards. Prefers
 * legible labels ("2-Share", "Suite") over ultra-compressed codes so a rep
 * scanning the vacancies board doesn't need a decoder key.
 *
 *  "Single AC"        → "1-Share AC"
 *  "Double Sharing"   → "2-Share"
 *  "Double AC"        → "2-Share AC"
 *  "Triple Sharing"   → "3-Share"
 *  "Suite"            → "Suite"
 *  "Three" (freeform) → "3-Share"
 *
 * Unknown/free-form names are returned verbatim (title-cased on first
 * letter only) so an owner's custom name like "Deluxe" doesn't get mangled.
 */
export function shortRoomType(label: string | undefined | null): string {
  if (!label) return '';
  const s = label.toUpperCase();
  const hasAC = s.includes('AC');
  const suffix = hasAC ? ' AC' : '';
  if (/^SINGLE/.test(s) || /^\b1\b/.test(s) || /^ONE/.test(s)) return `1-Share${suffix}`;
  if (/^DOUBLE/.test(s) || /^\b2\b/.test(s) || /^TWO/.test(s)) return `2-Share${suffix}`;
  if (/^TRIPLE/.test(s) || /^\b3\b/.test(s) || /^THREE/.test(s)) return `3-Share${suffix}`;
  if (/^QUAD/.test(s) || /^\b4\b/.test(s) || /^FOUR/.test(s)) return `4-Share${suffix}`;
  if (/^SUITE/.test(s) || s === 'SUI') return 'Suite';
  if (/^DORM/.test(s)) return 'Dormitory';
  // Unknown owner-defined name: keep as typed (first letter cap).
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Phone validation: accepts an Indian mobile in any common form —
 * 10 digits starting 6-9, with optional +91, 91, or 0 prefix and optional spaces/dashes.
 * Returns the canonical +91XXXXXXXXXX form, or null if invalid.
 */
export function normaliseIndianPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '');
  // Strip leading 91 / 0 to get to the bare 10-digit mobile
  let core = digits;
  if (core.startsWith('91') && core.length === 12) core = core.slice(2);
  else if (core.startsWith('0') && core.length === 11) core = core.slice(1);
  if (/^[6-9]\d{9}$/.test(core)) return `+91${core}`;
  return null;
}

/** Zod-friendly: turns user input into canonical +91… or throws message. */
export const PHONE_HELP = '10-digit Indian mobile (e.g. 9876543210, +91 9876543210)';


/**
 * Build a click-to-chat WhatsApp deep link (wa.me). `phone` may be in any
 * format; non-digits are stripped. Optional `text` pre-fills the message.
 * Needs no WhatsApp API or template approval — opens the user's WhatsApp.
 */
export function whatsappLink(phone: string, text?: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
