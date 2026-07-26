import { rupees } from '../lib/tenant/money';

describe('rupees()', () => {
  it('formats paise as grouped Indian rupees', () => {
    expect(rupees(900000)).toBe('₹9,000');
    expect(rupees(1250000)).toBe('₹12,500');
    expect(rupees(0)).toBe('₹0');
  });

  it('never returns ₹NaN for bad input', () => {
    expect(rupees(undefined)).toBe('₹0');
    expect(rupees(null)).toBe('₹0');
    expect(rupees(NaN)).toBe('₹0');
    expect(rupees('abc' as unknown as number)).toBe('₹0');
  });

  it('coerces numeric strings', () => {
    expect(rupees('550000' as unknown as number)).toBe('₹5,500');
  });

  it('rounds to the nearest rupee', () => {
    expect(rupees(150)).toBe('₹2'); // 1.5 → 2
    expect(rupees(149)).toBe('₹1');
  });
});
