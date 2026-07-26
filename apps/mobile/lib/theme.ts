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
  // brand — "Forest & Sage" palette, shared with the resident app and mirrored
  // from the design-token sheet (looptokens). Forest is the ONLY chrome colour:
  // buttons, active tab, dark anchor cards, icon glyphs. Sage is the app
  // background and never a card — cards are white so sage reads as the space
  // between things. Saturated colour is reserved for money and for decisions.
  primary: '#1C443A', // forest — dark buttons, anchor cards, active tab, glyphs
  primarySoft: '#2A5A4D', // forest2 — pressed / gradient partner
  accent: '#1C443A', // forest is the single chrome/action colour
  accentSoft: '#143229', // forest-d — deepest pressed
  accentDim: '#9CC6B6', // light forest tint on dark surfaces
  accentBg: '#ECF1EE', // forest-bg / sage2 tint

  // Forest & Sage aliases (used by structural refinements + charts)
  forest: '#1C443A',
  forest2: '#2A5A4D',
  forestDark: '#143229',
  forestBg: '#ECF1EE',
  ondark: '#F2F6F3', // text on forest surfaces — softer than pure white
  sage: '#F4F7F5',
  sage2: '#ECF1EE',
  ink: '#1E2B26',
  // money that is settled or returning: receipts, refundable deposits, credits
  money: '#3F7763',
  // apricot marks attention-not-yet-a-problem: due dates, unpaid month, visits
  apricot: '#C4743F',
  apricotBg: '#FAF0E7',
  apricotLine: '#F0DCCB',
  apricotInk: '#9C5A2B', // text on a warm surface — never plain apricot

  // surfaces
  bg: '#F4F7F5', // sage — app background, never a card
  surface: '#FFFFFF',
  surfaceMuted: '#ECF1EE', // sage2 — chips, tracks, icon tiles, avatar fill
  surfaceMuted2: '#E8EDEA',
  border: '#DFE7E2', // sageline — card + control borders
  borderSoft: '#E8EDEA', // line — hairline between list rows
  borderStrong: '#CFDDD6',
  overlay: 'rgba(10, 15, 26, 0.42)', // sheet backdrop

  // text — three levels, no more
  text: '#1E2B26', // ink — headings, amounts, primary labels
  textMuted: '#5A6A63', // mut — secondary text, captions
  textDim: '#6B7A74', // mut2 — timestamps, hints, inactive tabs

  // operational status — owner/staff app. Each hue pulled to low chroma so a
  // screen full of statuses still reads calm. (Resident app uses only apricot.)
  success: '#2E7D5B', // ok — paid, collected, resolved, on track
  successBg: '#E9F3EE',
  successLine: '#CFE3D8',
  warn: '#9C5A2B', // partial, pending approval, due today
  warnBg: '#FAF0E7',
  warnLine: '#F0DCCB',
  danger: '#B5483C', // alert — overdue, failed, blocked (owner app only)
  dangerBg: '#FBEEEA',
  dangerLine: '#EED8D2',
  info: '#4A6E86', // on notice, scheduled, informational
  infoBg: '#EAF0F4',
  infoLine: '#D5E1E8',
  purple: '#6A5F8C', // note — advance booking, capex flag, secondary category
  purpleBg: '#EFEDF5',
  purpleLine: '#DAD5E8',
  pink: '#B0708A',
  pinkBg: '#F6EEF2',
  neutralBg: '#ECF1EE',
  neutralLine: '#DFE7E2',
  neutralFg: '#5D6B65',

  // bed colours, retuned to the Forest & Sage status family
  bedVacant: '#2E7D5B',
  bedVacantBg: '#E9F3EE',
  bedReserved: '#9C5A2B',
  bedReservedBg: '#FAF0E7',
  bedOccupied: '#3F7763',
  bedOccupiedBg: '#ECF1EE',
  bedMaintenance: '#B5483C',
  bedMaintenanceBg: '#FBEEEA',

  white: '#FFFFFF',
  black: '#000000',
};

/**
 * Categorical palette for donuts / category bars — retuned to sit in the
 * Forest & Sage family (mirrors the avatar/donut hues in the mock) so a screen
 * full of categories still reads calm. Same order = same colour on both apps.
 */
export const chartColors = [
  '#4A6E86', '#2E7D5B', '#C4743F', '#6A5F8C',
  '#3F7763', '#B0708A', '#9C5A2B', '#4A574F',
  '#8279A6', '#B5483C',
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
  tile: 11, // icon tiles / small chips (mock --r-tile)
  md: 12,
  btn: 13, // buttons (mock --r-btn 14, softened for RN)
  lg: 16, // cards (mock --r-card)
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

/**
 * Elevation. In Forest & Sage, borders do the separating, not shadows — a
 * single hairline is the only elevation, apart from one whisper-soft shadow so
 * white cards still lift off the sage background on cheaper screens.
 */
export const shadow = {
  card: {
    shadowColor: '#1C443A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
};
