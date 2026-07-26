/**
 * Money formatting for the resident app. Pure (no RN imports) so it's unit-
 * testable and safe to reuse anywhere.
 */

/**
 * ₹ from integer paise, grouped Indian-style. Coerces anything non-finite
 * (undefined / null / NaN / a stray string) to 0 so the UI never shows "₹NaN".
 */
export function rupees(paise: number | null | undefined): string {
  const raw = Number(paise);
  const n = Math.round((Number.isFinite(raw) ? raw : 0) / 100);
  return '₹' + n.toLocaleString('en-IN');
}
