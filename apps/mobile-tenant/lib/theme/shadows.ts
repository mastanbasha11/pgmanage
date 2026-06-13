/**
 * Shadow tokens, mode-keyed.
 *
 * Dark-mode shadows are intentionally subtle (we lift cards with surface
 * lightness, not drop-shadow — pure-black shadows on dark surfaces look
 * like a black hole around each card).
 *
 * iOS uses shadow{Color,Offset,Opacity,Radius}; Android only respects
 * `elevation` and uses its own algorithm. Both are set so the surface
 * looks right on both platforms.
 */
import type { ViewStyle } from 'react-native';

import type { ColorScheme } from './colors';

export interface ShadowTokens {
  card: ViewStyle;
  cardElevated: ViewStyle;
  hero: ViewStyle;
  bottomSheet: ViewStyle;
}

const lightShadows: ShadowTokens = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardElevated: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  hero: {
    // Slightly tinted teal halo for the rent-due / referral hero cards.
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  bottomSheet: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
};

const darkShadows: ShadowTokens = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 1,
  },
  cardElevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 3,
  },
  hero: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 6,
  },
  bottomSheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
};

export function shadowsForScheme(scheme: ColorScheme): ShadowTokens {
  return scheme === 'dark' ? darkShadows : lightShadows;
}
