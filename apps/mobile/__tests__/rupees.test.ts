/**
 * The rupees() helper formats integer paise as "₹X,XXX". Used in
 * Dashboard KPIs, Resident detail, Rent ledger, Leads cards — basically
 * every money number on the device.
 *
 * Locks the formatting so a future Intl.NumberFormat regression on
 * Hermes (or a bad rounding choice) doesn't ship to production.
 */
import { rupees } from '../components/ui';

describe('rupees()', () => {
  test('formats whole-rupee amounts with Indian thousands separator', () => {
    expect(rupees(100)).toBe('₹1');
    expect(rupees(100_00)).toBe('₹100');
    expect(rupees(1_000_00)).toBe('₹1,000');
    expect(rupees(9_000_00)).toBe('₹9,000');
    // 1 lakh = 1,00,000 in Indian formatting (en-IN locale).
    expect(rupees(1_00_000_00)).toBe('₹1,00,000');
  });

  test('drops paise (we never display partial-rupee amounts in the UI)', () => {
    // 9_001 paise = ₹90.01 → displays as ₹90
    expect(rupees(9_001)).toBe('₹90');
  });

  test('handles zero', () => {
    expect(rupees(0)).toBe('₹0');
  });
});
