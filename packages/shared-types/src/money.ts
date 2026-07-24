/**
 * Integer-cents helpers.
 *
 * HYPERZOD_MASTER_CONTEXT.md §10 makes integer cents the single monetary unit
 * across DB, DTOs and frontends. Nothing in this repo should ever produce a
 * float price; these helpers exist so display formatting has one home.
 */

/** Minor units per major unit, keyed by ISO 4217 code. Default is 2. */
const EXPONENT_OVERRIDES: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

export function currencyExponent(currencyCode: string): number {
  return EXPONENT_OVERRIDES[currencyCode.toUpperCase()] ?? 2;
}

/** Format integer minor units for display. Never used for arithmetic. */
export function formatCents(cents: number, currencyCode: string, locale = 'en-AU'): string {
  const exponent = currencyExponent(currencyCode);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(cents / 10 ** exponent);
}

export function isSafeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
