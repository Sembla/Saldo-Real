import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { createApp } from '../src/app.js';

async function startTestApp() {
  const config = {
    databasePath: ':memory:',
    appOrigin: 'http://127.0.0.1',
    sessionTtlHours: 1,
    cookieSecure: false,
    outboundDataEnabled: false,
  };
  const app = createApp(config);
  const server = createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    app,
    close: () => new Promise((resolve) => server.close(() => { app.close(); resolve(); })),
  };
}

async function jsonRequest(origin, path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, payload: await response.json() };
}

test('jornada principal: cadastro, saldo, lançamento e projeção', async (context) => {
  const fixture = await startTestApp();
  context.after(fixture.close);

  const registration = await jsonRequest(fixture.origin, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Pessoa Teste', email: 'pessoa@example.com', password: 'SenhaForte2026' },
  });
  assert.equal(registration.response.status, 201);
  const cookie = registration.response.headers.get('set-cookie').split(';')[0];
  const space = registration.payload.spaces[0];

  const update = await jsonRequest(fixture.origin, `/api/spaces/${space.id}`, {
    method: 'PATCH', cookie,
    body: { currentBalanceCents: 250_000, emergencyBufferCents: 50_000 },
  });
  assert.equal(update.response.status, 200);

  const entry = await jsonRequest(fixture.origin, `/api/spaces/${space.id}/entries`, {
    method: 'POST', cookie,
    body: {
      title: 'Aluguel', type: 'expense', amountCents: 120_000, category: 'housing',
      date: '2026-08-28', recurrence: 'none',
    },
  });
  assert.equal(entry.response.status, 201);

  const dashboard = await jsonRequest(fixture.origin, `/api/spaces/${space.id}/dashboard?today=2026-08-25`, { cookie });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.payload.forecasts.thirtyDays.safeToSpendCents, 80_000);
  assert.equal(dashboard.payload.forecasts.thirtyDays.status, 'stable');
  assert.equal(dashboard.payload.upcoming[0].title, 'Aluguel');
});

test('protege dados entre usuários e interpreta texto curto', async (context) => {
  const fixture = await startTestApp();
  context.after(fixture.close);
  const first = await jsonRequest(fixture.origin, '/api/auth/register', {
    method: 'POST', body: { name: 'Primeiro', email: 'a@example.com', password: 'SenhaForte2026' },
  });
  const firstSpaceId = first.payload.spaces[0].id;
  const second = await jsonRequest(fixture.origin, '/api/auth/register', {
    method: 'POST', body: { name: 'Segundo', email: 'b@example.com', password: 'SenhaForte2026' },
  });
  const secondCookie = second.response.headers.get('set-cookie').split(';')[0];

  const denied = await jsonRequest(fixture.origin, `/api/spaces/${firstSpaceId}/entries`, { cookie: secondCookie });
  assert.equal(denied.response.status, 404);

  const parsed = await jsonRequest(fixture.origin, '/api/entries/parse', {
    method: 'POST', cookie: secondCookie,
    body: { text: 'aluguel R$ 1.200 dia 10 todo mês', today: '2026-08-25' },
  });
  assert.equal(parsed.response.status, 200);
  assert.equal(parsed.payload.entry.amountCents, 120_000);
  assert.equal(parsed.payload.entry.title, 'Aluguel');
  assert.equal(parsed.payload.entry.category, 'housing');
  assert.equal(parsed.payload.entry.recurrence, 'monthly');
  assert.equal(parsed.payload.entry.date, '2026-09-10');

  const parsedIncome = await jsonRequest(fixture.origin, '/api/entries/parse', {
    method: 'POST', cookie: secondCookie,
    body: { text: 'receber salário R$ 2.500 dia 01 todo mês', today: '2026-08-25' },
  });
  assert.equal(parsedIncome.response.status, 200);
  assert.equal(parsedIncome.payload.entry.title, 'Salário');
  assert.equal(parsedIncome.payload.entry.type, 'income');
  assert.equal(parsedIncome.payload.entry.amountCents, 250_000);
});
