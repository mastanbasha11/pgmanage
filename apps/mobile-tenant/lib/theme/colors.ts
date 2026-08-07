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

// "Forest & Sage" — palette lifted verbatim from the resident-app mockup
// (apps/website/mockups/resident-app.html :root). Forest #1C443A on sage
// #F4F7F5; muted green #3F7763 reserved for money/positive; apricot #C4743F
// for "needs attention" only. Every value here is a mockup token.
export const lightColors: ColorTokens = {
  bg: '#F4F7F5',                          // sage — app background
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#ECF1EE',                // sage2 — card tint / icon tiles
  overlay: 'rgba(30, 43, 38, 0.55)',      // ink @ 55%

  text: '#1E2B26',                        // ink
  textMuted: '#5A6A63',                   // mut
  textDim: '#6B7A74',                     // mut2
  textInverse: '#F2F6F3',                 // ondark

  border: '#DFE7E2',                      // sageline
  borderStrong: '#CBD8D1',

  accent: '#1C443A',                      // forest — primary action / chrome
  accentSoft: '#ECF1EE',                  // sage2 tint behind icons
  accentBorder: '#DFE7E2',
  accentHover: '#2A5A4D',                 // forest2
  onAccent: '#F2F6F3',                    // ondark

  successFg: '#3F7763',                   // muted green — money & positive only
  successBg: '#ECF1EE',
  successBorder: '#DFE7E2',

  warningFg: '#9C5A2B',                   // apricot-ink — readable on warm tint
  warningBg: '#FAF0E7',                   // apricot-t
  warningBorder: '#F0DCCB',               // apricot-l

  dangerFg: palette.red[600],
  dangerBg: palette.red[50],
  dangerBorder: palette.red[100],

  infoFg: '#3F7763',
  infoBg: '#ECF1EE',
  infoBorder: '#DFE7E2',

  celebrationFg: '#C4743F',               // apricot — referral warmth
  celebrationBg: '#FAF0E7',
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
  accentSoft: 'rgba(107, 161, 137, 0.12)', // brand-400 (forest) @ 12%
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
