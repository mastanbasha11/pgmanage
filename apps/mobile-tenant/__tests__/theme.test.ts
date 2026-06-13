/**
 * Theme tokens contract test.
 *
 * Catches the class of bug where someone accidentally drops a role from
 * the dark colour set (or renames one) — every screen that reads it
 * would crash at runtime; here it fails at test time.
 */
import {
  darkColors,
  lightColors,
  colorsForScheme,
  shadowsForScheme,
  type ColorTokens,
} from '../lib/theme';

// All keys that every screen relies on. If you remove one here, every
// themed primitive needs to adapt — that's the whole point of the test.
const REQUIRED_KEYS: (keyof ColorTokens)[] = [
  'bg', 'surface', 'surfaceElevated', 'surfaceMuted', 'overlay',
  'text', 'textMuted', 'textDim', 'textInverse',
  'border', 'borderStrong',
  'accent', 'accentSoft', 'accentBorder', 'accentHover', 'onAccent',
  'successFg', 'successBg', 'successBorder',
  'warningFg', 'warningBg', 'warningBorder',
  'dangerFg', 'dangerBg', 'dangerBorder',
  'infoFg', 'infoBg', 'infoBorder',
  'celebrationFg', 'celebrationBg',
];

describe('colour tokens', () => {
  it('light has every required role', () => {
    for (const k of REQUIRED_KEYS) {
      expect(lightColors[k]).toBeDefined();
    }
  });

  it('dark has every required role', () => {
    for (const k of REQUIRED_KEYS) {
      expect(darkColors[k]).toBeDefined();
    }
  });

  it('light and dark differ on every layer role (no copy-paste leak)', () => {
    const layerRoles: (keyof ColorTokens)[] = ['bg', 'surface', 'text', 'border', 'accent'];
    for (const role of layerRoles) {
      expect(lightColors[role]).not.toBe(darkColors[role]);
    }
  });

  it('colorsForScheme dispatches by scheme', () => {
    expect(colorsForScheme('light')).toBe(lightColors);
    expect(colorsForScheme('dark')).toBe(darkColors);
  });
});

describe('shadow tokens', () => {
  it('has every required shadow role per scheme', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const s = shadowsForScheme(scheme);
      expect(s.card).toBeDefined();
      expect(s.cardElevated).toBeDefined();
      expect(s.hero).toBeDefined();
      expect(s.bottomSheet).toBeDefined();
    }
  });

  it('hero shadow uses an offset (sanity — it should "lift" the card)', () => {
    const s = shadowsForScheme('light');
    const offset = s.hero.shadowOffset as { width: number; height: number };
    expect(offset.height).toBeGreaterThan(0);
  });
});
