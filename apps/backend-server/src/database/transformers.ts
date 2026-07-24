import { ValueTransformer } from 'typeorm';

/**
 * Postgres `bigint` arrives over the wire as a string because it can exceed
 * Number.MAX_SAFE_INTEGER. Our money columns are cents and will never come
 * close, so we convert to `number` at the boundary and assert the range rather
 * than let a silent precision loss through.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null =>
    value === null || value === undefined ? null : value,

  from: (value: string | number | null): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(
        `bigint value ${value} exceeds JS safe integer range; money columns are cents and should never reach this`,
      );
    }
    return parsed;
  },
};
