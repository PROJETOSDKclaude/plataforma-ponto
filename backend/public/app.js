const API = '/api';
let token = localStorage.getItem('token') || null;
let profilesCache = [];

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
  loadProfiles().then(loadEmployees);
  loadHistory();
}

// ---------- ABAS ----------
const tabEmployeesBtn = document.getElementById('tab-employees');
const tabProfilesBtn = document.getElementById('tab-profiles');
const employeesView = document.getElementById('employees-view');
const profilesView = document.getElementById('profiles-view');

tabEmployeesBtn.addEventListener('click', () => switchTab('employees'));
tabProfilesBtn.addEventListener('click', () => switchTab('profiles'));

function switchTab(tab) {
  const isEmployees = tab === 'employees';
  employeesView.classList.toggle('hidden', !isEmployees);
  profilesView.classList.toggle('hidden', isEmployees);
  tabEmployeesBtn.classList.toggle('active', isEmployees);
  tabProfilesBtn.classList.toggle('active', !isEmployees);
  if (!isEmployees) loadProfiles();
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
          <select class="profile-select" data-employee="${r.employee_id}" title="Perfil de acesso">
            <option value="">Sem perfil</option>
            ${profileOptionsHtml(r.profile_id)}
          </select>
          <button class="exceptions-btn" data-employee="${r.employee_id}" title="Exceções de sites deste funcionário">⚙ Exceções</button>
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
      <div class="exceptions-panel hidden" data-employee="${r.employee_id}">
        <div class="exceptions-chips"></div>
        <form class="exceptions-add-form">
          <input type="text" placeholder="ex: youtube.com" class="sites-input exceptions-input" />
          <select class="exceptions-type">
            <option value="add">Liberar (extra)</option>
            <option value="remove">Remover (bloquear)</option>
          </select>
          <button type="submit" class="btn-primary small">Salvar exceção</button>
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
  list.querySelectorAll('.profile-select').forEach((sel) => {
    sel.addEventListener('change', () => updateEmployeeProfile(sel.dataset.employee, sel.value));
  });
  list.querySelectorAll('.exceptions-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleExceptionsPanel(btn.dataset.employee));
  });
}

function profileOptionsHtml(selectedId) {
  return profilesCache.map((p) => `
    <option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(p.name)}</option>
  `).join('');
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
  document.querySelectorAll('.exceptions-panel').forEach((p) => p.classList.add('hidden'));

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

// ---------- PERFIL DO FUNCIONÁRIO ----------
async function updateEmployeeProfile(employeeId, profileId) {
  await fetch(`${API}/profiles/employees/${employeeId}/profile`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ profile_id: profileId ? Number(profileId) : null }),
  });
}

// ---------- EXCEÇÕES DO FUNCIONÁRIO ----------
function toggleExceptionsPanel(employeeId) {
  const panel = document.querySelector(`.exceptions-panel[data-employee="${employeeId}"]`);
  if (!panel) return;

  const isHidden = panel.classList.contains('hidden');
  document.querySelectorAll('.exceptions-panel').forEach((p) => p.classList.add('hidden'));
  document.querySelectorAll('.sites-panel').forEach((p) => p.classList.add('hidden'));

  if (isHidden) {
    panel.classList.remove('hidden');
    loadExceptions(employeeId);

    const form = panel.querySelector('.exceptions-add-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = panel.querySelector('.exceptions-input');
      const typeSelect = panel.querySelector('.exceptions-type');
      const domain = input.value;
      if (!domain.trim()) return;
      await fetch(`${API}/employees/${employeeId}/exceptions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ domain, type: typeSelect.value }),
      });
      input.value = '';
      loadExceptions(employeeId);
    };
  }
}

async function loadExceptions(employeeId) {
  const panel = document.querySelector(`.exceptions-panel[data-employee="${employeeId}"]`);
  const chipsBox = panel.querySelector('.exceptions-chips');
  chipsBox.innerHTML = '<span class="sites-loading">Carregando...</span>';

  const res = await fetch(`${API}/employees/${employeeId}/exceptions`, { headers: authHeaders() });
  const rows = await res.json();

  if (rows.length === 0) {
    chipsBox.innerHTML = '<span class="sites-empty">Nenhuma exceção cadastrada.</span>';
    return;
  }

  chipsBox.innerHTML = rows.map((r) => `
    <span class="site-chip ${r.type === 'add' ? 'ok-chip' : ''}">
      ${r.type === 'add' ? '＋ liberado' : '－ removido'}: ${escapeHtml(r.domain)}
      <button class="site-chip-remove" data-employee="${employeeId}" data-domain="${escapeHtml(r.domain)}">✕</button>
    </span>
  `).join('');

  chipsBox.querySelectorAll('.site-chip-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`${API}/employees/${btn.dataset.employee}/exceptions/${encodeURIComponent(btn.dataset.domain)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      loadExceptions(btn.dataset.employee);
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

// ---------- PERFIS DE ACESSO ----------
async function loadProfiles() {
  const res = await fetch(`${API}/profiles`, { headers: authHeaders() });
  if (res.status === 401) return logoutForced();
  const data = await res.json();
  profilesCache = data;
  renderProfiles(data);
  return data;
}

function renderProfiles(profiles) {
  const list = document.getElementById('profiles-list');
  list.innerHTML = '';

  if (profiles.length === 0) {
    list.innerHTML = '<p class="sites-empty">Nenhum perfil criado ainda.</p>';
    return;
  }

  profiles.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'profile-item';
    item.innerHTML = `
      <div class="profile-row">
        <span class="profile-name">${escapeHtml(p.name)}</span>
        <span class="profile-site-count">${p.sites.length} site${p.sites.length === 1 ? '' : 's'} liberado${p.sites.length === 1 ? '' : 's'}</span>
      </div>
      <div class="sites-chips">
        ${p.sites.length === 0
          ? '<span class="sites-empty">Nenhum domínio liberado neste perfil.</span>'
          : p.sites.map((d) => `
            <span class="site-chip ok-chip">${escapeHtml(d)} <button class="site-chip-remove" data-profile="${p.id}" data-domain="${escapeHtml(d)}">✕</button></span>
          `).join('')}
      </div>
      <form class="sites-add-form profile-sites-add-form" data-profile="${p.id}">
        <input type="text" placeholder="ex: instagram.com" class="sites-input" />
        <button type="submit" class="btn-primary small">Adicionar domínio</button>
      </form>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.profile-sites-add-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('.sites-input');
      const domain = input.value;
      if (!domain.trim()) return;
      await fetch(`${API}/profiles/${form.dataset.profile}/sites`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ domain }),
      });
      input.value = '';
      loadProfiles();
    });
  });

  list.querySelectorAll('.site-chip-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`${API}/profiles/${btn.dataset.profile}/sites/${encodeURIComponent(btn.dataset.domain)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      loadProfiles();
    });
  });
}

document.getElementById('new-profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('new-profile-name');
  const name = nameInput.value;
  if (!name.trim()) return;

  const res = await fetch(`${API}/profiles`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Erro ao criar perfil.'); return; }

  nameInput.value = '';
  loadProfiles();
});

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
