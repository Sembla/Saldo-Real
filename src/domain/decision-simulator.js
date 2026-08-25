import { buildForecast } from './forecast.js';

const DAY_MS = 86_400_000;

function addDays(date, days) {
  return new Date(new Date(`${date}T00:00:00.000Z`).valueOf() + days * DAY_MS)
    .toISOString().slice(0, 10);
}

function addMonthsClamped(isoDate, months) {
  const anchor = new Date(`${isoDate}T00:00:00.000Z`);
  const originalDay = anchor.getUTCDate();
  const result = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.max(0, Math.round(
    (new Date(`${to}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)) / DAY_MS,
  ));
}

function splitAmount(amountCents, installments) {
  const base = Math.floor(amountCents / installments);
  const remainder = amountCents % installments;
  return Array.from({ length: installments }, (_, index) => base + (index < remainder ? 1 : 0));
}

function decisionEvents({ title, amountCents, date, installments = 1 }) {
  return splitAmount(amountCents, installments).map((installmentAmountCents, index) => ({
    id: `decision:${index + 1}`,
    title: installments === 1 ? title : `${title} · ${index + 1}/${installments}`,
    type: 'expense',
    amountCents: installmentAmountCents,
    date: addMonthsClamped(date, index),
    category: 'decision',
  }));
}

function summarize(forecast, { date, installments, amountCents }) {
  return {
    date,
    installments,
    amountCents,
    installmentAmountCents: Math.ceil(amountCents / installments),
    safe: !forecast.riskDate && !forecast.bufferRiskDate,
    status: forecast.status,
    endingBalanceCents: forecast.endingBalanceCents,
    minimumBalanceCents: forecast.minimumBalanceCents,
    safeToSpendAfterCents: forecast.safeToSpendCents,
    riskDate: forecast.riskDate,
    bufferRiskDate: forecast.bufferRiskDate,
    bufferGapCents: Math.max(0, forecast.emergencyBufferCents - forecast.minimumBalanceCents),
  };
}

export function simulateDecision({
  startingBalanceCents,
  emergencyBufferCents = 0,
  events = [],
  title,
  amountCents,
  desiredDate,
  installments = 1,
  today = new Date().toISOString().slice(0, 10),
  horizonDays = 365,
}) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new TypeError('amountCents precisa ser um inteiro positivo.');
  }
  if (!Number.isInteger(installments) || installments < 1 || installments > 12) {
    throw new RangeError('installments deve estar entre 1 e 12.');
  }

  const plannedDate = desiredDate < today ? today : desiredDate;
  const forecast = (extraEvents = []) => buildForecast({
    startingBalanceCents,
    emergencyBufferCents,
    events: [...events, ...extraEvents],
    horizonDays,
    today,
  });
  const baseline = forecast();
  const cashNowForecast = forecast(decisionEvents({ title, amountCents, date: today }));
  const plannedForecast = forecast(decisionEvents({ title, amountCents, date: plannedDate }));
  const installmentForecast = forecast(decisionEvents({
    title,
    amountCents,
    date: today,
    installments,
  }));

  let earliestSafeDate = null;
  if (!baseline.riskDate && !baseline.bufferRiskDate) {
    for (let day = 0; day <= horizonDays; day += 1) {
      const candidate = addDays(today, day);
      const candidateForecast = forecast(decisionEvents({ title, amountCents, date: candidate }));
      if (!candidateForecast.riskDate && !candidateForecast.bufferRiskDate) {
        earliestSafeDate = candidate;
        break;
      }
    }
  }

  const cashNow = summarize(cashNowForecast, { date: today, installments: 1, amountCents });
  const planned = summarize(plannedForecast, { date: plannedDate, installments: 1, amountCents });
  const installmentPlan = summarize(installmentForecast, {
    date: today,
    installments,
    amountCents,
  });
  const availableNowCents = baseline.safeToSpendCents;
  const remainingCents = Math.max(0, amountCents - availableNowCents);
  const monthsUntilDesired = Math.max(1, Math.ceil(daysBetween(today, plannedDate) / 30));

  let recommendation = 'build_goal';
  let headline = 'Ainda não cabe com segurança.';
  let explanation = 'A compra reduziria o caixa abaixo da reserva nos cenários informados.';
  if (cashNow.safe) {
    recommendation = 'buy_now';
    headline = 'Cabe agora sem tocar na reserva.';
    explanation = 'Mesmo depois da compra, as contas previstas e a reserva mínima continuam protegidas.';
  } else if (planned.safe && plannedDate !== today) {
    recommendation = 'wait';
    headline = `Esperar até ${plannedDate} protege melhor o caixa.`;
    explanation = 'Na data escolhida, o fluxo absorve a compra sem atravessar a reserva mínima.';
  } else if (installments > 1 && installmentPlan.safe) {
    recommendation = 'installments';
    headline = `Parcelar em ${installments} vezes preserva a reserva.`;
    explanation = 'As parcelas cabem no fluxo projetado sem criar um dia de risco.';
  } else if (earliestSafeDate && earliestSafeDate !== today) {
    recommendation = 'wait';
    headline = `A primeira data segura estimada é ${earliestSafeDate}.`;
    explanation = 'Antes disso, a decisão encosta na reserva ou deixa alguma conta descoberta.';
  }

  return {
    generatedAt: new Date().toISOString(),
    decision: { title, amountCents, desiredDate: plannedDate, installments },
    baseline: {
      status: baseline.status,
      safeToSpendCents: baseline.safeToSpendCents,
      minimumBalanceCents: baseline.minimumBalanceCents,
      endingBalanceCents: baseline.endingBalanceCents,
      riskDate: baseline.riskDate,
      bufferRiskDate: baseline.bufferRiskDate,
    },
    verdict: { recommendation, headline, explanation, earliestSafeDate },
    scenarios: { cashNow, planned, installments: installmentPlan },
    targetPlan: {
      availableNowCents,
      remainingCents,
      monthsUntilDesired,
      estimatedMonthlyContributionCents: Math.ceil(remainingCents / monthsUntilDesired),
    },
    assumptions: {
      horizonDays,
      incomeConfidenceAdjusted: true,
      expensesCountedAtFullValue: true,
      emergencyBufferPreserved: true,
      simulationDoesNotMoveMoney: true,
    },
  };
}
