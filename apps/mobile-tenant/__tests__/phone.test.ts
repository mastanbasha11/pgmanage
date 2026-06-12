/**
 * Phone normalisation contract test.
 *
 * The backend's tenant_portal._normalise_phone uses the same rules; if
 * either side diverges, /auth/otp will silently 'delivery: none' on inputs
 * the user expects to work, and that's exactly the silent-bug class we
 * want to keep impossible.
 */
import { normalisePhone, looksLikeIndianMobile } from '../lib/phone';

describe('normalisePhone', () => {
  it('keeps E.164 input unchanged', () => {
    expect(normalisePhone('+919876543210')).toBe('+919876543210');
  });

  it('adds +91 to a bare 10-digit mobile', () => {
    expect(normalisePhone('9876543210')).toBe('+919876543210');
  });

  it('strips leading 0 then prepends +91', () => {
    expect(normalisePhone('09876543210')).toBe('+919876543210');
  });

  it('strips 91 prefix when total length is 12', () => {
    expect(normalisePhone('919876543210')).toBe('+919876543210');
  });

  it('strips spaces and punctuation', () => {
    expect(normalisePhone('+91 98765-43210')).toBe('+919876543210');
  });

  it('does not invent a + for numbers we cannot parse', () => {
    expect(normalisePhone('1234')).toBe('1234');
  });
});

describe('looksLikeIndianMobile', () => {
  it('accepts a normalised mobile starting 6/7/8/9', () => {
    for (const lead of ['6', '7', '8', '9']) {
      expect(looksLikeIndianMobile(`${lead}876543210`)).toBe(true);
    }
  });

  it('rejects landlines / wrong leading digit', () => {
    expect(looksLikeIndianMobile('5876543210')).toBe(false);
    expect(looksLikeIndianMobile('123456')).toBe(false);
  });
});
