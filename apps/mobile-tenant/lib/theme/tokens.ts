/**
 * Mode-agnostic design tokens — spacing, radius, type, motion, palette.
 *
 * "Mode-agnostic" means these values don't change between light and dark
 * themes. Things that DO change (foreground/background colours, shadows)
 * live in `colors.ts` and `shadows.ts` and are keyed by mode.
 *
 * Scale rationale:
 *   - Spacing: 4pt micro + 8pt rhythm. Stops at 64 because anything bigger
 *     should be expressed as `space.xxl * n` at call site so it's obvious.
 *   - Radius: matches the visual language ("16-20px cards" per design brief).
 *   - Type: lifted from a fintech-style scale; jumps are deliberately big at
 *     the top (hero money numbers should dominate).
 *   - Motion: three speeds. Don't add more — choice paralysis ruins motion design.
 */

export const palette = {
  // Brand forest ramp — "Forest & Sage", matched to the owner app + marketing
  // site (owner accent = #1C443A). Anchored so brand[600] IS that forest.
  brand: {
    50: '#EEF4F1',
    100: '#D5E5DD',
    200: '#AEC9BC',
    300: '#93BBA9',
    400: '#6BA189', // dark-mode accent — kept light enough to read on dark
    500: '#3E7361',
    600: '#1C443A', // primary action in light mode (matches owner accent)
    700: '#143229', // pressed / hover (owner "deep")
    800: '#0F2820',
    900: '#0A1C16',
  },
  // Neutral / slate ramp.
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#0A0F1A', // custom deeper-than-900 for the dark-mode background
  },
  // Semantic colours. Each has a strong fg + a tinted bg.
  green: { 50: '#F0FDF4', 100: '#DCFCE7', 600: '#16A34A', 700: '#15803D' },
  amber: { 50: '#FFFBEB', 100: '#FEF3C7', 500: '#F59E0B', 600: '#D97706' },
  red:   { 50: '#FEF2F2', 100: '#FEE2E2', 600: '#DC2626', 700: '#B91C1C' },
  blue:  { 50: '#EFF6FF', 100: '#DBEAFE', 600: '#2563EB', 700: '#1D4ED8' },
  // Aux for celebration / referrals.
  violet:{ 50: '#F5F3FF', 100: '#EDE9FE', 600: '#7C3AED', 700: '#6D28D9' },
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const space = {
  /** 4pt micro-spacing for tight clusters (icon-text gaps, pill internals). */
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,    // standard card radius
  xl: 20,    // hero card radius
  '2xl': 24,
  pill: 999,
} as const;

export const fontSize = {
  caption: 11,
  small: 13,
  body: 15,
  bodyLg: 17,
  h3: 19,
  h2: 22,
  h1: 28,
  display: 36,
  hero: 48, // reserved for the rent-due "hero" number on Home
} as const;

export const lineHeight = {
  caption: 14,
  small: 18,
  body: 22,
  bodyLg: 24,
  h3: 26,
  h2: 30,
  h1: 34,
  display: 42,
  hero: 56,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

/**
 * fontVariant for monetary + date displays. Tabular numerals keep digits
 * a fixed width so an animating balance doesn't jitter horizontally. RN
 * passes this through to the platform layer (UIFont on iOS, Paint on
 * Android API 26+). The factory pattern returns a fresh mutable array
 * each call because RN's TextStyle types reject `readonly` arrays.
 */
export const tabularNumStyle: { fontVariant: ('tabular-nums')[] } = {
  fontVariant: ['tabular-nums'],
};

export const motion = {
  // Times tuned so animations feel snappy on Android mid-range hardware.
  fast: 150,
  normal: 250,
  slow: 400,
  // react-native-reanimated easings live in code (not exportable as a value
  // without importing reanimated here), so consumers import { Easing } from
  // 'react-native-reanimated' directly.
} as const;

/** Minimum hit-target size — applied to every Button / IconButton / Pressable row. */
export const TOUCH_TARGET = 48;

export type Space = keyof typeof space;
export type Radius = keyof typeof radius;
export type FontSize = keyof typeof fontSize;
