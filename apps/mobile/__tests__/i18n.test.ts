/**
 * Catches the exact class of bug that just shipped:
 *   - flat dot-keys must resolve as literal strings, NOT nested paths.
 *   - en is the canonical source; hi/te fall back to en when a key is
 *     missing in the target locale.
 *
 * If this test ever returns "[missing …]" we know i18n-js's separator
 * regressed back to "." and a future build would render every label
 * literally on the device.
 */
import { i18n, setLocale, t } from '../lib/i18n';

describe('i18n', () => {
  beforeEach(() => setLocale('en'));

  test('flat dot-key resolves to the English label (not "[missing …]")', () => {
    expect(t('common.signin')).toBe('Sign In');
    expect(t('tab.dashboard')).toBe('Home');
    expect(t('res.record_payment')).toBe('Take Payment');
  });

  test('Hindi locale returns the Hindi string when defined', () => {
    setLocale('hi');
    expect(t('tab.dashboard')).toBe('होम');
    expect(t('res.record_payment')).toBe('💰 पैसा लें');
  });

  test('Telugu locale returns the Telugu string when defined', () => {
    setLocale('te');
    expect(t('tab.dashboard')).toBe('హోమ్');
  });

  test('Missing keys in hi/te fall back to English (enableFallback)', () => {
    setLocale('hi');
    // 'res.profile' is defined in hi
    expect(t('res.profile')).toBe('प्रोफ़ाइल');
    // 'set.about' isn't translated in hi → should fall back to en
    expect(t('set.about')).toBe('About');
  });

  test('No key in any locale begins with "[missing"', () => {
    // Sanity sweep — every key in the en dictionary must resolve to a
    // non-empty string in en. If any return the i18n-js default
    // "[missing …]" placeholder, we have a separator regression.
    const allKeys = Object.keys((i18n.translations as Record<string, Record<string, string>>).en);
    setLocale('en');
    for (const k of allKeys) {
      const val = i18n.t(k);
      expect(val).not.toMatch(/^\[missing/);
      expect(val.length).toBeGreaterThan(0);
    }
  });
});
