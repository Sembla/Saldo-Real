import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

import { createDatabase } from './db/database.js';
import { createRepository } from './db/repository.js';
import { buildForecast } from './domain/forecast.js';
import { calculateFinancialHealth } from './domain/health-score.js';
import { expandRecurringEntries } from './domain/recurrence.js';
import { AppError, assert } from './lib/errors.js';
import * as validate from './lib/validation.js';
import {
  createSessionToken,
  expiredSessionCookie,
  hashPassword,
  hashSessionToken,
  parseCookies,
  sessionCookie,
  verifyPassword,
} from './security/auth.js';
import { getCountryContext, OFFICIAL_SOURCES } from './data/sources.js';

const PUBLIC_DIR = resolve(process.cwd(), 'public');
const MAX_BODY_BYTES = 1_000_000;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function addDays(date, days) {
  return new Date(new Date(`${date}T00:00:00.000Z`).valueOf() + days * 86_400_000)
    .toISOString().slice(0, 10);
}

function responseHeaders(requestId) {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Request-Id': requestId,
  };
}

function sendJson(res, status, data, headers = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

async function readJson(req) {
  const contentType = String(req.headers['content-type'] ?? '');
  if (!contentType.startsWith('application/json')) {
    throw new AppError('Envie o corpo como application/json.', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  const declaredSize = Number(req.headers['content-length'] ?? 0);
  if (declaredSize > MAX_BODY_BYTES) throw new AppError('Corpo muito grande.', 413, 'PAYLOAD_TOO_LARGE');

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new AppError('Corpo muito grande.', 413, 'PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new AppError('JSON inválido.', 400, 'INVALID_JSON');
  }
}

function spaceInput(body, current = {}) {
  return {
    name: validate.requiredText(body.name ?? current.name, 'Nome', { max: 60 }),
    kind: validate.oneOf(body.kind ?? current.kind ?? 'personal', 'Tipo', ['personal', 'business']),
    currency: validate.currency(body.currency ?? current.currency ?? 'BRL'),
    locale: validate.requiredText(body.locale ?? current.locale ?? 'pt-BR', 'Idioma', { min: 2, max: 12 }),
    currentBalanceCents: validate.integer(
      body.currentBalanceCents ?? current.currentBalanceCents ?? 0,
      'Saldo atual',
    ),
    emergencyBufferCents: validate.integer(
      body.emergencyBufferCents ?? current.emergencyBufferCents ?? 0,
      'Reserva mínima',
      { min: 0 },
    ),
  };
}

function entryInput(body, current = {}) {
  const type = validate.oneOf(body.type ?? current.type, 'Tipo', ['income', 'expense']);
  return {
    title: validate.requiredText(body.title ?? current.title, 'Descrição', { max: 100 }),
    type,
    amountCents: validate.integer(body.amountCents ?? current.amountCents, 'Valor', { min: 1 }),
    category: validate.requiredText(body.category ?? current.category ?? 'other', 'Categoria', { max: 40 }),
    date: validate.isoDate(body.date ?? current.date),
    recurrence: validate.oneOf(
      body.recurrence ?? current.recurrence ?? 'none',
      'Recorrência',
      ['none', 'weekly', 'monthly', 'yearly'],
    ),
    recurrenceEnd: body.recurrenceEnd === null
      ? null
      : body.recurrenceEnd
        ? validate.isoDate(body.recurrenceEnd, 'Fim da recorrência')
        : current.recurrenceEnd ?? null,
    confidence: type === 'income'
      ? validate.numberValue(body.confidence ?? current.confidence ?? 1, 'Confiança', { min: 0, max: 1 })
      : 1,
    status: validate.oneOf(
      body.status ?? current.status ?? 'planned',
      'Status',
      ['planned', 'paid', 'cancelled'],
    ),
    notes: String(body.notes ?? current.notes ?? '').trim().slice(0, 500),
  };
}

function debtInput(body) {
  return {
    name: validate.requiredText(body.name, 'Dívida', { max: 80 }),
    balanceCents: validate.integer(body.balanceCents, 'Saldo da dívida', { min: 0 }),
    minimumPaymentCents: validate.integer(body.minimumPaymentCents ?? 0, 'Pagamento mínimo', { min: 0 }),
    annualInterestRate: body.annualInterestRate === null || body.annualInterestRate === undefined
      ? null
      : validate.numberValue(body.annualInterestRate, 'Juros anual', { min: 0, max: 10_000 }),
    dueDay: body.dueDay === null || body.dueDay === undefined
      ? null
      : validate.integer(body.dueDay, 'Dia do vencimento', { min: 1, max: 31 }),
    status: validate.oneOf(body.status ?? 'active', 'Status', ['active', 'paid', 'paused']),
  };
}

function goalInput(body) {
  return {
    name: validate.requiredText(body.name, 'Meta', { max: 80 }),
    targetCents: validate.integer(body.targetCents, 'Valor da meta', { min: 1 }),
    currentCents: validate.integer(body.currentCents ?? 0, 'Valor acumulado', { min: 0 }),
    targetDate: body.targetDate ? validate.isoDate(body.targetDate, 'Data-alvo') : null,
    kind: validate.oneOf(body.kind ?? 'general', 'Tipo', ['emergency', 'general', 'purchase', 'debt']),
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

function parseNaturalEntry(text, today) {
  const normalized = String(text ?? '').trim();
  assert(normalized.length >= 3 && normalized.length <= 200, 'Descreva o lançamento em até 200 caracteres.', 422, 'VALIDATION_ERROR');
  const lower = normalized.toLocaleLowerCase('pt-BR');
  const amountCents = parseMoney(lower);
  assert(amountCents && amountCents > 0, 'Não consegui identificar o valor.', 422, 'PARSE_ERROR');

  const incomeWords = ['recebi', 'receber', 'salário', 'salario', 'freela', 'venda', 'entrada', 'income'];
  const type = incomeWords.some((word) => lower.includes(word)) ? 'income' : 'expense';
  let date = today;
  if (/amanh[ãa]|tomorrow/.test(lower)) date = addDays(today, 1);
  const explicit = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  const dayOnly = lower.match(/\bdia\s+(\d{1,2})\b/);
  if (explicit) {
    const year = explicit[3]
      ? Number(explicit[3]) < 100 ? 2000 + Number(explicit[3]) : Number(explicit[3])
      : Number(today.slice(0, 4));
    date = `${year}-${String(explicit[2]).padStart(2, '0')}-${String(explicit[1]).padStart(2, '0')}`;
    validate.isoDate(date);
  } else if (dayOnly) {
    const candidate = `${today.slice(0, 8)}${String(dayOnly[1]).padStart(2, '0')}`;
    date = candidate >= today ? candidate : `${addDays(`${today.slice(0, 8)}01`, 35).slice(0, 8)}${String(dayOnly[1]).padStart(2, '0')}`;
    validate.isoDate(date);
  }
  const recurrence = /todo mês|mensal|monthly/.test(lower)
    ? 'monthly'
    : /toda semana|semanal|weekly/.test(lower) ? 'weekly' : 'none';
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
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .trim();
  const title = rawTitle
    ? `${rawTitle.charAt(0).toLocaleUpperCase('pt-BR')}${rawTitle.slice(1)}`
    : type === 'income' ? 'Entrada' : 'Saída';
  return { title, type, amountCents, category, date, recurrence, confidence: type === 'income' && /freela|venda/.test(lower) ? 0.8 : 1 };
}

function requireAuth(req, repository) {
  const token = parseCookies(req.headers.cookie).saldo_session;
  if (!token) throw new AppError('Faça login para continuar.', 401, 'UNAUTHENTICATED');
  const session = repository.findSession(hashSessionToken(token));
  if (!session) throw new AppError('Sessão inválida ou expirada.', 401, 'UNAUTHENTICATED');
  repository.touchSession(session.id);
  return {
    sessionId: session.id,
    token,
    user: { id: session.user_id, email: session.email, name: session.name, locale: session.locale },
  };
}

function buildDashboard(repository, userId, spaceId, today) {
  const space = repository.getSpace(userId, spaceId);
  if (!space) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
  const entries = repository.listEntries(userId, spaceId, { from: today, to: addDays(today, 30) })
    .filter((entry) => entry.status === 'planned');
  const occurrences = expandRecurringEntries(entries, { from: today, to: addDays(today, 30) });
  const forecast7 = buildForecast({
    startingBalanceCents: space.currentBalanceCents,
    emergencyBufferCents: space.emergencyBufferCents,
    events: occurrences,
    horizonDays: 7,
    today,
  });
  const forecast30 = buildForecast({
    startingBalanceCents: space.currentBalanceCents,
    emergencyBufferCents: space.emergencyBufferCents,
    events: occurrences,
    horizonDays: 30,
    today,
  });
  const debts = repository.listDebts(userId, spaceId);
  const goals = repository.listGoals(userId, spaceId);
  const minimumDebtPayments = debts.filter((debt) => debt.status === 'active')
    .reduce((sum, debt) => sum + debt.minimumPaymentCents, 0);
  const monthlyIncome = Math.max(1, forecast30.totalIncomeCents);
  const reserve = goals.filter((goal) => goal.kind === 'emergency')
    .reduce((sum, goal) => sum + goal.currentCents, 0);
  const health = calculateFinancialHealth({
    forecast: forecast30,
    monthlyIncomeCents: monthlyIncome,
    debtMinimumPaymentsCents: minimumDebtPayments,
    emergencyReserveCents: reserve,
    monthsOfHistory: entries.length ? 1 : 0,
  });

  return {
    generatedAt: new Date().toISOString(),
    space,
    forecasts: { sevenDays: forecast7, thirtyDays: forecast30 },
    health,
    debts,
    goals,
    upcoming: occurrences.slice(0, 12),
    disclaimer: 'O Saldo Real é educativo e não oferece recomendação de investimento, crédito ou produto financeiro.',
  };
}

async function serveStatic(req, res, pathname, headers) {
  let requestedPath = pathname === '/' ? '/index.html' : pathname;
  try { requestedPath = decodeURIComponent(requestedPath); } catch { return false; }
  let filePath = resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!(filePath === PUBLIC_DIR || filePath.startsWith(`${PUBLIC_DIR}${sep}`))) return false;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (extname(requestedPath)) return false;
    filePath = resolve(PUBLIC_DIR, 'index.html');
  }
  const stat = statSync(filePath);
  res.writeHead(200, {
    ...headers,
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
    'Content-Length': stat.size,
  });
  createReadStream(filePath).pipe(res);
  return true;
}

export function createApp(config) {
  const db = createDatabase(config.databasePath);
  const repository = createRepository(db);
  const loginAttempts = new Map();

  async function handler(req, res) {
    const requestId = randomUUID();
    const headers = responseHeaders(requestId);
    Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
    const url = new URL(req.url, config.appOrigin);
    const { pathname } = url;

    try {
      if (MUTATING_METHODS.has(req.method) && pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (origin && origin !== config.appOrigin) {
          throw new AppError('Origem da requisição não permitida.', 403, 'ORIGIN_REJECTED');
        }
      }

      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
      }

      if (req.method === 'POST' && pathname === '/api/auth/register') {
        const body = await readJson(req);
        const userEmail = validate.email(body.email);
        const userPassword = validate.password(body.password);
        const name = validate.requiredText(body.name, 'Nome', { min: 2, max: 80 });
        if (repository.findUserByEmail(userEmail)) throw new AppError('Este e-mail já está cadastrado.', 409, 'EMAIL_EXISTS');
        const locale = validate.requiredText(body.locale ?? 'pt-BR', 'Idioma', { min: 2, max: 12 });
        const user = repository.transaction(() => {
          const created = repository.createUser({ email: userEmail, name, passwordHash: hashPassword(userPassword), locale });
          repository.createSpace(created.id, {
            name: 'Pessoal', kind: 'personal', currency: body.currency ? validate.currency(body.currency) : 'BRL',
            locale, currentBalanceCents: 0, emergencyBufferCents: 0,
          });
          repository.audit({ userId: created.id, action: 'user.registered', entityType: 'user', entityId: created.id });
          return created;
        });
        const token = createSessionToken();
        const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3_600_000).toISOString();
        repository.createSession({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt });
        return sendJson(res, 201, { user, spaces: repository.listSpaces(user.id) }, {
          'Set-Cookie': sessionCookie(token, { secure: config.cookieSecure, maxAgeSeconds: config.sessionTtlHours * 3600 }),
        });
      }

      if (req.method === 'POST' && pathname === '/api/auth/login') {
        const key = req.socket.remoteAddress ?? 'unknown';
        const attempt = loginAttempts.get(key) ?? { count: 0, resetAt: Date.now() + 60_000 };
        if (Date.now() > attempt.resetAt) { attempt.count = 0; attempt.resetAt = Date.now() + 60_000; }
        if (attempt.count >= 10) throw new AppError('Muitas tentativas. Aguarde um minuto.', 429, 'RATE_LIMITED');
        const body = await readJson(req);
        const user = repository.findUserByEmail(validate.email(body.email));
        if (!user || !verifyPassword(String(body.password ?? ''), user.password_hash)) {
          attempt.count += 1;
          loginAttempts.set(key, attempt);
          throw new AppError('E-mail ou senha incorretos.', 401, 'INVALID_CREDENTIALS');
        }
        loginAttempts.delete(key);
        const token = createSessionToken();
        const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3_600_000).toISOString();
        repository.createSession({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt });
        return sendJson(res, 200, { user: repository.findUserById(user.id), spaces: repository.listSpaces(user.id) }, {
          'Set-Cookie': sessionCookie(token, { secure: config.cookieSecure, maxAgeSeconds: config.sessionTtlHours * 3600 }),
        });
      }

      if (req.method === 'POST' && pathname === '/api/auth/logout') {
        const token = parseCookies(req.headers.cookie).saldo_session;
        if (token) repository.deleteSession(hashSessionToken(token));
        return sendJson(res, 200, { ok: true }, { 'Set-Cookie': expiredSessionCookie({ secure: config.cookieSecure }) });
      }

      if (req.method === 'GET' && pathname === '/api/auth/me') {
        const auth = requireAuth(req, repository);
        return sendJson(res, 200, { user: auth.user, spaces: repository.listSpaces(auth.user.id) });
      }

      if (req.method === 'GET' && pathname === '/api/sources') {
        return sendJson(res, 200, { sources: OFFICIAL_SOURCES, updatedAt: '2026-08-25' });
      }

      const countryMatch = pathname.match(/^\/api\/context\/([A-Za-z]{2})$/);
      if (req.method === 'GET' && countryMatch) {
        requireAuth(req, repository);
        const context = await getCountryContext({
          repository,
          countryCode: validate.country(countryMatch[1]),
          outboundEnabled: config.outboundDataEnabled,
        });
        return sendJson(res, 200, context);
      }

      const auth = pathname.startsWith('/api/') ? requireAuth(req, repository) : null;

      if (req.method === 'GET' && pathname === '/api/spaces') {
        return sendJson(res, 200, { spaces: repository.listSpaces(auth.user.id) });
      }
      if (req.method === 'POST' && pathname === '/api/spaces') {
        const space = repository.createSpace(auth.user.id, spaceInput(await readJson(req)));
        repository.audit({ userId: auth.user.id, action: 'space.created', entityType: 'space', entityId: space.id });
        return sendJson(res, 201, { space });
      }

      const spaceMatch = pathname.match(/^\/api\/spaces\/([0-9a-f-]+)$/i);
      if (spaceMatch && req.method === 'PATCH') {
        const current = repository.getSpace(auth.user.id, spaceMatch[1]);
        if (!current) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
        const space = repository.updateSpace(auth.user.id, current.id, spaceInput(await readJson(req), current));
        return sendJson(res, 200, { space });
      }
      if (spaceMatch && req.method === 'DELETE') {
        assert(repository.listSpaces(auth.user.id).length > 1, 'Mantenha pelo menos um espaço.', 409, 'LAST_SPACE');
        if (!repository.deleteSpace(auth.user.id, spaceMatch[1])) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
        return sendJson(res, 200, { ok: true });
      }

      const entriesMatch = pathname.match(/^\/api\/spaces\/([0-9a-f-]+)\/entries$/i);
      if (entriesMatch && req.method === 'GET') {
        const entries = repository.listEntries(auth.user.id, entriesMatch[1], {
          from: url.searchParams.get('from') || undefined,
          to: url.searchParams.get('to') || undefined,
        });
        if (!entries) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
        return sendJson(res, 200, { entries });
      }
      if (entriesMatch && req.method === 'POST') {
        const entry = repository.createEntry(auth.user.id, entriesMatch[1], entryInput(await readJson(req)));
        if (!entry) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
        repository.audit({ userId: auth.user.id, action: 'entry.created', entityType: 'entry', entityId: entry.id });
        return sendJson(res, 201, { entry });
      }

      if (req.method === 'POST' && pathname === '/api/entries/parse') {
        const body = await readJson(req);
        return sendJson(res, 200, { entry: parseNaturalEntry(body.text, body.today ? validate.isoDate(body.today) : new Date().toISOString().slice(0, 10)) });
      }

      const entryMatch = pathname.match(/^\/api\/entries\/([0-9a-f-]+)$/i);
      if (entryMatch && req.method === 'PATCH') {
        const current = repository.getEntry(auth.user.id, entryMatch[1]);
        if (!current) throw new AppError('Lançamento não encontrado.', 404, 'NOT_FOUND');
        return sendJson(res, 200, { entry: repository.updateEntry(auth.user.id, current.id, entryInput(await readJson(req), current)) });
      }
      if (entryMatch && req.method === 'DELETE') {
        if (!repository.deleteEntry(auth.user.id, entryMatch[1])) throw new AppError('Lançamento não encontrado.', 404, 'NOT_FOUND');
        return sendJson(res, 200, { ok: true });
      }

      const debtsMatch = pathname.match(/^\/api\/spaces\/([0-9a-f-]+)\/debts$/i);
      if (debtsMatch && req.method === 'GET') {
        const debts = repository.listDebts(auth.user.id, debtsMatch[1]);
        if (!debts) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
        return sendJson(res, 200, { debts });
      }
      if (debtsMatch && req.method === 'POST') {
        const debt = repository.createDebt(auth.user.id, debtsMatch[1], debtInput(await readJson(req)));
        if (!debt) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
        return sendJson(res, 201, { debt });
      }
      const debtMatch = pathname.match(/^\/api\/debts\/([0-9a-f-]+)$/i);
      if (debtMatch && req.method === 'DELETE') {
        if (!repository.deleteDebt(auth.user.id, debtMatch[1])) throw new AppError('Dívida não encontrada.', 404, 'NOT_FOUND');
        return sendJson(res, 200, { ok: true });
      }

      const goalsMatch = pathname.match(/^\/api\/spaces\/([0-9a-f-]+)\/goals$/i);
      if (goalsMatch && req.method === 'GET') {
        const goals = repository.listGoals(auth.user.id, goalsMatch[1]);
        if (!goals) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
        return sendJson(res, 200, { goals });
      }
      if (goalsMatch && req.method === 'POST') {
        const goal = repository.createGoal(auth.user.id, goalsMatch[1], goalInput(await readJson(req)));
        if (!goal) throw new AppError('Espaço não encontrado.', 404, 'NOT_FOUND');
        return sendJson(res, 201, { goal });
      }
      const goalMatch = pathname.match(/^\/api\/goals\/([0-9a-f-]+)$/i);
      if (goalMatch && req.method === 'DELETE') {
        if (!repository.deleteGoal(auth.user.id, goalMatch[1])) throw new AppError('Meta não encontrada.', 404, 'NOT_FOUND');
        return sendJson(res, 200, { ok: true });
      }

      const dashboardMatch = pathname.match(/^\/api\/spaces\/([0-9a-f-]+)\/dashboard$/i);
      if (dashboardMatch && req.method === 'GET') {
        const today = url.searchParams.get('today')
          ? validate.isoDate(url.searchParams.get('today'))
          : new Date().toISOString().slice(0, 10);
        return sendJson(res, 200, buildDashboard(repository, auth.user.id, dashboardMatch[1], today));
      }

      if (pathname.startsWith('/api/')) throw new AppError('Rota não encontrada.', 404, 'NOT_FOUND');
      if (await serveStatic(req, res, pathname, headers)) return undefined;
      throw new AppError('Arquivo não encontrado.', 404, 'NOT_FOUND');
    } catch (error) {
      const known = error instanceof AppError;
      if (!known) console.error(`[${requestId}]`, error);
      return sendJson(res, known ? error.status : 500, {
        error: {
          code: known ? error.code : 'INTERNAL_ERROR',
          message: known ? error.message : 'Erro interno. Tente novamente.',
          ...(known && error.details ? { details: error.details } : {}),
          requestId,
        },
      });
    }
  }

  return { handler, repository, close: () => repository.close() };
}
