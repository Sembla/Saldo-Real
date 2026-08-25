import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearGuestData,
  createGuestApi,
  exportGuestData,
  hasGuestData,
  isGuestActive,
  isGuestLocalPath,
  setGuestActive,
  startGuestSession,
} from '../public/guest-store.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('modo visitante mantém a jornada financeira no armazenamento local', async () => {
  const storage = memoryStorage();
  const session = startGuestSession(storage);
  const api = createGuestApi(storage);
  const space = session.spaces[0];

  assert.equal(hasGuestData(storage), true);
  assert.equal(isGuestActive(storage), true);
  assert.equal(session.user.email, 'Somente neste navegador');

  await api(`/api/spaces/${space.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ currentBalanceCents: 300_000, emergencyBufferCents: 50_000 }),
  });
  await api(`/api/spaces/${space.id}/entries`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Aluguel', type: 'expense', amountCents: 120_000, category: 'housing',
      date: '2026-08-28', recurrence: 'none',
    }),
  });
  await api(`/api/spaces/${space.id}/entries`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Salário', type: 'income', amountCents: 250_000, category: 'income',
      date: '2026-09-01', recurrence: 'monthly', confidence: 1,
    }),
  });

  const dashboard = await api(`/api/spaces/${space.id}/dashboard?today=2026-08-25`);
  assert.equal(dashboard.forecasts.thirtyDays.safeToSpendCents, 130_000);
  assert.equal(dashboard.upcoming.length, 2);

  const decision = await api(`/api/spaces/${space.id}/decisions/simulate`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Notebook', amountCents: 100_000, desiredDate: '2026-09-10',
      installments: 3, today: '2026-08-25',
    }),
  });
  assert.equal(decision.simulation.verdict.recommendation, 'buy_now');
  assert.equal(decision.simulation.assumptions.dataStoredOnDevice, true);

  const backup = exportGuestData(storage);
  assert.equal(backup.source, 'saldo-real-guest');
  assert.equal(backup.spaces[0].entries.length, 2);
  assert.equal(JSON.stringify(backup).includes('password'), false);

  setGuestActive(false, storage);
  assert.equal(isGuestActive(storage), false);
  assert.equal(hasGuestData(storage), true);
  clearGuestData(storage);
  assert.equal(hasGuestData(storage), false);
});

test('roteamento local limita o modo visitante às operações financeiras', () => {
  assert.equal(isGuestLocalPath('/api/spaces/abc/dashboard'), true);
  assert.equal(isGuestLocalPath('/api/entries/parse'), true);
  assert.equal(isGuestLocalPath('/api/auth/register'), false);
  assert.equal(isGuestLocalPath('/api/account/import'), false);
  assert.equal(isGuestLocalPath('/api/context/BR'), false);
});
