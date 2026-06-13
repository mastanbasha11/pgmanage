/**
 * ThemeProvider + useTheme hook.
 *
 * Resolves the user's `preference` ('system'|'light'|'dark') into a
 * concrete colour scheme by reading the OS appearance (when 'system'),
 * then constructs a single `Theme` object that every themed primitive
 * pulls from via `useTheme()`.
 *
 * Why an object (vs. e.g. a tailwind-style class string): RN doesn't ship
 * a runtime stylesheet, so primitives need plain colour strings. Passing
 * the whole theme down via context keeps the call-site ergonomic:
 *
 *   const { colors, space, shadows } = useTheme();
 *
 * Performance note: useColorScheme() is a hook that subscribes to OS
 * changes. When the user toggles dark mode at the OS level (and the app
 * is in 'system' mode), this re-renders the whole tree once. Themed
 * primitives memoise their StyleSheet by mode to keep that cheap.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { colorsForScheme, type ColorScheme, type ColorTokens } from './colors';
import { shadowsForScheme, type ShadowTokens } from './shadows';
import {
  fontSize,
  fontWeight,
  lineHeight,
  motion,
  palette,
  radius,
  space,
  tabularNumStyle,
  TOUCH_TARGET,
} from './tokens';
import { useThemeStore } from './store';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  shadows: ShadowTokens;
  space: typeof space;
  radius: typeof radius;
  fontSize: typeof fontSize;
  lineHeight: typeof lineHeight;
  fontWeight: typeof fontWeight;
  motion: typeof motion;
  palette: typeof palette;
  tabularNumStyle: typeof tabularNumStyle;
  TOUCH_TARGET: typeof TOUCH_TARGET;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemeStore((s) => s.preference);
  const hydrate = useThemeStore((s) => s._hydrate);
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const scheme: ColorScheme = useMemo(() => {
    if (preference === 'light' || preference === 'dark') return preference;
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [preference, systemScheme]);

  const theme: Theme = useMemo(
    () => ({
      scheme,
      colors: colorsForScheme(scheme),
      shadows: shadowsForScheme(scheme),
      space,
      radius,
      fontSize,
      lineHeight,
      fontWeight,
      motion,
      palette,
      tabularNumStyle,
      TOUCH_TARGET,
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) {
    // Tests / Storybook-style isolated renders work without the provider —
    // fall back to the light theme rather than throwing. Real app trees
    // always wrap with ThemeProvider in app/_layout.tsx.
    return {
      scheme: 'light',
      colors: colorsForScheme('light'),
      shadows: shadowsForScheme('light'),
      space,
      radius,
      fontSize,
      lineHeight,
      fontWeight,
      motion,
      palette,
      tabularNumStyle,
      TOUCH_TARGET,
    };
  }
  return t;
}
