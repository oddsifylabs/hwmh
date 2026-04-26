/* ============================================================
   HWMH Dashboard JS
   Hermes Workers Management Hub — Oddsify Labs
   ============================================================ */

const API = {
  status:    '/status',
  workers:   '/workers',
  tasks:     '/api/tasks',
  command:   '/command',
  reasoning: '/api/reasoning',
  decisions: '/api/decisions',
  errors:    '/api/errors',
  history:   '/api/history',
  system:    '/api/system',
  config:    '/api/config',
  clear:     (id) => `/api/workers/${id}/clear`,
  reset:     (id) => `/api/workers/${id}/reset`,
};

let currentTab = 'dashboard';
let chatMessages = [];
let chatUnread = 0;
let chatPollInterval = null;

/* ---------- Tabs ---------- */
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (nav) nav.classList.add('active');

  if (tab === 'chat') {
    chatUnread = 0;
    updateChatBadge();
  }

  // Auto-load tab content
  if (tab === 'workers') loadWorkersDetail();
  if (tab === 'tasks')   loadTasks();
  if (tab === 'chat')    loadChat();
  if (tab === 'reasoning') loadReasoning();
  if (tab === 'decisions') loadDecisions();
  if (tab === 'errors')  loadErrors();
  if (tab === 'system')  loadSystem();
  if (tab === 'config')  loadConfig();
}

/* ---------- Fetch helpers ---------- */
async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function post(url, body = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ---------- Dashboard ---------- */
async function refreshAll(force = false) {
  try {
    const data = await get(API.workers);
    renderWorkers(data.workers, data.status, data.queues);
    renderMetrics(data.status, data.queues);
    if (currentTab === 'tasks') loadTasks();
    if (currentTab === 'system') loadSystem();
  } catch (err) {
    console.error('Refresh failed:', err);
    toast('Refresh failed: ' + err.message, 'error');
  }
}

function renderMetrics(status, queues) {
  const workers = Object.keys(status || {});
  const online = workers.filter(w => status[w].status !== 'offline').length;
  const total  = workers.length;
  const active = workers.filter(w => status[w].status === 'working').length;
  const queueDepth = Object.values(queues || {}).reduce((a, b) => a + b, 0);

  document.getElementById('metric-workers').textContent   = online;
  document.getElementById('badge-workers').textContent    = `${online}/${total}`;
  document.getElementById('badge-workers-nav').textContent = total;
  document.getElementById('metric-active').textContent    = active;
  document.getElementById('badge-active').textContent     = active;
  document.getElementById('metric-queue').textContent     = queueDepth;
  document.getElementById('badge-queue').textContent      = queueDepth;

  // Completed today — approximate from history if available
  const completedToday = (global.taskHistory || []).filter(t => {
    const d = new Date(t.timestamp);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  document.getElementById('metric-completed').textContent  = completedToday;
  document.getElementById('badge-completed').textContent   = completedToday;
}

/* ---------- Workers ---------- */
const WORKER_META = {
  sophia: { icon: '👑', color: '#6366f1' },
  iris:   { icon: '📋', color: '#10b981' },
  pheme:  { icon: '📢', color: '#f59e0b' },
  kairos: { icon: '🎯', color: '#ef4444' }
};

function renderWorkers(workers, status, queues) {
  const grid = document.getElementById('worker-grid');
  const detail = document.getElementById('worker-grid-detail');
  if (!grid && !detail) return;

  const html = Object.entries(workers).map(([id, info]) => {
    const st = status[id] || {};
    const meta = WORKER_META[id] || { icon: '🤖', color: '#94a3b8' };
    const isOnline = st.status !== 'offline';
    const statusLabel = st.status || 'idle';
    const lastSeen = st.lastSeen ? timeAgo(st.lastSeen) : 'Never';
    const qlen = queues[id] || 0;

    return `
      <div class="worker-card ${isOnline ? 'online' : 'offline'}">
        <div class="worker-header">
          <div class="worker-avatar" style="background:${meta.color}">${meta.icon}</div>
          <div class="worker-info">
            <div class="worker-name">${info.name}</div>
            <div class="worker-role">${info.role || info.description || ''}</div>
          </div>
          <span class="worker-status-badge ${isOnline ? 'badge-success' : 'badge-danger'}">${isOnline ? 'Online' : 'Offline'}</span>
        </div>
        <div class="worker-stats">
          <div><strong>Status:</strong> ${statusLabel}</div>
          <div><strong>Queue:</strong> ${qlen}</div>
          <div><strong>Last seen:</strong> ${lastSeen}</div>
        </div>
        <div class="worker-actions">
          <button class="btn btn-sm btn-secondary" onclick="clearQueue('${id}')">Clear Queue</button>
          <button class="btn btn-sm btn-secondary" onclick="resetWorker('${id}')">Reset</button>
        </div>
      </div>
    `;
  }).join('');

  if (grid) grid.innerHTML = html;
  if (detail) detail.innerHTML = html;
}

function renderWorkersDetail() { refreshAll(); }

async function clearQueue(workerId) {
  try {
    const res = await post(API.clear(workerId));
    toast(`Cleared ${res.cleared} tasks from ${workerId}`, 'success');
    refreshAll();
  } catch (err) {
    toast('Clear failed: ' + err.message, 'error');
  }
}

async function resetWorker(workerId) {
  try {
    const res = await post(API.reset(workerId));
    toast(res.message, 'success');
    refreshAll();
  } catch (err) {
    toast('Reset failed: ' + err.message, 'error');
  }
}

async function clearAllQueues() {
  for (const id of Object.keys(WORKER_META)) {
    try { await post(API.clear(id)); } catch (_) {}
  }
  toast('All queues cleared', 'success');
  refreshAll();
}

/* ---------- Tasks ---------- */
async function loadTasks() {
  try {
    const data = await get(API.tasks);
    renderTasks(data.tasks || []);
  } catch (err) {
    console.error('Tasks load failed:', err);
  }
}

function renderTasks(tasks) {
  const tbody = document.getElementById('task-table-full-body');
  if (!tbody) return;

  const workerFilter = document.getElementById('task-filter-worker')?.value || '';
  const statusFilter = document.getElementById('task-filter-status')?.value || '';

  const filtered = tasks.filter(t => {
    if (workerFilter && t.workerId !== workerFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td><code>${t.id?.slice(0,8) || '—'}</code></td>
      <td>${t.workerId}</td>
      <td><span class="badge badge-${t.status === 'completed' ? 'success' : t.status === 'failed' ? 'danger' : t.status === 'active' ? 'info' : 'warning'}">${t.status}</span></td>
      <td>${escapeHtml(t.description || '')}</td>
      <td>${t.timestamp ? timeAgo(t.timestamp) : '—'}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="viewTask('${t.id}')">View</button></td>
    </tr>
  `).join('');

  document.getElementById('badge-tasks-nav').textContent = tasks.filter(t => t.status === 'active' || t.status === 'queued').length;
}

function renderTasksFiltered() { loadTasks(); }

function viewTask(id) {
  toast('Task detail view coming soon — ID: ' + id.slice(0,8), 'info');
}

/* ---------- Chat / History ---------- */
async function loadChat() {
  try {
    const data = await get(API.history);
    const history = data.history || [];

    // Track unread
    if (currentTab !== 'chat' && history.length > chatMessages.length) {
      chatUnread += history.length - chatMessages.length;
      updateChatBadge();
    }

    chatMessages = history;
    renderChat(history);
  } catch (err) {
    console.error('Chat load failed:', err);
  }
}

function renderChat(messages) {
  const list = document.getElementById('chat-list');
  if (!list) return;

  if (!messages.length) {
    list.innerHTML = '<div class="chat-empty">No messages yet. Send a command to get started.</div>';
    return;
  }

  list.innerHTML = messages.map(m => {
    const meta = WORKER_META[m.workerId] || { icon: '🤖', color: '#94a3b8' };
    const time = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
    const resultHtml = m.result
      ? `<div class="chat-result">${escapeHtml(String(m.result)).replace(/\n/g, '<br>')}</div>`
      : '';
    const errorHtml = m.error
      ? `<div class="chat-error">⚠️ ${escapeHtml(String(m.error))}</div>`
      : '';

    return `
      <div class="chat-bubble">
        <div class="chat-avatar" style="background:${meta.color}">${meta.icon}</div>
        <div class="chat-body">
          <div class="chat-meta">
            <strong>${escapeHtml(WORKER_META[m.workerId]?.name || m.workerId)}</strong>
            <span class="chat-time">${time}</span>
            <span class="badge badge-${m.status === 'completed' ? 'success' : m.status === 'failed' ? 'danger' : 'info'}">${m.status}</span>
          </div>
          <div class="chat-text">${escapeHtml(m.description || '')}</div>
          ${resultHtml}
          ${errorHtml}
        </div>
      </div>
    `;
  }).join('');

  // Auto-scroll to bottom
  list.scrollTop = list.scrollHeight;
}

function updateChatBadge() {
  const badge = document.getElementById('badge-chat-nav');
  if (!badge) return;
  badge.textContent = chatUnread;
  badge.style.display = chatUnread > 0 ? 'inline-flex' : 'none';
}

/* Start chat polling */
function startChatPolling() {
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(() => {
    loadChat();
  }, 3000);
}

/* ---------- Reasoning ---------- */
async function loadReasoning() {
  try {
    const data = await get(API.reasoning);
    const list = document.getElementById('reasoning-list');
    if (!list) return;
    const items = data.reasoning || [];
    list.innerHTML = items.length
      ? items.map(r => `
        <div class="log-entry">
          <div class="log-time">${new Date(r.timestamp).toLocaleString()}</div>
          <div class="log-msg">${escapeHtml(r.message || JSON.stringify(r))}</div>
        </div>`).join('')
      : '<div class="info-banner">No reasoning logs yet.</div>';
  } catch (err) { console.error(err); }
}

/* ---------- Decisions ---------- */
async function loadDecisions() {
  try {
    const data = await get(API.decisions);
    const list = document.getElementById('decisions-list');
    if (!list) return;
    const items = data.decisions || [];
    list.innerHTML = items.length
      ? items.map(d => `
        <div class="log-entry">
          <div class="log-time">${new Date(d.timestamp).toLocaleString()}</div>
          <div class="log-msg">${escapeHtml(d.message || JSON.stringify(d))}</div>
        </div>`).join('')
      : '<div class="info-banner">No decisions logged yet.</div>';
  } catch (err) { console.error(err); }
}

/* ---------- Errors ---------- */
async function loadErrors() {
  try {
    const data = await get(API.errors);
    const tbody = document.getElementById('errors-table-body');
    if (!tbody) return;
    const items = data.errors || [];
    tbody.innerHTML = items.map(e => `
      <tr>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td>${e.agent || e.workerId || '—'}</td>
        <td><span class="badge badge-${e.level === 'error' ? 'danger' : 'warning'}">${e.level}</span></td>
        <td>${escapeHtml(e.message || '')}</td>
      </tr>
    `).join('');
    document.getElementById('badge-errors-nav').textContent = items.length;
  } catch (err) { console.error(err); }
}

/* ---------- System ---------- */
async function loadSystem() {
  try {
    const data = await get(API.system);
    const grid = document.getElementById('system-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="card"><div class="card-header"><span class="card-title">Node Version</span></div><div class="card-value">${data.nodeVersion}</div></div>
        <div class="card"><div class="card-header"><span class="card-title">Platform</span></div><div class="card-value">${data.platform}</div></div>
        <div class="card"><div class="card-header"><span class="card-title">Uptime</span></div><div class="card-value">${formatDuration(data.uptime)}</div></div>
        <div class="card"><div class="card-header"><span class="card-title">Environment</span></div><div class="card-value">${data.env}</div></div>
      `;
    }
    const mem = document.getElementById('memory-card');
    if (mem && data.memory) {
      mem.innerHTML = `
        <div class="grid grid-4">
          <div><strong>RSS</strong><br>${formatBytes(data.memory.rss)}</div>
          <div><strong>Heap Total</strong><br>${formatBytes(data.memory.heapTotal)}</div>
          <div><strong>Heap Used</strong><br>${formatBytes(data.memory.heapUsed)}</div>
          <div><strong>External</strong><br>${formatBytes(data.memory.external)}</div>
        </div>
      `;
    }
  } catch (err) { console.error(err); }
}

/* ---------- Config ---------- */
async function loadConfig() {
  try {
    const data = await get(API.config);
    const block = document.getElementById('config-block');
    if (block) block.textContent = JSON.stringify(data, null, 2);
  } catch (err) { console.error(err); }
}

/* ---------- Command ---------- */
async function sendCommand() {
  const input = document.getElementById('command-input');
  const btn   = document.getElementById('cmd-btn');
  const text  = input.value.trim();
  if (!text) return;

  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await post(API.command, { command: text, source: 'dashboard' });
    toast('Command sent: ' + res.parsed?.description?.slice(0, 60), 'success');
    input.value = '';
    // Refresh relevant tabs
    setTimeout(() => {
      refreshAll();
      if (currentTab === 'chat') loadChat();
    }, 500);
  } catch (err) {
    toast('Send failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
}

/* ---------- Utilities ---------- */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/* ---------- Toasts ---------- */
function toast(message, type = 'info') {
  const container = document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  refreshAll();
  startChatPolling();

  // Periodic full refresh every 15s
  setInterval(() => refreshAll(), 15000);
});
