const STORAGE_KEY = 'saldo-real:guest:v1';
const ACTIVE_KEY = 'saldo-real:guest:active';
const DAY_MS = 86_400_000;

function localError(message, status = 422, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function uuid() {
  return globalThis.crypto?.randomUUID?.()
    ?? `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  return new Date(new Date(`${isoDate}T00:00:00.000Z`).valueOf() + days * DAY_MS)
    .toISOString().slice(0, 10);
}

function ensureDate(value, label = 'Data') {
  const normalized = String(value ?? '');
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)
      || Number.isNaN(parsed.valueOf())
      || parsed.toISOString().slice(0, 10) !== normalized) {
    throw localError(`${label} inválida.`);
  }
  return normalized;
}

function requiredText(value, label, max = 100) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw localError(`${label} é obrigatório.`);
  if (normalized.length > max) throw localError(`${label} deve ter no máximo ${max} caracteres.`);
  return normalized;
}

function integer(value, label, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    throw localError(`${label} inválido.`);
  }
  return normalized;
}

function oneOf(value, label, values) {
  if (!values.includes(value)) throw localError(`${label} inválido.`);
  return value;
}

function emptySpace() {
  const timestamp = now();
  return {
    id: uuid(),
    name: 'Pessoal',
    kind: 'personal',
    currency: 'BRL',
    locale: 'pt-BR',
    currentBalanceCents: 0,
    emergencyBufferCents: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    entries: [],
    debts: [],
    goals: [],
  };
}

function emptyStore() {
  return {
    storeVersion: 1,
    source: 'saldo-real-guest',
    createdAt: now(),
    updatedAt: now(),
    spaces: [emptySpace()],
  };
}

function readStore(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    if (parsed?.source === 'saldo-real-guest' && Array.isArray(parsed.spaces) && parsed.spaces.length) {
      return parsed;
    }
  } catch {
    // A cópia inválida é substituída somente quando o visitante inicia um novo teste.
  }
  return null;
}

function writeStore(storage, data) {
  data.updatedAt = now();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw localError('O navegador não conseguiu salvar seus dados locais. Libere espaço ou use outro navegador.', 507, 'LOCAL_STORAGE_UNAVAILABLE');
  }
}

function requireStore(storage) {
  const data = readStore(storage);
  if (!data) throw localError('O teste local não foi iniciado.', 404, 'GUEST_NOT_STARTED');
  return data;
}

function findSpace(data, id) {
  const space = data.spaces.find((item) => item.id === id);
  if (!space) throw localError('Espaço não encontrado.', 404, 'NOT_FOUND');
  return space;
}

function publicSpace(space) {
  const { entries, debts, goals, ...details } = space;
  return details;
}

function entryInput(body) {
  const type = oneOf(body.type, 'Tipo', ['income', 'expense']);
  return {
    title: requiredText(body.title, 'Descrição'),
    type,
    amountCents: integer(body.amountCents, 'Valor', { min: 1 }),
    category: requiredText(body.category ?? 'other', 'Categoria', 40),
    date: ensureDate(body.date),
    recurrence: oneOf(body.recurrence ?? 'none', 'Recorrência', ['none', 'weekly', 'monthly', 'yearly']),
    recurrenceEnd: body.recurrenceEnd ? ensureDate(body.recurrenceEnd, 'Fim da recorrência') : null,
    confidence: type === 'income' ? Math.max(0, Math.min(1, Number(body.confidence ?? 1))) : 1,
    status: oneOf(body.status ?? 'planned', 'Status', ['planned', 'paid', 'cancelled']),
    notes: String(body.notes ?? '').trim().slice(0, 500),
  };
}

function goalInput(body, current = {}) {
  return {
    name: requiredText(body.name ?? current.name, 'Meta', 80),
    targetCents: integer(body.targetCents ?? current.targetCents, 'Valor da meta', { min: 1 }),
    currentCents: integer(body.currentCents ?? current.currentCents ?? 0, 'Valor acumulado', { min: 0 }),
    targetDate: body.targetDate === null
      ? null
      : body.targetDate ? ensureDate(body.targetDate, 'Data-alvo') : current.targetDate ?? null,
    kind: oneOf(body.kind ?? current.kind ?? 'general', 'Tipo', ['emergency', 'general', 'purchase', 'debt']),
  };
}

function addMonthsClamped(isoDate, months) {
  const anchor = new Date(`${isoDate}T00:00:00.000Z`);
  const originalDay = anchor.getUTCDate();
  const result = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result.toISOString().slice(0, 10);
}

function expandRecurringEntries(entries, { from, to }) {
  const result = [];
  for (const entry of entries) {
    let occurrence = 0;
    let date = entry.date;
    const effectiveEnd = entry.recurrenceEnd && entry.recurrenceEnd < to ? entry.recurrenceEnd : to;
    while (date <= effectiveEnd) {
      if (date >= from) result.push({ ...entry, occurrenceDate: date, date, instanceId: `${entry.id}:${date}` });
      occurrence += 1;
      if (entry.recurrence === 'weekly') date = addDays(entry.date, occurrence * 7);
      else if (entry.recurrence === 'monthly') date = addMonthsClamped(entry.date, occurrence);
      else if (entry.recurrence === 'yearly') date = addMonthsClamped(entry.date, occurrence * 12);
      else break;
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function buildForecast({ startingBalanceCents, events, emergencyBufferCents, horizonDays, today: firstDate }) {
  const lastDate = addDays(firstDate, horizonDays);
  const normalized = events
    .filter((event) => event.date >= firstDate && event.date <= lastDate)
    .map((event) => {
      const confidence = event.type === 'income' ? Math.max(0, Math.min(1, Number(event.confidence ?? 1))) : 1;
      return {
        ...event,
        confidence,
        effectiveCents: event.type === 'income'
          ? Math.round(event.amountCents * confidence)
          : -event.amountCents,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.effectiveCents - b.effectiveCents);
  const byDate = new Map();
  for (const event of normalized) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);

  let balanceCents = startingBalanceCents;
  let minimumBalanceCents = startingBalanceCents;
  let riskDate = startingBalanceCents < 0 ? firstDate : null;
  let bufferRiskDate = startingBalanceCents < emergencyBufferCents ? firstDate : null;
  const timeline = [];
  for (let day = 0; day <= horizonDays; day += 1) {
    const date = addDays(firstDate, day);
    const dayEvents = byDate.get(date) ?? [];
    const netCents = dayEvents.reduce((sum, event) => sum + event.effectiveCents, 0);
    balanceCents += netCents;
    minimumBalanceCents = Math.min(minimumBalanceCents, balanceCents);
    if (!riskDate && balanceCents < 0) riskDate = date;
    if (!bufferRiskDate && balanceCents < emergencyBufferCents) bufferRiskDate = date;
    timeline.push({ date, balanceCents, netCents, events: dayEvents });
  }
  const totalIncomeCents = normalized.filter((event) => event.type === 'income')
    .reduce((sum, event) => sum + event.effectiveCents, 0);
  const totalExpenseCents = normalized.filter((event) => event.type === 'expense')
    .reduce((sum, event) => sum + Math.abs(event.effectiveCents), 0);
  const safeToSpendCents = Math.max(0, minimumBalanceCents - emergencyBufferCents);
  const nextIncome = normalized.find((event) => event.type === 'income' && event.date > firstDate);
  const daysUntilNextIncome = nextIncome
    ? Math.max(1, Math.round((new Date(`${nextIncome.date}T00:00:00.000Z`) - new Date(`${firstDate}T00:00:00.000Z`)) / DAY_MS))
    : horizonDays;
  return {
    today: firstDate,
    horizonDays,
    startingBalanceCents,
    endingBalanceCents: balanceCents,
    minimumBalanceCents,
    emergencyBufferCents,
    safeToSpendCents,
    safePerDayCents: Math.floor(safeToSpendCents / Math.max(1, daysUntilNextIncome)),
    riskDate,
    bufferRiskDate,
    status: riskDate ? 'critical' : bufferRiskDate ? 'warning' : 'stable',
    totalIncomeCents,
    totalExpenseCents,
    nextIncomeDate: nextIncome?.date ?? null,
    timeline,
  };
}

function financialHealth({ forecast, monthlyIncomeCents, debtMinimumPaymentsCents, emergencyReserveCents, monthsOfHistory }) {
  const safeIncome = Math.max(1, monthlyIncomeCents);
  const debtRatio = debtMinimumPaymentsCents / safeIncome;
  const reserveMonths = emergencyReserveCents / safeIncome;
  let score = 100;
  if (forecast.status === 'critical') score -= 35;
  else if (forecast.status === 'warning') score -= 18;
  score -= Math.min(30, Math.round(debtRatio * 60));
  if (reserveMonths < 1) score -= 18;
  else if (reserveMonths < 3) score -= 8;
  if (monthsOfHistory < 1) score -= 8;
  else if (monthsOfHistory < 3) score -= 3;
  const normalized = Math.max(0, Math.min(100, score));
  return {
    score: normalized,
    level: normalized >= 80 ? 'strong' : normalized >= 60 ? 'attention' : 'fragile',
    debtToIncomeRatio: debtRatio,
    reserveMonths,
    methodologyVersion: '1.0.0',
  };
}

function buildDashboard(space, firstDate) {
  const entries = space.entries.filter((entry) => entry.status === 'planned');
  const occurrences = expandRecurringEntries(entries, { from: firstDate, to: addDays(firstDate, 30) });
  const forecast7 = buildForecast({
    startingBalanceCents: space.currentBalanceCents,
    emergencyBufferCents: space.emergencyBufferCents,
    events: occurrences,
    horizonDays: 7,
    today: firstDate,
  });
  const forecast30 = buildForecast({
    startingBalanceCents: space.currentBalanceCents,
    emergencyBufferCents: space.emergencyBufferCents,
    events: occurrences,
    horizonDays: 30,
    today: firstDate,
  });
  const minimumDebtPayments = space.debts.filter((debt) => debt.status === 'active')
    .reduce((sum, debt) => sum + debt.minimumPaymentCents, 0);
  const reserve = space.goals.filter((goal) => goal.kind === 'emergency')
    .reduce((sum, goal) => sum + goal.currentCents, 0);
  return {
    generatedAt: now(),
    space: publicSpace(space),
    forecasts: { sevenDays: forecast7, thirtyDays: forecast30 },
    health: financialHealth({
      forecast: forecast30,
      monthlyIncomeCents: Math.max(1, forecast30.totalIncomeCents),
      debtMinimumPaymentsCents: minimumDebtPayments,
      emergencyReserveCents: reserve,
      monthsOfHistory: entries.length ? 1 : 0,
    }),
    debts: space.debts,
    goals: space.goals,
    upcoming: occurrences.slice(0, 12),
  };
}

function splitAmount(amountCents, installments) {
  const base = Math.floor(amountCents / installments);
  const remainder = amountCents % installments;
  return Array.from({ length: installments }, (_, index) => base + (index < remainder ? 1 : 0));
}

function decisionEvents({ title, amountCents, date, installments = 1 }) {
  return splitAmount(amountCents, installments).map((value, index) => ({
    id: `decision:${index + 1}`,
    title: installments === 1 ? title : `${title} · ${index + 1}/${installments}`,
    type: 'expense',
    amountCents: value,
    date: addMonthsClamped(date, index),
    category: 'decision',
  }));
}

function scenario(forecast, { date, installments, amountCents }) {
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

function simulateDecision(space, body, firstDate) {
  const title = requiredText(body.title, 'Decisão');
  const amountCents = integer(body.amountCents, 'Valor da decisão', { min: 1 });
  const desiredDate = ensureDate(body.desiredDate ?? firstDate, 'Data desejada');
  if (desiredDate < firstDate || desiredDate > addDays(firstDate, 365)) {
    throw localError('Escolha uma data dentro dos próximos 12 meses.');
  }
  const installments = integer(body.installments ?? 1, 'Parcelas', { min: 1, max: 12 });
  const events = expandRecurringEntries(
    space.entries.filter((entry) => entry.status === 'planned'),
    { from: firstDate, to: addDays(firstDate, 365) },
  );
  const forecast = (extra = []) => buildForecast({
    startingBalanceCents: space.currentBalanceCents,
    emergencyBufferCents: space.emergencyBufferCents,
    events: [...events, ...extra],
    horizonDays: 365,
    today: firstDate,
  });
  const baseline = forecast();
  const cashNowForecast = forecast(decisionEvents({ title, amountCents, date: firstDate }));
  const plannedForecast = forecast(decisionEvents({ title, amountCents, date: desiredDate }));
  const installmentForecast = forecast(decisionEvents({ title, amountCents, date: firstDate, installments }));
  let earliestSafeDate = null;
  if (!baseline.riskDate && !baseline.bufferRiskDate) {
    for (let day = 0; day <= 365; day += 1) {
      const candidate = addDays(firstDate, day);
      const candidateForecast = forecast(decisionEvents({ title, amountCents, date: candidate }));
      if (!candidateForecast.riskDate && !candidateForecast.bufferRiskDate) {
        earliestSafeDate = candidate;
        break;
      }
    }
  }
  const cashNow = scenario(cashNowForecast, { date: firstDate, installments: 1, amountCents });
  const planned = scenario(plannedForecast, { date: desiredDate, installments: 1, amountCents });
  const installmentPlan = scenario(installmentForecast, { date: firstDate, installments, amountCents });
  let recommendation = 'build_goal';
  let headline = 'Ainda não cabe com segurança.';
  let explanation = 'A compra reduziria o caixa abaixo da reserva nos cenários informados.';
  if (cashNow.safe) {
    recommendation = 'buy_now'; headline = 'Cabe agora sem tocar na reserva.';
    explanation = 'Mesmo depois da compra, as contas previstas e a reserva mínima continuam protegidas.';
  } else if (planned.safe && desiredDate !== firstDate) {
    recommendation = 'wait'; headline = `Esperar até ${desiredDate} protege melhor o caixa.`;
    explanation = 'Na data escolhida, o fluxo absorve a compra sem atravessar a reserva mínima.';
  } else if (installments > 1 && installmentPlan.safe) {
    recommendation = 'installments'; headline = `Parcelar em ${installments} vezes preserva a reserva.`;
    explanation = 'As parcelas cabem no fluxo projetado sem criar um dia de risco.';
  } else if (earliestSafeDate && earliestSafeDate !== firstDate) {
    recommendation = 'wait'; headline = `A primeira data segura estimada é ${earliestSafeDate}.`;
    explanation = 'Antes disso, a decisão encosta na reserva ou deixa alguma conta descoberta.';
  }
  const availableNowCents = baseline.safeToSpendCents;
  const remainingCents = Math.max(0, amountCents - availableNowCents);
  const monthsUntilDesired = Math.max(1, Math.ceil(
    (new Date(`${desiredDate}T00:00:00.000Z`) - new Date(`${firstDate}T00:00:00.000Z`)) / DAY_MS / 30,
  ));
  return {
    generatedAt: now(),
    decision: { title, amountCents, desiredDate, installments },
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
      horizonDays: 365,
      incomeConfidenceAdjusted: true,
      expensesCountedAtFullValue: true,
      emergencyBufferPreserved: true,
      simulationDoesNotMoveMoney: true,
      dataStoredOnDevice: true,
    },
  };
}

function parseMoney(text) {
  const match = text.match(/(?:r\$|\$|€|£)?\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (!match) return null;
  const raw = match[1].replace(/\s/g, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function parseNaturalEntry(text, firstDate) {
  const normalized = String(text ?? '').trim();
  if (normalized.length < 3 || normalized.length > 200) throw localError('Descreva o lançamento em até 200 caracteres.');
  const lower = normalized.toLocaleLowerCase('pt-BR');
  const amountCents = parseMoney(lower);
  if (!amountCents || amountCents <= 0) throw localError('Não consegui identificar o valor.', 422, 'PARSE_ERROR');
  const type = ['recebi', 'receber', 'salário', 'salario', 'freela', 'venda', 'entrada', 'income']
    .some((word) => lower.includes(word)) ? 'income' : 'expense';
  let date = firstDate;
  if (/amanh[ãa]|tomorrow/.test(lower)) date = addDays(firstDate, 1);
  const explicit = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  const dayOnly = lower.match(/\bdia\s+(\d{1,2})\b/);
  if (explicit) {
    const year = explicit[3]
      ? Number(explicit[3]) < 100 ? 2000 + Number(explicit[3]) : Number(explicit[3])
      : Number(firstDate.slice(0, 4));
    date = ensureDate(`${year}-${String(explicit[2]).padStart(2, '0')}-${String(explicit[1]).padStart(2, '0')}`);
  } else if (dayOnly) {
    const candidate = `${firstDate.slice(0, 8)}${String(dayOnly[1]).padStart(2, '0')}`;
    date = ensureDate(candidate >= firstDate
      ? candidate
      : `${addDays(`${firstDate.slice(0, 8)}01`, 35).slice(0, 8)}${String(dayOnly[1]).padStart(2, '0')}`);
  }
  const recurrence = /todo mês|mensal|monthly/.test(lower)
    ? 'monthly' : /toda semana|semanal|weekly/.test(lower) ? 'weekly' : 'none';
  const categoryRules = [
    ['housing', /aluguel|condomínio|condominio|moradia/],
    ['food', /mercado|comida|restaurante|almoço|almoco/],
    ['transport', /uber|combustível|combustivel|ônibus|onibus|transporte/],
    ['utilities', /luz|energia|água|agua|internet|telefone/],
    ['income', /salário|salario|freela|venda|receb/],
  ];
  const category = categoryRules.find(([, pattern]) => pattern.test(lower))?.[0] ?? 'other';
  const rawTitle = normalized
    .replace(/(?:r\$|\$|€|£)?\s*\d[\d.,\s]*/i, '')
    .replace(/\b(?:dia\s+)?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i, '')
    .replace(/\bdia\s+\d{1,2}\b/gi, '')
    .replace(/\b(?:todo mês|toda semana|mensalmente|mensal|semanalmente|semanal|monthly|weekly)\b/gi, '')
    .replace(/\b(?:receber|recebi|pagar|paguei)\b/gi, '')
    .replace(/\s+/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '').trim();
  return {
    title: rawTitle ? `${rawTitle.charAt(0).toLocaleUpperCase('pt-BR')}${rawTitle.slice(1)}` : type === 'income' ? 'Entrada' : 'Saída',
    type,
    amountCents,
    category,
    date,
    recurrence,
    confidence: type === 'income' && /freela|venda/.test(lower) ? 0.8 : 1,
  };
}

function parseBody(options) {
  try { return JSON.parse(options.body ?? '{}'); } catch { throw localError('Dados inválidos.', 400, 'INVALID_JSON'); }
}

export function hasGuestData(storage = globalThis.localStorage) {
  return Boolean(readStore(storage));
}

export function isGuestActive(storage = globalThis.localStorage) {
  return storage.getItem(ACTIVE_KEY) === 'true' && hasGuestData(storage);
}

export function setGuestActive(active, storage = globalThis.localStorage) {
  if (active) storage.setItem(ACTIVE_KEY, 'true');
  else storage.removeItem(ACTIVE_KEY);
}

export function startGuestSession(storage = globalThis.localStorage) {
  let data = readStore(storage);
  if (!data) {
    data = emptyStore();
    writeStore(storage, data);
  }
  setGuestActive(true, storage);
  return { user: { id: 'guest', name: 'Visitante', email: 'Somente neste navegador' }, spaces: data.spaces.map(publicSpace) };
}

export function clearGuestData(storage = globalThis.localStorage) {
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(ACTIVE_KEY);
}

export function exportGuestData(storage = globalThis.localStorage) {
  const data = requireStore(storage);
  return {
    exportVersion: 1,
    source: 'saldo-real-guest',
    exportedAt: now(),
    spaces: data.spaces.map(({ entries, debts, goals, ...space }) => ({ ...space, entries, debts, goals })),
  };
}

export function isGuestLocalPath(path) {
  const pathname = new URL(path, 'https://local.saldo-real.app').pathname;
  return pathname === '/api/entries/parse'
    || /^\/api\/spaces(?:\/[^/]+(?:\/(?:dashboard|entries|debts|goals|decisions\/simulate))?)?$/.test(pathname)
    || /^\/api\/(?:entries|debts|goals)\/[^/]+$/.test(pathname);
}

export function createGuestApi(storage = globalThis.localStorage) {
  return async function guestApi(path, options = {}) {
    const method = options.method ?? 'GET';
    const url = new URL(path, 'https://local.saldo-real.app');
    const { pathname } = url;
    const data = requireStore(storage);
    const body = parseBody(options);

    if (method === 'POST' && pathname === '/api/spaces') {
      if (data.spaces.length >= 5) throw localError('O modo sem conta permite até cinco espaços.');
      const timestamp = now();
      const space = {
        ...emptySpace(),
        id: uuid(),
        name: requiredText(body.name, 'Nome', 60),
        kind: oneOf(body.kind ?? 'personal', 'Tipo', ['personal', 'business']),
        currency: /^[A-Z]{3}$/.test(body.currency ?? 'BRL') ? body.currency ?? 'BRL' : 'BRL',
        locale: String(body.locale ?? 'pt-BR'),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.spaces.push(space); writeStore(storage, data);
      return { space: publicSpace(space) };
    }

    const spaceMatch = pathname.match(/^\/api\/spaces\/([^/]+)$/);
    if (spaceMatch && method === 'PATCH') {
      const space = findSpace(data, spaceMatch[1]);
      if (body.name !== undefined) space.name = requiredText(body.name, 'Nome', 60);
      if (body.kind !== undefined) space.kind = oneOf(body.kind, 'Tipo', ['personal', 'business']);
      if (body.currentBalanceCents !== undefined) space.currentBalanceCents = integer(body.currentBalanceCents, 'Saldo atual');
      if (body.emergencyBufferCents !== undefined) space.emergencyBufferCents = integer(body.emergencyBufferCents, 'Reserva mínima', { min: 0 });
      space.updatedAt = now(); writeStore(storage, data);
      return { space: publicSpace(space) };
    }

    const dashboardMatch = pathname.match(/^\/api\/spaces\/([^/]+)\/dashboard$/);
    if (dashboardMatch && method === 'GET') {
      return buildDashboard(findSpace(data, dashboardMatch[1]), ensureDate(url.searchParams.get('today') ?? today()));
    }

    const entriesMatch = pathname.match(/^\/api\/spaces\/([^/]+)\/entries$/);
    if (entriesMatch && method === 'GET') return { entries: findSpace(data, entriesMatch[1]).entries };
    if (entriesMatch && method === 'POST') {
      const space = findSpace(data, entriesMatch[1]);
      if (space.entries.length >= 500) throw localError('O modo sem conta permite até 500 lançamentos.');
      const timestamp = now();
      const entry = { id: uuid(), spaceId: space.id, ...entryInput(body), createdAt: timestamp, updatedAt: timestamp };
      space.entries.push(entry); writeStore(storage, data); return { entry };
    }
    if (pathname === '/api/entries/parse' && method === 'POST') {
      return { entry: parseNaturalEntry(body.text, ensureDate(body.today ?? today())) };
    }
    const entryMatch = pathname.match(/^\/api\/entries\/([^/]+)$/);
    if (entryMatch && method === 'DELETE') {
      const space = data.spaces.find((item) => item.entries.some((entry) => entry.id === entryMatch[1]));
      if (!space) throw localError('Lançamento não encontrado.', 404, 'NOT_FOUND');
      space.entries = space.entries.filter((entry) => entry.id !== entryMatch[1]); writeStore(storage, data); return { ok: true };
    }

    const debtsMatch = pathname.match(/^\/api\/spaces\/([^/]+)\/debts$/);
    if (debtsMatch && method === 'POST') {
      const space = findSpace(data, debtsMatch[1]);
      const timestamp = now();
      const debt = {
        id: uuid(), spaceId: space.id, name: requiredText(body.name, 'Dívida', 80),
        balanceCents: integer(body.balanceCents, 'Saldo da dívida', { min: 0 }),
        minimumPaymentCents: integer(body.minimumPaymentCents ?? 0, 'Pagamento mínimo', { min: 0 }),
        annualInterestRate: null, dueDay: null, status: 'active', createdAt: timestamp, updatedAt: timestamp,
      };
      space.debts.push(debt); writeStore(storage, data); return { debt };
    }
    const debtMatch = pathname.match(/^\/api\/debts\/([^/]+)$/);
    if (debtMatch && method === 'DELETE') {
      const space = data.spaces.find((item) => item.debts.some((debt) => debt.id === debtMatch[1]));
      if (!space) throw localError('Dívida não encontrada.', 404, 'NOT_FOUND');
      space.debts = space.debts.filter((debt) => debt.id !== debtMatch[1]); writeStore(storage, data); return { ok: true };
    }

    const goalsMatch = pathname.match(/^\/api\/spaces\/([^/]+)\/goals$/);
    if (goalsMatch && method === 'POST') {
      const space = findSpace(data, goalsMatch[1]);
      const timestamp = now();
      const goal = { id: uuid(), spaceId: space.id, ...goalInput(body), createdAt: timestamp, updatedAt: timestamp };
      space.goals.push(goal); writeStore(storage, data); return { goal };
    }
    const goalMatch = pathname.match(/^\/api\/goals\/([^/]+)$/);
    if (goalMatch && method === 'PATCH') {
      const space = data.spaces.find((item) => item.goals.some((goal) => goal.id === goalMatch[1]));
      const current = space?.goals.find((goal) => goal.id === goalMatch[1]);
      if (!space || !current) throw localError('Meta não encontrada.', 404, 'NOT_FOUND');
      Object.assign(current, goalInput(body, current), { updatedAt: now() }); writeStore(storage, data); return { goal: current };
    }
    if (goalMatch && method === 'DELETE') {
      const space = data.spaces.find((item) => item.goals.some((goal) => goal.id === goalMatch[1]));
      if (!space) throw localError('Meta não encontrada.', 404, 'NOT_FOUND');
      space.goals = space.goals.filter((goal) => goal.id !== goalMatch[1]); writeStore(storage, data); return { ok: true };
    }

    const decisionMatch = pathname.match(/^\/api\/spaces\/([^/]+)\/decisions\/simulate$/);
    if (decisionMatch && method === 'POST') {
      return { simulation: simulateDecision(findSpace(data, decisionMatch[1]), body, ensureDate(body.today ?? today())) };
    }

    throw localError('Recurso indisponível no modo sem conta.', 404, 'GUEST_ROUTE_NOT_FOUND');
  };
}

export const guestStorageKeys = { data: STORAGE_KEY, active: ACTIVE_KEY };
