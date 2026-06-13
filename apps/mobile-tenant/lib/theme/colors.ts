/**
 * Mode-keyed colour tokens.
 *
 * Naming convention groups by *role*, not hue, so a screen never references
 * a specific colour (`colors.teal600`). Roles:
 *
 *   - bg / surface / surfaceElevated / surfaceMuted  ← layers
 *   - text / textMuted / textDim / textInverse       ← text contrast tiers
 *   - border / borderStrong                          ← dividers + outlines
 *   - accent / accentSoft / accentBorder / onAccent  ← primary action
 *   - {success|warning|danger|info}{Fg|Bg|Border}    ← semantic + status pills
 *
 * Light vs dark are NOT derived from each other algorithmically — eye-balling
 * pure inversion looks awful in dark mode. Both palettes are hand-picked.
 */
import { palette } from './tokens';

export type ColorScheme = 'light' | 'dark';

export interface ColorTokens {
  // ── Layers ────────────────────────────────────────────────────────────
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  overlay: string; // semi-transparent backdrop for modals / bottom sheets

  // ── Text ──────────────────────────────────────────────────────────────
  text: string;
  textMuted: string;
  textDim: string;
  textInverse: string; // for text on top of accent fills

  // ── Borders ───────────────────────────────────────────────────────────
  border: string;
  borderStrong: string;

  // ── Accent (primary action) ───────────────────────────────────────────
  accent: string;
  accentSoft: string;       // tinted background, e.g. for icons
  accentBorder: string;
  accentHover: string;
  onAccent: string;         // text/icon colour on top of accent fills

  // ── Semantic ──────────────────────────────────────────────────────────
  successFg: string;
  successBg: string;
  successBorder: string;

  warningFg: string;
  warningBg: string;
  warningBorder: string;

  dangerFg: string;
  dangerBg: string;
  dangerBorder: string;

  infoFg: string;
  infoBg: string;
  infoBorder: string;

  // ── Celebration / referral accent ─────────────────────────────────────
  celebrationFg: string;
  celebrationBg: string;
}

export const lightColors: ColorTokens = {
  bg: palette.slate[50],                  // off-white so white cards feel elevated
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceMuted: palette.slate[100],
  overlay: 'rgba(15, 23, 42, 0.55)',      // slate-900 @ 55%

  text: palette.slate[900],
  textMuted: palette.slate[600],
  textDim: palette.slate[400],
  textInverse: palette.white,

  border: palette.slate[200],
  borderStrong: palette.slate[300],

  accent: palette.brand[600],
  accentSoft: palette.brand[50],
  accentBorder: palette.brand[200],
  accentHover: palette.brand[700],
  onAccent: palette.white,

  successFg: palette.green[600],
  successBg: palette.green[50],
  successBorder: palette.green[100],

  warningFg: palette.amber[600],
  warningBg: palette.amber[50],
  warningBorder: palette.amber[100],

  dangerFg: palette.red[600],
  dangerBg: palette.red[50],
  dangerBorder: palette.red[100],

  infoFg: palette.blue[600],
  infoBg: palette.blue[50],
  infoBorder: palette.blue[100],

  celebrationFg: palette.violet[600],
  celebrationBg: palette.violet[50],
};

export const darkColors: ColorTokens = {
  bg: palette.slate[950],
  surface: palette.slate[900],
  surfaceElevated: palette.slate[800],
  surfaceMuted: palette.slate[800],
  overlay: 'rgba(0, 0, 0, 0.65)',

  text: palette.slate[50],
  textMuted: palette.slate[400],
  textDim: palette.slate[500],
  textInverse: palette.slate[900],

  border: palette.slate[800],
  borderStrong: palette.slate[700],

  // Brighter teal reads better on dark surfaces.
  accent: palette.brand[400],
  accentSoft: 'rgba(45, 212, 191, 0.12)', // brand-400 @ 12%
  accentBorder: palette.brand[700],
  accentHover: palette.brand[300],
  onAccent: palette.slate[950],

  successFg: '#4ADE80',
  successBg: 'rgba(74, 222, 128, 0.12)',
  successBorder: 'rgba(74, 222, 128, 0.24)',

  warningFg: '#FBBF24',
  warningBg: 'rgba(251, 191, 36, 0.12)',
  warningBorder: 'rgba(251, 191, 36, 0.24)',

  dangerFg: '#F87171',
  dangerBg: 'rgba(248, 113, 113, 0.12)',
  dangerBorder: 'rgba(248, 113, 113, 0.24)',

  infoFg: '#60A5FA',
  infoBg: 'rgba(96, 165, 250, 0.12)',
  infoBorder: 'rgba(96, 165, 250, 0.24)',

  celebrationFg: '#A78BFA',
  celebrationBg: 'rgba(167, 139, 250, 0.14)',
};

export function colorsForScheme(scheme: ColorScheme): ColorTokens {
  return scheme === 'dark' ? darkColors : lightColors;
}
