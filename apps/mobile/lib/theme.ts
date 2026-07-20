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
  // brand — kept in lockstep with the web redesign tokens in
  // apps/web/src/index.css so the two apps can't drift apart.
  primary: '#161b26', // near-black, used for dark chips/buttons
  primarySoft: '#42495a',
  accent: '#0e9384', // teal
  accentSoft: '#0b7a6e', // pressed
  accentDim: '#7fe3cf',
  accentBg: '#e6f6f3',

  // surfaces
  bg: '#f5f7fb', // app background
  surface: '#FFFFFF',
  surfaceMuted: '#eef1f6', // slate wash — chips, tracks
  surfaceMuted2: '#e3e8f0',
  border: '#e3e8f0',
  borderSoft: '#eef1f6', // hairline dividers inside cards
  borderStrong: '#d5dbe6',
  overlay: 'rgba(10, 15, 26, 0.42)', // sheet backdrop

  // text
  text: '#141a26',
  textMuted: '#6b7280',
  textDim: '#98a0ad',

  // semantic — each has a fill + a matching border so pills read crisply
  success: '#15803d',
  successBg: '#eafaf0',
  successLine: '#c8ecd5',
  warn: '#b45309',
  warnBg: '#fff6e2',
  warnLine: '#f3d59b',
  danger: '#dc2626',
  dangerBg: '#fdecec',
  dangerLine: '#f5caca',
  info: '#2a78d6',
  infoBg: '#e8f1fd',
  infoLine: '#c4dbf7',
  purple: '#5b3ec9',
  purpleBg: '#efeaff',
  purpleLine: '#d8ccff',
  pink: '#e87ba4',
  pinkBg: '#fdeef4',
  neutralBg: '#eef1f6',
  neutralLine: '#e0e5ee',
  neutralFg: '#5c6472',

  // bed colours per product spec: green / amber / teal / red
  bedVacant: '#15803d',
  bedVacantBg: '#eafaf0',
  bedReserved: '#b45309',
  bedReservedBg: '#fff6e2',
  bedOccupied: '#0e9384',
  bedOccupiedBg: '#e6f6f3',
  bedMaintenance: '#dc2626',
  bedMaintenanceBg: '#fdecec',

  white: '#FFFFFF',
  black: '#000000',
};

/**
 * Categorical palette for donuts / category bars. Mirrors the web's
 * EXPENSE_COLORS so the same category is the same colour on both apps.
 */
export const chartColors = [
  '#2a78d6', '#008300', '#e87ba4', '#eda100',
  '#1baf7a', '#98a0ad', '#8b5cf6', '#eb6834',
  '#0891b2', '#e11d48',
];

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
