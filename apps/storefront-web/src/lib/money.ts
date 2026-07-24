const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

/** Formats integer minor units for display. Never used for arithmetic. */
export function formatMoney(cents: number, currency: string, locale = 'en-AU'): string {
  const fraction = ZERO_DECIMAL.has(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(cents / 10 ** fraction);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Signed delta, e.g. "+$5.00" / "−$5.00" / "" for zero. */
export function formatDelta(cents: number, currency: string, locale = 'en-AU'): string {
  if (cents === 0) return '';
  const sign = cents > 0 ? '+' : '−';
  return `${sign}${formatMoney(Math.abs(cents), currency, locale)}`;
}
