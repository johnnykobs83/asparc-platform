import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt password hashing – used only by the local development backend. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await new Promise<Buffer>((res, rej) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored?.startsWith('scrypt$')) return false;
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await new Promise<Buffer>((res, rej) =>
    scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Password must include upper case, lower case and a number.';
  return null;
}
