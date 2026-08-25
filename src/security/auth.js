import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH, { N: 16_384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = scryptSync(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('base64url');
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').flatMap((part) => {
    const index = part.indexOf('=');
    if (index < 1) return [];
    return [[decodeURIComponent(part.slice(0, index).trim()), decodeURIComponent(part.slice(index + 1).trim())]];
  }));
}

export function sessionCookie(token, { secure = false, maxAgeSeconds = 604_800 } = {}) {
  return [
    `saldo_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function expiredSessionCookie({ secure = false } = {}) {
  return sessionCookie('', { secure, maxAgeSeconds: 0 });
}
