import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hashPassword,
  parseCookies,
  sessionCookie,
  verifyPassword,
} from '../src/security/auth.js';

test('hash de senha usa salt e permite verificar sem armazenar o segredo', () => {
  const first = hashPassword('SaldoReal2026');
  const second = hashPassword('SaldoReal2026');

  assert.notEqual(first, second);
  assert.equal(verifyPassword('SaldoReal2026', first), true);
  assert.equal(verifyPassword('senha-errada', first), false);
  assert.equal(first.includes('SaldoReal2026'), false);
});

test('cookie de sessão usa flags defensivas', () => {
  const cookie = sessionCookie('abc123', { secure: true, maxAgeSeconds: 60 });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(parseCookies('foo=bar; saldo_session=abc123').saldo_session, 'abc123');
});
