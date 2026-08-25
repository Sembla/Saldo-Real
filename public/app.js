const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  authMode: 'login',
  user: null,
  spaces: [],
  spaceId: null,
  dashboard: null,
  entries: [],
  sources: [],
};

const categoryLabels = {
  housing: 'Moradia', food: 'Alimentação', transport: 'Transporte', utilities: 'Contas',
  health: 'Saúde', income: 'Renda', other: 'Outros',
};

const recurrenceLabels = {
  none: 'Único', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message ?? 'Não foi possível concluir a operação.');
    error.code = data.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function moneyToCents(value) {
  const raw = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw;
  return Math.round(Number(normalized) * 100);
}

function formatMoney(cents, currency = currentSpace()?.currency ?? 'BRL') {
  return new Intl.NumberFormat(navigator.language || 'pt-BR', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}

function formatDate(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat(navigator.language || 'pt-BR', {
    day: '2-digit', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function currentSpace() {
  return state.spaces.find((space) => space.id === state.spaceId);
}

let noticeTimer;
function notice(message, type = 'success') {
  const element = $('#notice');
  element.textContent = message;
  element.className = `notice ${type === 'error' ? 'error' : ''}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => element.classList.add('hidden'), 4_500);
}

function showAuth() {
  $('#auth-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
}

function showApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#user-name').textContent = state.user.name;
  $('#user-email').textContent = state.user.email;
  $('#user-avatar').textContent = state.user.name.slice(0, 1).toUpperCase();
  $('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());
  renderSpaceSelect();
}

function renderSpaceSelect() {
  const select = $('#space-select');
  select.innerHTML = state.spaces.map((space) => `<option value="${space.id}" ${space.id === state.spaceId ? 'selected' : ''}>${escapeHtml(space.name)} · ${space.kind === 'business' ? 'Negócio' : 'Pessoal'}</option>`).join('')
    + '<option value="__new">＋ Criar espaço</option>';
}

function setAuthMode(mode) {
  state.authMode = mode;
  const register = mode === 'register';
  $('#name-field').classList.toggle('hidden', !register);
  $('#password-hint').classList.toggle('hidden', !register);
  $('#auth-name').required = register;
  $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('#auth-title').textContent = register ? 'Crie sua conta' : 'Entre na sua conta';
  $('#auth-subtitle').textContent = register ? 'Comece pelo saldo que existe agora.' : 'Continue de onde parou.';
  $('#auth-action').textContent = register ? 'Criar conta' : 'Entrar';
  $('#auth-toggle').textContent = register ? 'Já tenho uma conta' : 'Ainda não tenho conta';
  $('#auth-error').textContent = '';
}

async function submitAuth(event) {
  event.preventDefault();
  const error = $('#auth-error');
  error.textContent = '';
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const body = {
      email: $('#auth-email').value,
      password: $('#auth-password').value,
      ...(state.authMode === 'register' ? { name: $('#auth-name').value } : {}),
    };
    const data = await api(`/api/auth/${state.authMode}`, { method: 'POST', body: JSON.stringify(body) });
    state.user = data.user;
    state.spaces = data.spaces;
    state.spaceId = data.spaces[0]?.id;
    showApp();
    await refreshAll();
  } catch (caught) {
    error.textContent = caught.message;
  } finally {
    button.disabled = false;
  }
}

function switchView(view) {
  $$('.view').forEach((element) => element.classList.toggle('active', element.id === `view-${view}`));
  $$('.nav-item').forEach((element) => element.classList.toggle('active', element.dataset.view === view));
  $('.sidebar').classList.remove('open');
  history.replaceState(null, '', `#${view}`);
}

function chartSvg(forecast) {
  const values = forecast.timeline.map((point) => point.balanceCents);
  values.push(forecast.emergencyBufferCents);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  const width = 760;
  const height = 230;
  const padding = { left: 8, right: 8, top: 15, bottom: 26 };
  const x = (index) => padding.left + index * ((width - padding.left - padding.right) / Math.max(1, forecast.timeline.length - 1));
  const y = (value) => padding.top + ((max - value) / range) * (height - padding.top - padding.bottom);
  const points = forecast.timeline.map((point, index) => `${x(index).toFixed(1)},${y(point.balanceCents).toFixed(1)}`);
  const area = `${x(0)},${height - padding.bottom} ${points.join(' ')} ${x(points.length - 1)},${height - padding.bottom}`;
  const bufferY = y(forecast.emergencyBufferCents);
  const labels = [0, 7, 14, 21, 30].filter((index) => forecast.timeline[index]).map((index) =>
    `<text class="chart-label" x="${x(index)}" y="${height - 5}" text-anchor="middle">${formatDate(forecast.timeline[index].date)}</text>`).join('');
  const grid = [0, .5, 1].map((factor) => {
    const gridY = padding.top + factor * (height - padding.top - padding.bottom);
    return `<line class="chart-grid" x1="${padding.left}" x2="${width - padding.right}" y1="${gridY}" y2="${gridY}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução do saldo nos próximos 30 dias">
    <defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c9f166" stop-opacity=".32"/><stop offset="1" stop-color="#c9f166" stop-opacity="0"/></linearGradient></defs>
    ${grid}<polygon class="chart-area" points="${area}"/><line class="chart-buffer" x1="${padding.left}" x2="${width - padding.right}" y1="${bufferY}" y2="${bufferY}"/>
    <polyline class="chart-line" points="${points.join(' ')}"/>${labels}</svg>`;
}

function empty(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function entryRow(entry, deletable = false) {
  const income = entry.type === 'income';
  return `<div class="list-row">
    <span class="list-icon ${income ? 'income' : ''}">${income ? '↗' : '↘'}</span>
    <span class="list-copy"><strong>${escapeHtml(entry.title)}</strong><small>${formatDate(entry.date)} · ${escapeHtml(categoryLabels[entry.category] ?? entry.category ?? 'Outros')}${entry.recurrence && entry.recurrence !== 'none' ? ` · ${escapeHtml(recurrenceLabels[entry.recurrence] ?? entry.recurrence)}` : ''}</small></span>
    <span class="list-value ${income ? 'income' : ''}">${income ? '+' : '−'} ${formatMoney(entry.amountCents)}</span>
    ${deletable ? `<button class="delete-button" data-delete-entry="${entry.id}" aria-label="Excluir ${escapeHtml(entry.title)}">×</button>` : ''}
  </div>`;
}

function renderDashboard() {
  const dashboard = state.dashboard;
  if (!dashboard) return;
  const forecast = dashboard.forecasts.thirtyDays;
  $('#safe-to-spend').textContent = formatMoney(forecast.safeToSpendCents);
  $('#current-balance').textContent = formatMoney(dashboard.space.currentBalanceCents);
  $('#ending-balance').textContent = formatMoney(forecast.endingBalanceCents);
  $('#buffer-label').textContent = `Reserva protegida: ${formatMoney(dashboard.space.emergencyBufferCents)}`;
  $('#flow-summary').textContent = `${formatMoney(forecast.totalIncomeCents)} entram · ${formatMoney(forecast.totalExpenseCents)} saem`;
  $('#health-score').textContent = `${dashboard.health.score}/100`;
  $('#health-label').textContent = dashboard.health.level === 'strong' ? 'Fluxo consistente' : dashboard.health.level === 'attention' ? 'Pede atenção' : 'Fluxo frágil';
  $('#safe-summary').textContent = forecast.riskDate
    ? `O caixa pode ficar negativo em ${formatDate(forecast.riskDate)}.`
    : forecast.bufferRiskDate ? `A reserva pode ser tocada em ${formatDate(forecast.bufferRiskDate)}.` : `Reserva preservada na projeção de 30 dias.`;
  const status = $('#forecast-status');
  status.className = `status-pill ${forecast.status}`;
  status.textContent = forecast.status === 'stable' ? 'Estável' : forecast.status === 'warning' ? 'Atenção' : 'Risco detectado';
  $('#forecast-chart').innerHTML = chartSvg(forecast);
  $('#upcoming-list').innerHTML = dashboard.upcoming.length
    ? dashboard.upcoming.slice(0, 6).map((entry) => entryRow(entry)).join('')
    : empty('Adicione entradas e contas para ver o futuro do caixa.');
}

function renderEntries() {
  $('#entries-list').innerHTML = state.entries.length
    ? state.entries.map((entry) => entryRow(entry, true)).join('')
    : empty('Nenhum lançamento neste espaço.');
}

function renderPlans() {
  const debts = state.dashboard?.debts ?? [];
  const goals = state.dashboard?.goals ?? [];
  $('#debts-list').innerHTML = debts.length ? debts.map((debt) => `<div class="list-row">
    <span class="list-icon">D</span><span class="list-copy"><strong>${escapeHtml(debt.name)}</strong><small>Mínimo: ${formatMoney(debt.minimumPaymentCents)}</small></span>
    <span class="list-value">${formatMoney(debt.balanceCents)}</span><button class="delete-button" data-delete-debt="${debt.id}" aria-label="Excluir dívida">×</button></div>`).join('') : empty('Cadastre compromissos para medir o peso no orçamento.');
  $('#goals-list').innerHTML = goals.length ? goals.map((goal) => {
    const progress = Math.min(100, Math.round(goal.currentCents / goal.targetCents * 100));
    return `<div class="list-row"><span class="list-icon income">${progress}%</span><span class="list-copy"><strong>${escapeHtml(goal.name)}</strong><small>${formatMoney(goal.currentCents)} acumulados</small></span>
      <span class="list-value">${formatMoney(goal.targetCents)}</span><button class="delete-button" data-delete-goal="${goal.id}" aria-label="Excluir meta">×</button></div>`;
  }).join('') : empty('Defina uma reserva ou um objetivo concreto.');
}

function renderSources() {
  $('#sources-list').innerHTML = state.sources.map((source) => `<article class="source-item"><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.institution)} · ${escapeHtml(source.title)}</a><p>${escapeHtml(source.purpose)}</p></article>`).join('');
}

async function refreshAll() {
  if (!state.spaceId) return;
  try {
    const [dashboard, entriesPayload, sourcePayload] = await Promise.all([
      api(`/api/spaces/${state.spaceId}/dashboard`),
      api(`/api/spaces/${state.spaceId}/entries`),
      state.sources.length ? Promise.resolve({ sources: state.sources }) : api('/api/sources'),
    ]);
    state.dashboard = dashboard;
    state.entries = entriesPayload.entries;
    state.sources = sourcePayload.sources;
    const index = state.spaces.findIndex((space) => space.id === dashboard.space.id);
    if (index >= 0) state.spaces[index] = dashboard.space;
    renderDashboard();
    renderEntries();
    renderPlans();
    renderSources();
    renderSpaceSelect();
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      showAuth();
    } else notice(error.message, 'error');
  }
}

async function saveEntry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $('[data-dialog-error]', form);
  error.textContent = '';
  const data = new FormData(form);
  try {
    await api(`/api/spaces/${state.spaceId}/entries`, {
      method: 'POST',
      body: JSON.stringify({
        title: data.get('title'), type: data.get('type'), amountCents: moneyToCents(data.get('amount')),
        date: data.get('date'), category: data.get('category'), recurrence: data.get('recurrence'),
        confidence: Number(data.get('confidence')),
      }),
    });
    $('#entry-dialog').close();
    form.reset();
    notice('Lançamento incluído na projeção.');
    await refreshAll();
  } catch (caught) { error.textContent = caught.message; }
}

async function quickEntry(event) {
  event.preventDefault();
  const input = $('#quick-entry');
  if (!input.value.trim()) return;
  try {
    const parsed = await api('/api/entries/parse', { method: 'POST', body: JSON.stringify({ text: input.value }) });
    await api(`/api/spaces/${state.spaceId}/entries`, { method: 'POST', body: JSON.stringify(parsed.entry) });
    input.value = '';
    notice(`“${parsed.entry.title}” foi interpretado e adicionado.`);
    await refreshAll();
  } catch (error) { notice(error.message, 'error'); }
}

async function saveBalance(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $('[data-dialog-error]', form);
  const data = new FormData(form);
  try {
    const payload = await api(`/api/spaces/${state.spaceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ currentBalanceCents: moneyToCents(data.get('balance')), emergencyBufferCents: moneyToCents(data.get('buffer')) }),
    });
    const index = state.spaces.findIndex((space) => space.id === payload.space.id);
    state.spaces[index] = payload.space;
    $('#balance-dialog').close();
    notice('Saldo e reserva atualizados.');
    await refreshAll();
  } catch (caught) { error.textContent = caught.message; }
}

async function saveDebt(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await api(`/api/spaces/${state.spaceId}/debts`, { method: 'POST', body: JSON.stringify({
      name: data.get('name'), balanceCents: moneyToCents(data.get('balance')), minimumPaymentCents: moneyToCents(data.get('minimum')),
    }) });
    form.reset(); notice('Dívida adicionada ao diagnóstico.'); await refreshAll();
  } catch (error) { notice(error.message, 'error'); }
}

async function saveGoal(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await api(`/api/spaces/${state.spaceId}/goals`, { method: 'POST', body: JSON.stringify({
      name: data.get('name'), targetCents: moneyToCents(data.get('target')), kind: data.get('kind'),
    }) });
    form.reset(); notice('Meta adicionada.'); await refreshAll();
  } catch (error) { notice(error.message, 'error'); }
}

async function loadContext() {
  const container = $('#context-results');
  container.innerHTML = empty('Consultando a fonte oficial...');
  try {
    const data = await api(`/api/context/${$('#country-select').value}`);
    if (data.unavailable) { container.innerHTML = empty(data.reason); return; }
    const indicators = Object.values(data.indicators ?? {}).filter(Boolean);
    container.innerHTML = indicators.map((indicator) => `<article class="context-card"><span>${escapeHtml(indicator.label)}</span><strong>${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(indicator.value)} ${escapeHtml(indicator.unit)}</strong><small>Ano: ${escapeHtml(indicator.year)} · World Bank</small></article>`).join('')
      + (data.centralBank ? `<article class="context-card"><span>Selic diária</span><strong>${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(data.centralBank.value)}%</strong><small>${escapeHtml(data.centralBank.referenceDate)} · Banco Central</small></article>` : '');
  } catch (error) { container.innerHTML = empty(error.message); }
}

async function deleteEntity(button, kind) {
  const id = button.dataset[`delete${kind[0].toUpperCase()}${kind.slice(1)}`];
  const labels = { entry: 'este lançamento', debt: 'esta dívida', goal: 'esta meta' };
  if (!window.confirm(`Excluir ${labels[kind]}?`)) return;
  try {
    await api(`/api/${kind === 'entry' ? 'entries' : `${kind}s`}/${id}`, { method: 'DELETE' });
    notice('Item excluído.'); await refreshAll();
  } catch (error) { notice(error.message, 'error'); }
}

function openEntryDialog() {
  $('#entry-form [name="date"]').value = new Date().toISOString().slice(0, 10);
  $('#entry-dialog').showModal();
}

function openBalanceDialog() {
  const space = currentSpace();
  $('#balance-form [name="balance"]').value = (space.currentBalanceCents / 100).toFixed(2).replace('.', ',');
  $('#balance-form [name="buffer"]').value = (space.emergencyBufferCents / 100).toFixed(2).replace('.', ',');
  $('#balance-dialog').showModal();
}

async function createSpace() {
  const name = window.prompt('Nome do novo espaço (ex.: Meu negócio)');
  if (!name?.trim()) { renderSpaceSelect(); return; }
  const business = window.confirm('Este espaço é de um negócio?');
  try {
    const data = await api('/api/spaces', { method: 'POST', body: JSON.stringify({
      name: name.trim(), kind: business ? 'business' : 'personal', currency: currentSpace()?.currency ?? 'BRL',
    }) });
    state.spaces.push(data.space); state.spaceId = data.space.id; renderSpaceSelect(); await refreshAll();
    notice('Novo espaço criado e separado dos demais.');
  } catch (error) { notice(error.message, 'error'); renderSpaceSelect(); }
}

async function initialize() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  setAuthMode('login');
  try {
    const data = await api('/api/auth/me');
    state.user = data.user; state.spaces = data.spaces; state.spaceId = data.spaces[0]?.id;
    showApp();
    switchView(location.hash.slice(1) || 'dashboard');
    await refreshAll();
  } catch { showAuth(); }
}

$('#auth-toggle').addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login'));
$('#auth-form').addEventListener('submit', submitAuth);
$('#logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); state.user = null; showAuth(); });
$$('[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
$$('[data-view-link]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.viewLink)));
$('#menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#space-select').addEventListener('change', async (event) => {
  if (event.target.value === '__new') return createSpace();
  state.spaceId = event.target.value; await refreshAll();
});
$('#new-entry').addEventListener('click', openEntryDialog);
$$('[data-open-entry]').forEach((button) => button.addEventListener('click', openEntryDialog));
$('#edit-balance').addEventListener('click', openBalanceDialog);
$('#entry-form').addEventListener('submit', saveEntry);
$('#balance-form').addEventListener('submit', saveBalance);
$('#quick-entry-form').addEventListener('submit', quickEntry);
$('#debt-form').addEventListener('submit', saveDebt);
$('#goal-form').addEventListener('submit', saveGoal);
$('#load-context').addEventListener('click', loadContext);
document.addEventListener('click', (event) => {
  const entry = event.target.closest('[data-delete-entry]');
  const debt = event.target.closest('[data-delete-debt]');
  const goal = event.target.closest('[data-delete-goal]');
  if (entry) deleteEntity(entry, 'entry');
  if (debt) deleteEntity(debt, 'debt');
  if (goal) deleteEntity(goal, 'goal');
});

initialize();
