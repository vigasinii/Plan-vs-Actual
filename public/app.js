const API = '/api';
let TOKEN = localStorage.getItem('token') || null;
let USER = JSON.parse(localStorage.getItem('user') || 'null');
let CATEGORIES = [];
let isSignup = false;
let chart = null;

function fmt(n) {
  if (n === null || n === undefined) return 'N/A';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function showAuthed() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userBox').classList.remove('hidden');
  document.getElementById('emailLabel').textContent = USER.email;
  loadCategories().then(() => {
    setDefaultMonths();
    loadPlans();
    loadActuals();
    loadLocks();
  });
}

function setDefaultMonths() {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ['planMonth', 'actualMonth', 'lockMonth'].forEach(id => {
    const el = document.getElementById(id);
    if (!el.value) el.value = cur;
  });
}

document.getElementById('toggleAuth').addEventListener('click', () => {
  isSignup = !isSignup;
  document.getElementById('authTitle').textContent = isSignup ? 'Create account' : 'Sign in';
  document.getElementById('authSubmit').textContent = isSignup ? 'Sign up' : 'Sign in';
  document.getElementById('toggleAuth').parentElement.firstChild.textContent = isSignup ? 'Already have an account? ' : 'No account? ';
  document.getElementById('toggleAuth').textContent = isSignup ? 'Sign in' : 'Create one';
  document.getElementById('authError').textContent = '';
});

document.getElementById('authSubmit').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';
  try {
    const data = await api(isSignup ? '/auth/signup' : '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    TOKEN = data.token;
    USER = data.user;
    localStorage.setItem('token', TOKEN);
    localStorage.setItem('user', JSON.stringify(USER));
    showAuthed();
  } catch (e) {
    errEl.textContent = e.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.reload();
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
  });
});

async function loadCategories() {
  CATEGORIES = await api('/categories');
  ['planCategory', 'actualCategory'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  });
}

document.getElementById('savePlan').addEventListener('click', async () => {
  const category_id = Number(document.getElementById('planCategory').value);
  const month = document.getElementById('planMonth').value;
  const amount = Number(document.getElementById('planAmount').value);
  const msg = document.getElementById('planMsg');
  msg.textContent = ''; msg.className = 'msg';
  if (!month || Number.isNaN(amount)) { msg.textContent = 'Enter a month and amount.'; msg.classList.add('error'); return; }
  try {
    await api('/plans', { method: 'POST', body: JSON.stringify({ category_id, month, amount }) });
    msg.textContent = 'Saved.'; msg.classList.add('success');
    document.getElementById('planAmount').value = '';
    loadPlans();
  } catch (e) {
    msg.textContent = e.message; msg.classList.add('error');
  }
});

async function loadPlans() {
  const rows = await api('/plans');
  const wrap = document.getElementById('plansTableWrap');
  if (!rows.length) { wrap.innerHTML = '<p class="empty">No plans yet.</p>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>Month</th><th>Category</th><th class="num">Target</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="mono">${r.month}</td><td>${r.category_name}</td><td class="num mono">${fmt(r.amount)}</td></tr>`).join('')}
  </tbody></table>`;
}

document.getElementById('saveActual').addEventListener('click', async () => {
  const category_id = Number(document.getElementById('actualCategory').value);
  const month = document.getElementById('actualMonth').value;
  const amount = Number(document.getElementById('actualAmount').value);
  const note = document.getElementById('actualNote').value.trim();
  const msg = document.getElementById('actualMsg');
  msg.textContent = ''; msg.className = 'msg';
  if (!month || Number.isNaN(amount)) { msg.textContent = 'Enter a month and amount.'; msg.classList.add('error'); return; }
  try {
    await api('/actuals', { method: 'POST', body: JSON.stringify({ category_id, month, amount, note }) });
    msg.textContent = 'Logged.'; msg.classList.add('success');
    document.getElementById('actualAmount').value = '';
    document.getElementById('actualNote').value = '';
    loadActuals();
  } catch (e) {
    msg.textContent = e.message; msg.classList.add('error');
  }
});

async function deleteActual(id) {
  try {
    await api(`/actuals/${id}`, { method: 'DELETE' });
    loadActuals();
  } catch (e) {
    alert(e.message);
  }
}

async function loadActuals() {
  const rows = await api('/actuals');
  const wrap = document.getElementById('actualsTableWrap');
  if (!rows.length) { wrap.innerHTML = '<p class="empty">No actuals logged yet.</p>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>Month</th><th>Category</th><th class="num">Amount</th><th>Note</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="mono">${r.month}</td><td>${r.category_name}</td><td class="num mono">${fmt(r.amount)}</td><td class="dim">${r.note || ''}</td><td><button class="delBtn" onclick="deleteActual(${r.id})">✕</button></td></tr>`).join('')}
  </tbody></table>`;
}

document.getElementById('importCsv').addEventListener('click', async () => {
  const csv = document.getElementById('csvInput').value;
  const msg = document.getElementById('csvMsg');
  msg.textContent = ''; msg.className = 'msg';
  if (!csv.trim()) { msg.textContent = 'Paste CSV data first.'; msg.classList.add('error'); return; }
  try {
    const data = await api('/actuals/import', { method: 'POST', body: JSON.stringify({ csv }) });
    if (data.failed > 0) {
      msg.className = 'msg error';
      msg.innerHTML = `Imported ${data.imported}, ${data.failed} failed: ` +
        data.errors.map(e => `line ${e.line}: ${e.error}`).join('; ');
    } else {
      msg.className = 'msg success';
      msg.textContent = `Imported ${data.imported} rows.`;
    }
    loadActuals();
  } catch (e) {
    msg.textContent = e.message; msg.classList.add('error');
  }
});

document.getElementById('addLock').addEventListener('click', async () => {
  const month = document.getElementById('lockMonth').value;
  if (!month) return;
  await api('/locks', { method: 'POST', body: JSON.stringify({ month }) });
  loadLocks();
});

async function unlock(month) {
  await api(`/locks/${month}`, { method: 'DELETE' });
  loadLocks();
}

async function loadLocks() {
  const months = await api('/locks');
  const wrap = document.getElementById('locksWrap');
  if (!months.length) { wrap.innerHTML = '<p class="empty">No locked months.</p>'; return; }
  wrap.innerHTML = months.map(m => `<div class="lockChip"><span class="mono">${m}</span><button onclick="unlock('${m}')" title="Unlock">✕</button></div>`).join('');
}

document.getElementById('runReport').addEventListener('click', runReport);

async function runReport() {
  const start = document.getElementById('reportStart').value;
  const end = document.getElementById('reportEnd').value;
  const wrap = document.getElementById('reportTableWrap');
  if (!start || !end) return;
  try {
    const data = await api(`/report?start=${start}&end=${end}`);
    renderReportTable(data.rows);
    renderChart(data.chart);
  } catch (e) {
    wrap.innerHTML = `<p class="empty">${e.message}</p>`;
  }
}

function renderReportTable(rows) {
  const wrap = document.getElementById('reportTableWrap');
  if (!rows.length) { wrap.innerHTML = '<p class="empty">No data in this range yet.</p>'; return; }
  wrap.innerHTML = `<table><thead><tr>
    <th>Category</th><th>Month</th><th class="num">Plan</th><th class="num">Actual</th><th class="num">Variance</th><th class="num">Variance %</th>
  </tr></thead><tbody>
  ${rows.map(r => {
    const varClass = r.variance > 0 ? 'pos' : r.variance < 0 ? 'neg' : '';
    const actualCell = r.actual_missing ? '<span class="dim">N/A</span>' : fmt(r.actual);
    const pctCell = r.variance_pct === null ? '<span class="dim">N/A</span>' : `${r.variance_pct >= 0 ? '+' : ''}${r.variance_pct.toFixed(2)}%`;
    return `<tr>
      <td>${r.category_name}</td>
      <td class="mono">${r.month}${r.locked ? '<span class="lockBadge">LOCKED</span>' : ''}</td>
      <td class="num mono">${r.plan === null ? '<span class="dim">N/A</span>' : fmt(r.plan)}</td>
      <td class="num mono">${actualCell}</td>
      <td class="num mono ${varClass}">${fmt(r.variance)}</td>
      <td class="num mono ${varClass}">${pctCell}</td>
    </tr>`;
  }).join('')}
  </tbody></table>`;
}

function renderChart(chartData) {
  const ctx = document.getElementById('varianceChart');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.map(d => d.month),
      datasets: [
        { label: 'Plan', data: chartData.map(d => d.plan), backgroundColor: '#3a4556' },
        { label: 'Actual', data: chartData.map(d => d.actual), backgroundColor: '#e8a33d' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8b95a3' } } },
      scales: {
        x: { ticks: { color: '#8b95a3' }, grid: { color: '#2b3441' } },
        y: { ticks: { color: '#8b95a3' }, grid: { color: '#2b3441' } },
      },
    },
  });
}

if (TOKEN && USER) {
  showAuthed();
}
