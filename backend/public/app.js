const API = '/api';
let token = localStorage.getItem('token') || null;

const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

function authHeaders() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ---------- LOGIN ----------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no login.');

    token = data.token;
    localStorage.setItem('token', token);
    showDashboard();
  } catch (err) {
    loginError.textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null;
  localStorage.removeItem('token');
  dashboardScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboardScreen.classList.remove('hidden');
  loadEmployees();
  loadHistory();
}

// ---------- RELÓGIO ----------
function tickClock() {
  document.getElementById('clock').textContent = new Date().toLocaleString('pt-BR');
}
setInterval(tickClock, 1000);
tickClock();

// ---------- LISTA DE FUNCIONÁRIOS ----------
async function loadEmployees() {
  const res = await fetch(`${API}/employees`, { headers: authHeaders() });
  if (res.status === 401) return logoutForced();
  const rows = await res.json();
  renderEmployees(rows);
}

function renderEmployees(rows) {
  const list = document.getElementById('employee-list');
  list.innerHTML = '';

  let liberados = 0, bloqueados = 0;

  rows.forEach((r) => {
    if (r.liberado) liberados++; else bloqueados++;

    const row = document.createElement('div');
    row.className = 'employee-item';
    const statusClass = r.liberado ? 'on' : 'off';
    const lastSeen = r.last_seen_at ? `visto ${timeAgo(r.last_seen_at)}` : 'nunca conectou';

    row.innerHTML = `
      <div class="employee-row">
        <div class="employee-info">
          <span class="status-dot ${statusClass}"></span>
          <div class="employee-names">
            <span class="employee-name">${escapeHtml(r.employee_name)}</span>
            <span class="computer-name">${escapeHtml(r.computer_name || '—')}</span>
          </div>
        </div>
        <div class="employee-actions">
          <span class="last-seen">${lastSeen}</span>
          <button class="key-btn" data-key="${escapeHtml(r.api_key || '')}" title="Ver/copiar chave de API">🔑</button>
          <button class="sites-btn" data-computer="${r.computer_id}" title="Gerenciar sites bloqueados">🌐 Sites</button>
          <span class="status-badge ${statusClass}">${r.liberado ? 'LIBERADO' : 'BLOQUEADO'}</span>
          <button class="toggle-btn ${r.liberado ? 'to-bloquear' : 'to-liberar'}" data-computer="${r.computer_id}" data-liberado="${!r.liberado}">
            ${r.liberado ? 'Bloquear' : 'Liberar'}
          </button>
          <button class="delete-btn" data-employee="${r.employee_id}" title="Remover funcionário">✕</button>
        </div>
      </div>
      <div class="sites-panel hidden" data-computer="${r.computer_id}">
        <div class="sites-chips"></div>
        <form class="sites-add-form">
          <input type="text" placeholder="ex: instagram.com" class="sites-input" />
          <button type="submit" class="btn-primary small">Bloquear site</button>
        </form>
      </div>
    `;
    list.appendChild(row);
  });

  document.getElementById('count-total').textContent = rows.length;
  document.getElementById('count-liberado').textContent = liberados;
  document.getElementById('count-bloqueado').textContent = bloqueados;

  list.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleStatus(btn.dataset.computer, btn.dataset.liberado === 'true'));
  });
  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteEmployee(btn.dataset.employee));
  });
  list.querySelectorAll('.key-btn').forEach((btn) => {
    btn.addEventListener('click', () => showKey(btn));
  });
  list.querySelectorAll('.sites-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleSitesPanel(btn.dataset.computer));
  });
}

function showKey(btn) {
  const key = btn.dataset.key;
  if (!key) return;

  navigator.clipboard.writeText(key).catch(() => {});

  const original = btn.textContent;
  btn.textContent = key;
  btn.classList.add('key-revealed');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('key-revealed');
  }, 4000);
}

// ---------- SITES BLOQUEADOS ----------
function toggleSitesPanel(computerId) {
  const panel = document.querySelector(`.sites-panel[data-computer="${computerId}"]`);
  if (!panel) return;

  const isHidden = panel.classList.contains('hidden');
  document.querySelectorAll('.sites-panel').forEach((p) => p.classList.add('hidden'));

  if (isHidden) {
    panel.classList.remove('hidden');
    loadSites(computerId);

    const form = panel.querySelector('.sites-add-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = panel.querySelector('.sites-input');
      const domain = input.value;
      if (!domain.trim()) return;
      await fetch(`${API}/employees/computers/${computerId}/sites`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ domain }),
      });
      input.value = '';
      loadSites(computerId);
    };
  }
}

async function loadSites(computerId) {
  const panel = document.querySelector(`.sites-panel[data-computer="${computerId}"]`);
  const chipsBox = panel.querySelector('.sites-chips');
  chipsBox.innerHTML = '<span class="sites-loading">Carregando...</span>';

  const res = await fetch(`${API}/employees/computers/${computerId}/sites`, { headers: authHeaders() });
  const sites = await res.json();

  if (sites.length === 0) {
    chipsBox.innerHTML = '<span class="sites-empty">Nenhum site bloqueado nesse computador.</span>';
    return;
  }

  chipsBox.innerHTML = sites.map((s) => `
    <span class="site-chip">${escapeHtml(s.domain)} <button class="site-chip-remove" data-site="${s.id}" data-computer="${computerId}">✕</button></span>
  `).join('');

  chipsBox.querySelectorAll('.site-chip-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`${API}/employees/computers/${btn.dataset.computer}/sites/${btn.dataset.site}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      loadSites(btn.dataset.computer);
    });
  });
}

async function toggleStatus(computerId, liberado) {
  await fetch(`${API}/employees/computers/${computerId}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ liberado }),
  });
  loadEmployees();
  loadHistory();
}

async function deleteEmployee(employeeId) {
  if (!confirm('Remover este funcionário e o computador associado?')) return;
  await fetch(`${API}/employees/${employeeId}`, { method: 'DELETE', headers: authHeaders() });
  loadEmployees();
}

// ---------- NOVO FUNCIONÁRIO ----------
const modal = document.getElementById('new-employee-modal');
const newForm = document.getElementById('new-employee-form');
const resultBox = document.getElementById('new-employee-result');

document.getElementById('new-employee-btn').addEventListener('click', () => {
  newForm.reset();
  newForm.classList.remove('hidden');
  resultBox.classList.add('hidden');
  modal.classList.remove('hidden');
});
document.getElementById('cancel-new-employee').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('close-result').addEventListener('click', () => {
  modal.classList.add('hidden');
  loadEmployees();
});

newForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const employee_name = document.getElementById('new-employee-name').value;
  const computer_name = document.getElementById('new-computer-name').value;

  const res = await fetch(`${API}/employees`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ employee_name, computer_name }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Erro ao criar funcionário.'); return; }

  document.getElementById('new-api-key').textContent = data.api_key;
  newForm.classList.add('hidden');
  resultBox.classList.remove('hidden');
});

document.getElementById('copy-api-key').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('new-api-key').textContent);
});

// ---------- HISTÓRICO ----------
document.getElementById('toggle-history').addEventListener('click', () => {
  document.getElementById('history-list').classList.toggle('hidden');
});

async function loadHistory() {
  const res = await fetch(`${API}/employees/history/all`, { headers: authHeaders() });
  if (!res.ok) return;
  const rows = await res.json();
  const box = document.getElementById('history-list');
  box.innerHTML = rows.map((h) => `
    <div>[${new Date(h.created_at).toLocaleString('pt-BR')}] ${escapeHtml(h.admin_username || '—')} ${h.action === 'liberado' ? 'liberou' : 'bloqueou'} ${escapeHtml(h.computer_name)} (${escapeHtml(h.employee_name)})</div>
  `).join('');
}

// ---------- HELPERS ----------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso + 'Z').getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `há ${hrs}h`;
}
function logoutForced() {
  token = null;
  localStorage.removeItem('token');
  dashboardScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

// ---------- AUTO-REFRESH ----------
setInterval(() => { if (token) loadEmployees(); }, 15000);

// ---------- INICIALIZAÇÃO ----------
if (token) showDashboard();
