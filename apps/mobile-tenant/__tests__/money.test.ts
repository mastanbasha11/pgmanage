/**
 * Money formatting — locked because every screen reads it via <Money />.
 *
 * Indian numbering system (lakh / crore commas) is the bit that matters
 * most; getting it wrong is the kind of bug a tenant notices immediately.
 */
import { formatRupees } from '../lib/money';

describe('formatRupees', () => {
  it('formats round amounts without decimals', () => {
    expect(formatRupees(1_200_000)).toBe('₹12,000');
  });

  it('shows paise when not whole-rupee', () => {
    expect(formatRupees(1_234_567)).toMatch(/₹12,345\.67/);
  });

  it('uses the Indian numbering system (lakh comma)', () => {
    expect(formatRupees(15_940_000)).toBe('₹1,59,400');
  });

  it('uses the Indian numbering system (crore comma)', () => {
    // 1,000,000,000 paise = ₹1,00,00,000 (1 crore)
    expect(formatRupees(1_000_000_000)).toBe('₹1,00,00,000');
  });

  it('handles zero', () => {
    expect(formatRupees(0)).toBe('₹0');
  });

  it('handles negatives (refund / adjustment lines)', () => {
    // Intl.NumberFormat puts the sign before the currency symbol on en-IN
    expect(formatRupees(-50_000)).toMatch(/-.*500/);
  });

  it('can suppress the symbol for inline use', () => {
    expect(formatRupees(1_200_000, { symbol: false })).toBe('12,000');
  });

  it('compact mode renders L / Cr suffixes', () => {
    expect(formatRupees(1_500_000_00, { compact: true })).toMatch(/L$/);  // 1.5 lakh
    expect(formatRupees(2_500_000_000, { compact: true })).toMatch(/Cr$/); // 2.5 crore
    expect(formatRupees(50_000_00, { compact: true })).toMatch(/K$/);      // 50K
  });
});
