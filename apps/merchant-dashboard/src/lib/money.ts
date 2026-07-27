const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

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
