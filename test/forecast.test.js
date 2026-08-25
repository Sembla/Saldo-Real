import test from 'node:test';
import assert from 'node:assert/strict';

import { buildForecast } from '../src/domain/forecast.js';
import { expandRecurringEntries } from '../src/domain/recurrence.js';

test('calcula o saldo seguro preservando a reserva', () => {
  const forecast = buildForecast({
    startingBalanceCents: 300_000,
    emergencyBufferCents: 50_000,
    today: '2026-08-25',
    horizonDays: 10,
    events: [
      { id: 'rent', title: 'Aluguel', type: 'expense', amountCents: 120_000, date: '2026-08-28' },
      { id: 'income', title: 'Recebimento', type: 'income', amountCents: 100_000, date: '2026-09-01', confidence: 1 },
    ],
  });

  assert.equal(forecast.minimumBalanceCents, 180_000);
  assert.equal(forecast.safeToSpendCents, 130_000);
  assert.equal(forecast.status, 'stable');
});

test('reduz renda variável pela confiança sem reduzir despesas', () => {
  const forecast = buildForecast({
    startingBalanceCents: 40_000,
    emergencyBufferCents: 20_000,
    today: '2026-08-25',
    horizonDays: 7,
    events: [
      { id: 'variable', title: 'Freela', type: 'income', amountCents: 100_000, date: '2026-08-26', confidence: 0.5 },
      { id: 'bill', title: 'Conta', type: 'expense', amountCents: 80_000, date: '2026-08-27', confidence: 0.1 },
    ],
  });

  assert.equal(forecast.totalIncomeCents, 50_000);
  assert.equal(forecast.totalExpenseCents, 80_000);
  assert.equal(forecast.minimumBalanceCents, 10_000);
  assert.equal(forecast.safeToSpendCents, 0);
  assert.equal(forecast.status, 'warning');
});

test('marca risco quando o fluxo projetado fica negativo', () => {
  const forecast = buildForecast({
    startingBalanceCents: 30_000,
    today: '2026-08-25',
    horizonDays: 5,
    events: [
      { id: 'bill', title: 'Fatura', type: 'expense', amountCents: 40_000, date: '2026-08-27' },
    ],
  });

  assert.equal(forecast.riskDate, '2026-08-27');
  assert.equal(forecast.status, 'critical');
});

test('recorrência mensal respeita o último dia do mês', () => {
  const events = expandRecurringEntries([
    { id: 'x', date: '2026-01-31', recurrence: 'monthly' },
  ], { from: '2026-01-01', to: '2026-04-30' });

  assert.deepEqual(events.map((event) => event.date), [
    '2026-01-31',
    '2026-02-28',
    '2026-03-31',
    '2026-04-30',
  ]);
});
