/**
 * Opaque cursor pagination (API_AND_EVENT_CONTRACTS §1.4).
 *
 * The cursor is base64url JSON. Opaque to clients means clients must not parse
 * it; it does not mean it is secret, and nothing authorisation-relevant is
 * encoded in it — the tenant always comes from the request context.
 */
export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_PAGE_LIMIT = 20;

export interface OrderCursor {
  /** ISO timestamp of the last row on the previous page. */
  placedAt: string;
  /** Tiebreaker for rows sharing a timestamp. */
  id: string;
}

export function encodeCursor(cursor: OrderCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): OrderCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed?.placedAt === 'string' && typeof parsed?.id === 'string') {
      return parsed as OrderCursor;
    }
    return null;
  } catch {
    return null;
  }
}

export function clampLimit(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(parsed), MAX_PAGE_LIMIT);
}
