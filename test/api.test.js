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

test('simula uma decisão usando o fluxo autenticado do espaço', async (context) => {
  const fixture = await startTestApp();
  context.after(fixture.close);

  const registration = await jsonRequest(fixture.origin, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Pessoa Decisora', email: 'decisao@example.com', password: 'SenhaForte2026' },
  });
  const cookie = registration.response.headers.get('set-cookie').split(';')[0];
  const space = registration.payload.spaces[0];
  await jsonRequest(fixture.origin, `/api/spaces/${space.id}`, {
    method: 'PATCH', cookie,
    body: { currentBalanceCents: 300_000, emergencyBufferCents: 50_000 },
  });

  const simulation = await jsonRequest(fixture.origin, `/api/spaces/${space.id}/decisions/simulate`, {
    method: 'POST', cookie,
    body: {
      title: 'Notebook', amountCents: 100_000, desiredDate: '2026-09-10',
      installments: 3, today: '2026-08-25',
    },
  });

  assert.equal(simulation.response.status, 200);
  assert.equal(simulation.payload.simulation.verdict.recommendation, 'buy_now');
  assert.equal(simulation.payload.simulation.scenarios.cashNow.safe, true);
  assert.equal(simulation.payload.simulation.assumptions.simulationDoesNotMoveMoney, true);

  const createdGoal = await jsonRequest(fixture.origin, `/api/spaces/${space.id}/goals`, {
    method: 'POST', cookie,
    body: { name: 'Notebook', targetCents: 100_000, targetDate: '2026-09-10', kind: 'purchase' },
  });
  const updatedGoal = await jsonRequest(fixture.origin, `/api/goals/${createdGoal.payload.goal.id}`, {
    method: 'PATCH', cookie,
    body: { currentCents: 25_000 },
  });
  assert.equal(updatedGoal.response.status, 200);
  assert.equal(updatedGoal.payload.goal.currentCents, 25_000);
});

test('migra dados do visitante somente para uma conta nova e vazia', async (context) => {
  const fixture = await startTestApp();
  context.after(fixture.close);

  const registration = await jsonRequest(fixture.origin, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Visitante Migrado', email: 'migrado@example.com', password: 'SenhaForte2026' },
  });
  const cookie = registration.response.headers.get('set-cookie').split(';')[0];
  const imported = await jsonRequest(fixture.origin, '/api/account/import', {
    method: 'POST', cookie,
    body: {
      exportVersion: 1,
      source: 'saldo-real-guest',
      spaces: [{
        name: 'Minha vida', kind: 'personal', currency: 'BRL', locale: 'pt-BR',
        currentBalanceCents: 300_000, emergencyBufferCents: 50_000,
        entries: [{
          title: 'Salário', type: 'income', amountCents: 250_000, category: 'income',
          date: '2026-09-01', recurrence: 'monthly', confidence: 1, status: 'planned',
        }],
        debts: [],
        goals: [{ name: 'Notebook', targetCents: 400_000, currentCents: 50_000, kind: 'purchase' }],
      }],
    },
  });
  assert.equal(imported.response.status, 201);
  assert.deepEqual(imported.payload.counts, { spaces: 1, entries: 1, debts: 0, goals: 1 });
  assert.equal(imported.payload.spaces[0].name, 'Minha vida');

  const dashboard = await jsonRequest(
    fixture.origin,
    `/api/spaces/${imported.payload.spaces[0].id}/dashboard?today=2026-08-25`,
    { cookie },
  );
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.payload.space.currentBalanceCents, 300_000);
  assert.equal(dashboard.payload.goals[0].name, 'Notebook');

  const repeated = await jsonRequest(fixture.origin, '/api/account/import', {
    method: 'POST', cookie,
    body: { source: 'saldo-real-guest', spaces: [{ name: 'Outro', entries: [], debts: [], goals: [] }] },
  });
  assert.equal(repeated.response.status, 409);
});

test('contexto econômico público não exige conta', async (context) => {
  const fixture = await startTestApp();
  context.after(fixture.close);
  const contextResponse = await jsonRequest(fixture.origin, '/api/context/BR');
  assert.equal(contextResponse.response.status, 200);
  assert.equal(contextResponse.payload.unavailable, true);
});

test('exporta dados, troca a senha e invalida a sessão anterior', async (context) => {
  const fixture = await startTestApp();
  context.after(fixture.close);

  const registration = await jsonRequest(fixture.origin, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Conta Segura', email: 'segura@example.com', password: 'SenhaAntiga2026' },
  });
  const oldCookie = registration.response.headers.get('set-cookie').split(';')[0];
  const spaceId = registration.payload.spaces[0].id;
  await jsonRequest(fixture.origin, `/api/spaces/${spaceId}/entries`, {
    method: 'POST', cookie: oldCookie,
    body: {
      title: 'Salário', type: 'income', amountCents: 300_000, category: 'income',
      date: '2026-09-01', recurrence: 'monthly',
    },
  });

  const exported = await jsonRequest(fixture.origin, '/api/account/export', { cookie: oldCookie });
  assert.equal(exported.response.status, 200);
  assert.match(exported.response.headers.get('content-disposition'), /saldo-real-dados-/);
  assert.equal(exported.payload.user.email, 'segura@example.com');
  assert.equal(exported.payload.spaces[0].entries[0].title, 'Salário');
  assert.equal(JSON.stringify(exported.payload).includes('password'), false);

  const wrongPassword = await jsonRequest(fixture.origin, '/api/account/password', {
    method: 'POST', cookie: oldCookie,
    body: { currentPassword: 'SenhaErrada2026', newPassword: 'SenhaNova2026' },
  });
  assert.equal(wrongPassword.response.status, 401);

  const changed = await jsonRequest(fixture.origin, '/api/account/password', {
    method: 'POST', cookie: oldCookie,
    body: { currentPassword: 'SenhaAntiga2026', newPassword: 'SenhaNova2026' },
  });
  assert.equal(changed.response.status, 200);
  const newCookie = changed.response.headers.get('set-cookie').split(';')[0];

  const oldSession = await jsonRequest(fixture.origin, '/api/auth/me', { cookie: oldCookie });
  assert.equal(oldSession.response.status, 401);
  const newSession = await jsonRequest(fixture.origin, '/api/auth/me', { cookie: newCookie });
  assert.equal(newSession.response.status, 200);

  const oldLogin = await jsonRequest(fixture.origin, '/api/auth/login', {
    method: 'POST', body: { email: 'segura@example.com', password: 'SenhaAntiga2026' },
  });
  assert.equal(oldLogin.response.status, 401);
  const newLogin = await jsonRequest(fixture.origin, '/api/auth/login', {
    method: 'POST', body: { email: 'segura@example.com', password: 'SenhaNova2026' },
  });
  assert.equal(newLogin.response.status, 200);
});

test('exclusão da conta exige confirmação e remove o acesso', async (context) => {
  const fixture = await startTestApp();
  context.after(fixture.close);

  const registration = await jsonRequest(fixture.origin, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Excluir Teste', email: 'excluir@example.com', password: 'ExcluirSenha2026' },
  });
  const cookie = registration.response.headers.get('set-cookie').split(';')[0];

  const denied = await jsonRequest(fixture.origin, '/api/account', {
    method: 'DELETE', cookie,
    body: { confirmation: 'EXCLUIR', password: 'ExcluirSenha2026' },
  });
  assert.equal(denied.response.status, 422);

  const deleted = await jsonRequest(fixture.origin, '/api/account', {
    method: 'DELETE', cookie,
    body: { confirmation: 'EXCLUIR MINHA CONTA', password: 'ExcluirSenha2026' },
  });
  assert.equal(deleted.response.status, 200);
  assert.match(deleted.response.headers.get('set-cookie'), /Max-Age=0/);

  const session = await jsonRequest(fixture.origin, '/api/auth/me', { cookie });
  assert.equal(session.response.status, 401);
  const login = await jsonRequest(fixture.origin, '/api/auth/login', {
    method: 'POST', body: { email: 'excluir@example.com', password: 'ExcluirSenha2026' },
  });
  assert.equal(login.response.status, 401);
});
