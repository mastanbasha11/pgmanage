/**
 * Rupee/paise formatting helpers.
 *
 * The backend stores everything as integer paise (₹1 = 100 paise) — never
 * floats. UI helpers here are the only place where that conversion lives,
 * so a screen never says `paise / 100`.
 *
 * Indian numbering system (`en-IN`) groups crore/lakh:
 *   ₹1,23,456     instead of  ₹123,456
 *   ₹1,23,45,678  instead of  ₹12,345,678
 */

export interface FormatOpts {
  /** Show ₹ symbol. Default true. */
  symbol?: boolean;
  /** Force 2-decimal precision; default = on iff there are non-zero paise. */
  showPaise?: boolean;
  /** Compact ("₹1.2L", "₹12K"); default false. */
  compact?: boolean;
}

const INR_NF = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const INR_NF_PAISE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_PLAIN = new Intl.NumberFormat('en-IN');

/** Format integer paise as a rupee string. Source of truth for money display. */
export function formatRupees(paise: number, opts: FormatOpts = {}): string {
  const { symbol = true, showPaise, compact = false } = opts;
  const rupees = paise / 100;

  if (compact) {
    return formatCompact(rupees, symbol);
  }

  const wantsPaise = showPaise ?? paise % 100 !== 0;
  if (symbol) {
    return (wantsPaise ? INR_NF_PAISE : INR_NF).format(rupees);
  }
  // No symbol — strip the ₹ that en-IN's currency format leaves on
  return (wantsPaise ? INR_NF_PAISE : INR_NF).format(rupees).replace(/^₹\s?/, '');
}

/** "₹1.2L" / "₹12K" / "₹450" — for tiny KPI tiles. */
function formatCompact(rupees: number, symbol: boolean): string {
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  const prefix = symbol ? '₹' : '';
  if (abs >= 10_000_000) return `${sign}${prefix}${(rupees / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${sign}${prefix}${(rupees / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}${prefix}${(rupees / 1_000).toFixed(0)}K`;
  return `${sign}${prefix}${INR_PLAIN.format(rupees)}`;
}
