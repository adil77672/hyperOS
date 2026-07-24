import { ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// promisify's inferred signature drops the options overload, so the parameter
// tuple is restated here rather than casting at every call site.
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * scrypt from Node's own crypto — memory-hard, no native build step, no
 * dependency to audit. Parameters follow the OWASP minimum for scrypt
 * (N=2^17, r=8, p=1).
 *
 * Stored format: `scrypt$N$r$p$<salt-b64>$<hash-b64>`. Embedding the
 * parameters is what makes raising them later a migration rather than a
 * flag day — verify() reads them from the stored string.
 */
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(plaintext, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;

  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(plaintext: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [
    string, string, string, string, string, string,
  ];

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');

  const derived = (await scryptAsync(plaintext, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Burns roughly the same CPU as a real verification.
 *
 * Login must take the same time whether or not the email exists, otherwise
 * response timing enumerates accounts — which would undo the deliberately
 * identical 401 message in API_AND_EVENT_CONTRACTS §2.3.
 */
export async function burnPasswordComparison(): Promise<void> {
  await scryptAsync('decoy', randomBytes(SALT_LENGTH), KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 256 * 1024 * 1024,
  });
}
