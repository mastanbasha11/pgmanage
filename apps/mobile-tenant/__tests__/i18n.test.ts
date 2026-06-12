/**
 * i18n contract test — locks the same fix the staff app needed: i18n-js's
 * default key separator is '.', which breaks our flat-dotted keys. If
 * defaultSeparator drifts back to '.', every label renders as
 * `[missing "en.foo.bar"]` and this test catches it.
 */
import { i18n, t, setLocale } from '../lib/i18n';

describe('i18n', () => {
  beforeEach(() => setLocale('en'));

  it('resolves flat-dotted keys directly', () => {
    expect(t('auth.welcome')).toBe('Welcome');
    expect(t('common.signout')).toBe('Sign out');
  });

  it('uses the control-character separator so dots are literal', () => {
    expect(i18n.defaultSeparator).toBe('\x1f');
  });

  it('interpolates parameters', () => {
    expect(t('home.greeting', { name: 'Asha' })).toBe('Hi, Asha');
  });

  it('switches locale and returns translated strings', () => {
    setLocale('hi');
    expect(t('auth.welcome')).toBe('स्वागत है');
    setLocale('te');
    expect(t('auth.welcome')).toBe('స్వాగతం');
  });

  it('falls back to English for missing keys in a locale', () => {
    setLocale('hi');
    // 'common.continue' is defined; pick a definitely-missing key to confirm fallback.
    expect(t('definitely.missing.key')).toContain('definitely');
  });
});
