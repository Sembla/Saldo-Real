import test from 'node:test';
import assert from 'node:assert/strict';

import { simulateDecision } from '../src/domain/decision-simulator.js';

test('aprova uma decisão que preserva contas e reserva', () => {
  const result = simulateDecision({
    startingBalanceCents: 300_000,
    emergencyBufferCents: 50_000,
    events: [],
    title: 'Notebook',
    amountCents: 100_000,
    desiredDate: '2026-08-25',
    today: '2026-08-25',
  });

  assert.equal(result.verdict.recommendation, 'buy_now');
  assert.equal(result.scenarios.cashNow.safe, true);
  assert.equal(result.scenarios.cashNow.minimumBalanceCents, 200_000);
});

test('recomenda esperar quando a compra imediata cria risco', () => {
  const result = simulateDecision({
    startingBalanceCents: 200_000,
    emergencyBufferCents: 50_000,
    events: [
      { id: 'bill', title: 'Conta', type: 'expense', amountCents: 120_000, date: '2026-08-28' },
      { id: 'income', title: 'Recebimento', type: 'income', amountCents: 100_000, date: '2026-09-04' },
    ],
    title: 'Curso',
    amountCents: 100_000,
    desiredDate: '2026-09-05',
    today: '2026-08-25',
  });

  assert.equal(result.scenarios.cashNow.safe, false);
  assert.equal(result.scenarios.planned.safe, true);
  assert.equal(result.verdict.recommendation, 'wait');
});

test('compara parcelamento e cria uma meta mensal estimada', () => {
  const result = simulateDecision({
    startingBalanceCents: 300_000,
    emergencyBufferCents: 100_000,
    events: [
      { id: 'income-1', title: 'Recebimento', type: 'income', amountCents: 100_000, date: '2026-09-25' },
      { id: 'income-2', title: 'Recebimento', type: 'income', amountCents: 100_000, date: '2026-10-25' },
    ],
    title: 'Equipamento',
    amountCents: 240_000,
    desiredDate: '2026-11-23',
    installments: 3,
    today: '2026-08-25',
  });

  assert.equal(result.scenarios.cashNow.safe, false);
  assert.equal(result.scenarios.installments.safe, true);
  assert.equal(result.verdict.recommendation, 'wait');
  assert.equal(result.targetPlan.remainingCents, 40_000);
  assert.equal(result.targetPlan.estimatedMonthlyContributionCents, 13_334);
});
