const DAY_MS = 86_400_000;

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new TypeError('Data inválida no fluxo financeiro.');
  return date.toISOString().slice(0, 10);
}

function datePlusDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return new Date(date.valueOf() + days * DAY_MS).toISOString().slice(0, 10);
}

function normalizeEvent(event) {
  const amountCents = Number(event.amountCents);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new TypeError('amountCents precisa ser um inteiro não negativo.');
  }

  const type = event.type === 'income' ? 'income' : 'expense';
  const confidence = type === 'income'
    ? Math.max(0, Math.min(1, Number(event.confidence ?? 1)))
    : 1;
  const effectiveCents = type === 'income'
    ? Math.round(amountCents * confidence)
    : -amountCents;

  return {
    ...event,
    type,
    date: toIsoDate(event.date),
    confidence,
    effectiveCents,
  };
}

export function buildForecast({
  startingBalanceCents,
  events = [],
  emergencyBufferCents = 0,
  horizonDays = 30,
  today = new Date().toISOString().slice(0, 10),
}) {
  if (!Number.isSafeInteger(startingBalanceCents)) {
    throw new TypeError('startingBalanceCents precisa ser um inteiro.');
  }
  if (!Number.isSafeInteger(emergencyBufferCents) || emergencyBufferCents < 0) {
    throw new TypeError('emergencyBufferCents precisa ser um inteiro não negativo.');
  }
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 366) {
    throw new RangeError('horizonDays deve estar entre 1 e 366.');
  }

  const firstDate = toIsoDate(today);
  const lastDate = datePlusDays(firstDate, horizonDays);
  const normalizedEvents = events
    .map(normalizeEvent)
    .filter((event) => event.date >= firstDate && event.date <= lastDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.effectiveCents - b.effectiveCents);

  const byDate = Map.groupBy(normalizedEvents, (event) => event.date);
  let balanceCents = startingBalanceCents;
  let minimumBalanceCents = startingBalanceCents;
  let riskDate = startingBalanceCents < 0 ? firstDate : null;
  let bufferRiskDate = startingBalanceCents < emergencyBufferCents ? firstDate : null;
  const timeline = [];

  for (let day = 0; day <= horizonDays; day += 1) {
    const date = datePlusDays(firstDate, day);
    const dayEvents = byDate.get(date) ?? [];
    const netCents = dayEvents.reduce((sum, event) => sum + event.effectiveCents, 0);
    balanceCents += netCents;
    minimumBalanceCents = Math.min(minimumBalanceCents, balanceCents);
    if (!riskDate && balanceCents < 0) riskDate = date;
    if (!bufferRiskDate && balanceCents < emergencyBufferCents) bufferRiskDate = date;

    timeline.push({
      date,
      balanceCents,
      netCents,
      events: dayEvents.map(({ id, title, type, amountCents, effectiveCents, confidence, category }) => ({
        id,
        title,
        type,
        amountCents,
        effectiveCents,
        confidence,
        category,
      })),
    });
  }

  const totalIncomeCents = normalizedEvents
    .filter((event) => event.type === 'income')
    .reduce((sum, event) => sum + event.effectiveCents, 0);
  const totalExpenseCents = normalizedEvents
    .filter((event) => event.type === 'expense')
    .reduce((sum, event) => sum + Math.abs(event.effectiveCents), 0);
  const safeToSpendCents = Math.max(0, minimumBalanceCents - emergencyBufferCents);
  const nextIncome = normalizedEvents.find((event) => event.type === 'income' && event.date > firstDate);
  const daysUntilNextIncome = nextIncome
    ? Math.max(1, Math.round((new Date(`${nextIncome.date}T00:00:00.000Z`) - new Date(`${firstDate}T00:00:00.000Z`)) / DAY_MS))
    : horizonDays;
  const safePerDayCents = Math.floor(safeToSpendCents / Math.max(1, daysUntilNextIncome));

  return {
    today: firstDate,
    horizonDays,
    startingBalanceCents,
    endingBalanceCents: balanceCents,
    minimumBalanceCents,
    emergencyBufferCents,
    safeToSpendCents,
    safePerDayCents,
    riskDate,
    bufferRiskDate,
    status: riskDate ? 'critical' : bufferRiskDate ? 'warning' : 'stable',
    totalIncomeCents,
    totalExpenseCents,
    nextIncomeDate: nextIncome?.date ?? null,
    assumptions: {
      variableIncomeIsConfidenceAdjusted: true,
      expensesAreCountedAtFullValue: true,
      safeToSpendPreservesEmergencyBuffer: true,
    },
    timeline,
  };
}
