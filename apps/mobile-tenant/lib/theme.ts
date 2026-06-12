/**
 * Design tokens for the staff app. Single source of truth — every screen
 * imports from here so brand drift / one-off colours don't happen.
 *
 * Design principles encoded in these tokens:
 *   - One-handed operation: tap targets ≥ 48dp (Android Material baseline).
 *   - Large fonts for semi-literate / first-time users: body 16, h1 26.
 *   - Brand palette matches the web app: slate-900 primary, teal-600 accent.
 *   - High-contrast in Simple Mode: stick to pure white surfaces, near-black
 *     text, and the strong teal action color so the screen is readable in
 *     bright sunlight (common usage outside a PG reception).
 */

export const colors = {
  // brand
  primary: '#0F172A', // slate-900
  accent: '#0D9488', // teal-600
  accentDim: '#5EEAD4', // teal-300

  // surfaces
  bg: '#F8FAFC', // slate-50
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9', // slate-100
  border: '#E2E8F0', // slate-200

  // text
  text: '#0F172A',
  textMuted: '#475569', // slate-600
  textDim: '#94A3B8', // slate-400

  // semantic
  success: '#16A34A', // green-600
  successBg: '#DCFCE7', // green-100
  warn: '#D97706', // amber-600
  warnBg: '#FEF3C7', // amber-100
  danger: '#DC2626', // red-600
  dangerBg: '#FEE2E2', // red-100
  info: '#2563EB', // blue-600
  infoBg: '#DBEAFE', // blue-100

  // bed colours per product spec: green / yellow / red
  bedVacant: '#16A34A',
  bedVacantBg: '#DCFCE7',
  bedReserved: '#D97706',
  bedReservedBg: '#FEF3C7',
  bedOccupied: '#0D9488',
  bedOccupiedBg: '#CCFBF1',
  bedMaintenance: '#DC2626',
  bedMaintenanceBg: '#FEE2E2',

  white: '#FFFFFF',
  black: '#000000',
};

export const space = {
  /** 4dp grid; matches the web app's tailwind scale. */
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const type = {
  // Sizes tuned for 16dp baseline so the app stays readable on cheap 5-inch
  // phones common at PGs. Bump everything by ~15% in Simple Mode (see lib/i18n.ts).
  caption: 12,
  small: 13,
  body: 15,
  bodyLg: 17,
  h3: 18,
  h2: 22,
  h1: 26,
};

/** Minimum hit-target size — applied to every Button / IconButton. */
export const TOUCH_TARGET = 48;

/** Soft shadow used on raised cards. Centralised so dark-mode work later is easy. */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
};
