/**
 * Theme module — single entry point.
 *
 * Two ways to consume:
 *
 *  1. `useTheme()` (preferred, theme-aware):
 *
 *        const { colors, space, shadows } = useTheme();
 *
 *  2. Static imports (light-only, kept so legacy screens written before the
 *     dark-mode work compile without churn):
 *
 *        import { colors, space, radius, shadow } from '@/lib/theme';
 *
 *     These resolve to the light-mode values. Any screen that needs to
 *     respect the dark preference should migrate to useTheme().
 */
import { lightColors } from './colors';
import { shadowsForScheme } from './shadows';

export {
  fontSize,
  fontWeight,
  lineHeight,
  motion,
  palette,
  radius,
  space,
  tabularNumStyle,
  TOUCH_TARGET,
  type FontSize,
  type Radius,
  type Space,
} from './tokens';

export {
  lightColors,
  darkColors,
  colorsForScheme,
  type ColorScheme,
  type ColorTokens,
} from './colors';

export { shadowsForScheme, type ShadowTokens } from './shadows';

export { ThemeProvider, useTheme, type Theme } from './context';
export {
  useThemeStore,
  type ThemePreference,
} from './store';

// ── Legacy aliases ────────────────────────────────────────────────────────
// Old code imports `colors`, `shadow`, and `type` from this module. Keep
// those working with light-mode values so we don't have to touch every
// screen the moment we land the theme system.
export const colors = {
  // Layer + text + border roles
  ...lightColors,
  // Legacy role aliases used by the old ui.tsx + screens
  primary: lightColors.text,
  bedVacant: lightColors.successFg,
  bedVacantBg: lightColors.successBg,
  bedReserved: lightColors.warningFg,
  bedReservedBg: lightColors.warningBg,
  bedOccupied: lightColors.accent,
  bedOccupiedBg: lightColors.accentSoft,
  bedMaintenance: lightColors.dangerFg,
  bedMaintenanceBg: lightColors.dangerBg,
  white: '#FFFFFF',
  black: '#000000',
  // Names from the original tokens that the legacy ui.tsx references
  success: lightColors.successFg,
  successBg: lightColors.successBg,
  warn: lightColors.warningFg,
  warnBg: lightColors.warningBg,
  danger: lightColors.dangerFg,
  dangerBg: lightColors.dangerBg,
  info: lightColors.infoFg,
  infoBg: lightColors.infoBg,
  // Some old code references accentDim for soft accents
  accentDim: lightColors.accentSoft,
};

export const shadow = shadowsForScheme('light');

// `type` was an alias for the font-size scale in the legacy module.
export { fontSize as type } from './tokens';
