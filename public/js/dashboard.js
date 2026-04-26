/**
 * HWMH Dashboard Controller
 * Full-featured command center with tabs, controls, and real-time data.
 */

const WORKER_EMOJIS = { sophia: '👤', iris: '📚', pheme: '📢', kairos: '📊' };
const WORKER_NAMES = { sophia: 'Sophia Hermes', iris: 'Iris Hermes', pheme: 'Pheme Hermes', kairos: 'Kairos Hermes' };

let allTasksCache = [];
let allWorkersCache = {};
let currentTab = 'dashboard';
let completedCount = 0;
let errorCount = 0;

// ===================== TABS =====================
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add('active');

  if (tab === 'reasoning') loadReasoning();
  if (tab === 'decisions') loadDecisions();
  if (tab === 'errors') loadErrors();
  if (tab === 'chat') loadChat();
  if (tab === 'system') loadSystem();
  if (tab === 'config') loadConfig();
  if (tab === 'tasks') renderTasksFiltered();
  if (tab === 'workers') renderWorkersDetail();
}

// ===================== REFRESH =====================
async function refreshAll(force = false) {
  try {
    const [status, workers, tasks, logs] = await Promise.all([
      fetch('/status').then(r => r.json()),
      fetch('/workers').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()).catch(() => ({ tasks: [] })),
      fetch('/api/logs').then(r => r.json()).catch(() => ({ logs: [] }))
    ]);

    allTasksCache = tasks.tasks || [];
    allWorkersCache = workers;

    if (currentTab === 'dashboard') {
      renderMetrics(status, workers, tasks);
      renderWorkers(workers);
      renderActivity(logs);
    }
    if (currentTab === 'workers') renderWorkersDetail();
    if (currentTab === 'tasks') renderTasksFiltered();

    updateSidebar(workers);
    updateNavBadges(workers, tasks);
  } catch (err) {
    console.error('Refresh failed:', err);
    if (force) showToast('Connection Error', 'Unable to reach HWMH server', 'error');
  }
}

function updateNavBadges(workers, tasks) {
  const workerIds = Object.keys(workers.workers || {}).filter(k => !k.startsWith('$') && !k.startsWith('_'));
  document.getElementById('badge-workers-nav').textContent = workerIds.length;
  document.getElementById('badge-tasks-nav').textContent = (tasks.tasks || []).length;
}

// ===================== METRICS =====================
function renderMetrics(status, workers, tasksData) {
  const workerIds = Object.keys(workers.workers || {}).filter(k => !k.startsWith('$') && !k.startsWith('_'));
  const online = workerIds.filter(id => {
    const s = (workers.status || {})[id];
    return s && s.lastSeen;
  }).length;

  const allTasks = tasksData.tasks || [];
  const active = allTasks.filter(t => t.status === 'active').length;
  const queued = allTasks.filter(t => t.status === 'queued').length;
  const completed = allTasks.filter(t => t.status === 'completed').length;
  if (completed > completedCount) completedCount = completed;

  document.getElementById('metric-workers').textContent = online;
  document.getElementById('badge-workers').textContent = `${online}/${workerIds.length}`;
  document.getElementById('metric-active').textContent = active;
  document.getElementById('badge-active').textContent = active;
  document.getElementById('metric-queue').textContent = queued;
  document.getElementById('badge-queue').textContent = queued;
  document.getElementById('metric-completed').textContent = completedCount;
  document.getElementById('badge-completed').textContent = completedCount;

  const pulse = document.getElementById('pulse-dot');
  const sysStatus = document.getElementById('system-status');
  if (online === workerIds.length) {
    sysStatus.textContent = 'Operational';
    pulse.className = 'pulse';
  } else if (online > 0) {
    sysStatus.textContent = 'Degraded';
    pulse.className = 'pulse degraded';
  } else {
    sysStatus.textContent = 'Offline';
    pulse.className = 'pulse offline';
  }
}

// ===================== WORKERS =====================
function renderWorkers(data) {
  const grid = document.getElementById('worker-grid');
  if (!grid) return;
  grid.innerHTML = buildWorkerCards(data, false);
}

function renderWorkersDetail() {
  const grid = document.getElementById('worker-grid-detail');
  if (!grid) return;
  grid.innerHTML = buildWorkerCards(allWorkersCache, true);
}

function buildWorkerCards(data, detailed) {
  const workers = data.workers || {};
  const status = data.status || {};
  const queues = data.queues || {};
  const workerIds = Object.keys(workers).filter(k => !k.startsWith('$') && !k.startsWith('_'));

  return workerIds.map(id => {
    const w = workers[id];
    const s = status[id] || { status: 'offline', lastSeen: null, queueLength: 0 };
    const stateClass = s.status === 'working' ? 'busy' : s.status === 'polling' ? 'online' : s.lastSeen ? 'idle' : 'offline';
    const stateLabel = s.status === 'working' ? 'Working' : s.status === 'polling' ? 'Online' : s.lastSeen ? 'Idle' : 'Offline';
    const badgeClass = s.status === 'working' ? 'badge-info' : s.status === 'polling' ? 'badge-success' : s.lastSeen ? 'badge-warning' : 'badge-danger';

    const caps = (w.capabilities || []).slice(0, 5);
    const tags = caps.map(c => `<span class="worker-tag">${c}</span>`).join('');

    const actions = detailed ? `
      <div class="worker-actions">
        <button class="btn btn-sm btn-secondary" onclick="clearWorkerQueue('${id}')">🗑️ Clear Queue</button>
        <button class="btn btn-sm btn-secondary" onclick="resetWorker('${id}')">🔄 Reset</button>
        <button class="btn btn-sm btn-secondary" onclick="viewWorkerTasks('${id}')">📋 View Tasks</button>
      </div>
    ` : '';

    return `
      <div class="worker-card ${stateClass}">
        <div class="worker-header">
          <div class="worker-avatar">${WORKER_EMOJIS[id] || '🤖'}</div>
          <div class="worker-info">
            <h3>${w.name || WORKER_NAMES[id] || id}</h3>
            <p>${w.role || w.description || 'Worker'}</p>
          </div>
          <span class="card-badge ${badgeClass}">${stateLabel}</span>
        </div>
        <div class="worker-tags">${tags}</div>
        <div class="worker-meta">
          <div class="worker-meta-item"><span>Queue</span><strong>${queues[id] || 0}</strong></div>
          <div class="worker-meta-item"><span>Last Seen</span><strong>${s.lastSeen ? timeAgo(s.lastSeen) : 'Never'}</strong></div>
          <div class="worker-meta-item"><span>Current</span><strong>${s.currentTask ? s.currentTask.slice(0, 8) + '...' : 'None'}</strong></div>
        </div>
        ${actions}
      </div>
    `;
  }).join('');
}

// ===================== TASKS =====================
function renderTasksFiltered() {
  const tbody = document.getElementById('task-table-full-body');
  if (!tbody) return;

  const workerFilter = document.getElementById('task-filter-worker')?.value || '';
  const statusFilter = document.getElementById('task-filter-status')?.value || '';

  let tasks = allTasksCache;
  if (workerFilter) tasks = tasks.filter(t => t.workerId === workerFilter);
  if (statusFilter) tasks = tasks.filter(t => t.status === statusFilter);

  if (!tasks.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No tasks match your filters</td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map(t => {
    const statusClass = t.status || 'unknown';
    return `
      <tr>
        <td><code style="font-size:11px;background:var(--bg-hover);padding:2px 6px;border-radius:4px;">${t.id?.slice(0, 10) || 'N/A'}</code></td>
        <td>${WORKER_NAMES[t.workerId] || t.workerId || 'N/A'}</td>
        <td><span class="status-pill ${statusClass}">${statusClass}</span></td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.description || 'No description')}</td>
        <td>${t.timestamp ? timeAgo(t.timestamp) : '-'}</td>
        <td>
          ${t.status === 'queued' ? `<button class="btn btn-sm btn-danger" onclick="cancelTask('${t.id}', '${t.workerId}')">Cancel</button>` : '-'}
        </td>
      </tr>
    `;
  }).join('');
}

function viewWorkerTasks(workerId) {
  document.getElementById('task-filter-worker').value = workerId;
  document.getElementById('task-filter-status').value = '';
  switchTab('tasks');
}

// ===================== ACTIVITY =====================
function renderActivity(data) {
  const list = document.getElementById('activity-list');
  if (!list) return;
  const logs = (data.logs || []).slice(0, 20);

  if (!logs.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:16px;">No recent activity</div>`;
    return;
  }

  list.innerHTML = logs.map(log => {
    const icon = log.level === 'error' ? '⚠️' : log.level === 'warn' ? '⚠️' : log.agent?.includes('Sophia') ? '👤' : '🧠';
    return `
      <div class="activity-item">
        <div class="activity-icon">${icon}</div>
        <div class="activity-content">
          <p>${escapeHtml(log.message)}</p>
          <time>${timeAgo(log.timestamp)} · ${log.agent || 'System'}</time>
        </div>
      </div>
    `;
  }).join('');
}

// ===================== REASONING =====================
async function loadReasoning() {
  const list = document.getElementById('reasoning-list');
  if (!list) return;
  list.innerHTML = '<div class="info-banner">Loading reasoning logs...</div>';

  try {
    const data = await fetch('/api/reasoning').then(r => r.json());
    const logs = data.reasoning || [];
    if (!logs.length) {
      list.innerHTML = '<div class="info-banner">No reasoning logs yet. Send a command to see Gottfried think.</div>';
      return;
    }
    list.innerHTML = logs.map(log => renderLogItem(log, 'Gottfried')).join('');
  } catch (err) {
    list.innerHTML = '<div class="info-banner" style="color:var(--danger);border-color:var(--danger)">Failed to load reasoning logs</div>';
  }
}

// ===================== DECISIONS =====================
async function loadDecisions() {
  const list = document.getElementById('decisions-list');
  if (!list) return;
  list.innerHTML = '<div class="info-banner">Loading decisions...</div>';

  try {
    const data = await fetch('/api/decisions').then(r => r.json());
    const logs = data.decisions || [];
    if (!logs.length) {
      list.innerHTML = '<div class="info-banner">No decisions yet. Send a command to see Sophia delegate.</div>';
      return;
    }
    list.innerHTML = logs.map(log => renderLogItem(log, log.agent || 'Sophia')).join('');
  } catch (err) {
    list.innerHTML = '<div class="info-banner" style="color:var(--danger);border-color:var(--danger)">Failed to load decisions</div>';
  }
}

// ===================== ERRORS =====================
async function loadErrors() {
  const tbody = document.getElementById('errors-table-body');
  if (!tbody) return;

  try {
    const data = await fetch('/api/errors').then(r => r.json());
    const errors = data.errors || [];
    const badge = document.getElementById('badge-errors-nav');
    if (badge) badge.textContent = errors.length;

    if (!errors.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No errors logged — all systems healthy</td></tr>`;
      return;
    }
    tbody.innerHTML = errors.map(e => `
      <tr>
        <td>${timeAgo(e.timestamp)}</td>
        <td>${e.agent || 'System'}</td>
        <td><span class="status-pill failed">${e.level}</span></td>
        <td>${escapeHtml(e.message)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:20px;">Failed to load errors</td></tr>`;
  }
}

// ===================== SYSTEM =====================
async function loadSystem() {
  const grid = document.getElementById('system-grid');
  const memCard = document.getElementById('memory-card');
  if (!grid) return;

  try {
    const data = await fetch('/api/system').then(r => r.json());

    grid.innerHTML = `
      <div class="card sys-card">
        <h4>Runtime</h4>
        <div class="sys-row"><span>Node.js</span><span>${data.nodeVersion}</span></div>
        <div class="sys-row"><span>Platform</span><span>${data.platform}</span></div>
        <div class="sys-row"><span>Environment</span><span>${data.env}</span></div>
        <div class="sys-row"><span>Port</span><span>${data.port}</span></div>
        <div class="sys-row"><span>Uptime</span><span>${formatDuration(data.uptime)}</span></div>
      </div>
      <div class="card sys-card">
        <h4>Application</h4>
        <div class="sys-row"><span>Version</span><span>${data.version}</span></div>
        <div class="sys-row"><span>Workers</span><span>${(data.workersConfigured || []).join(', ')}</span></div>
        <div class="sys-row"><span>Server Time</span><span>${new Date(data.timestamp).toLocaleString()}</span></div>
      </div>
    `;

    if (memCard && data.memory) {
      const usedMB = Math.round(data.memory.heapUsed / 1024 / 1024);
      const totalMB = Math.round(data.memory.heapTotal / 1024 / 1024);
      const rssMB = Math.round(data.memory.rss / 1024 / 1024);
      const pct = Math.round((data.memory.heapUsed / data.memory.heapTotal) * 100);

      memCard.innerHTML = `
        <div class="sys-row"><span>Heap Used</span><span>${usedMB} MB</span></div>
        <div class="sys-row"><span>Heap Total</span><span>${totalMB} MB</span></div>
        <div class="sys-row"><span>RSS</span><span>${rssMB} MB</span></div>
        <div class="memory-bar-wrap"><div class="memory-bar" style="width:${pct}%"></div></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right;">${pct}% heap utilization</div>
      `;
    }
  } catch (err) {
    grid.innerHTML = '<div class="info-banner" style="color:var(--danger)">Failed to load system info</div>';
  }
}

// ===================== CONFIG =====================
async function loadConfig() {
  const block = document.getElementById('config-block');
  if (!block) return;

  try {
    const data = await fetch('/api/config').then(r => r.json());
    block.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    block.textContent = 'Failed to load configuration.';
  }
}

// ===================== CHAT =====================
async function loadChat() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  list.innerHTML = '<div class="info-banner">Loading worker outputs...</div>';

  try {
    const data = await fetch('/api/history').then(r => r.json());
    const history = data.history || [];
    const badge = document.getElementById('badge-chat-nav');
    if (badge) badge.textContent = history.length;

    if (!history.length) {
      list.innerHTML = '<div class="info-banner">No worker output yet. Send a command and watch it appear here.</div>';
      return;
    }

    list.innerHTML = history.map(item => {
      const emoji = WORKER_EMOJIS[item.workerId] || '🤖';
      const name = WORKER_NAMES[item.workerId] || item.workerId;
      const statusClass = item.status === 'failed' ? 'error' : 'success';
      const resultText = item.error
        ? `Error: ${escapeHtml(item.error)}`
        : escapeHtml(JSON.stringify(item.result, null, 2));

      return `
        <div class="chat-item">
          <div class="chat-avatar">${emoji}</div>
          <div class="chat-body">
            <div class="chat-header">
              <span class="chat-name">${name}</span>
              <span class="chat-time">${timeAgo(item.timestamp)}</span>
            </div>
            <div class="chat-desc">${escapeHtml(item.description)}</div>
            <div class="chat-result ${statusClass}">${resultText}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    list.innerHTML = '<div class="info-banner" style="color:var(--danger);border-color:var(--danger)">Failed to load chat</div>';
  }
}

// ===================== CONTROLS =====================
async function sendCommand() {
  const input = document.getElementById('command-input');
  const btn = document.getElementById('cmd-btn');
  const cmd = input.value.trim();
  if (!cmd) return;

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch('/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, source: 'dashboard' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Command Sent', data.result?.message || 'Task queued', 'success');
      input.value = '';
      setTimeout(() => refreshAll(true), 400);
    } else {
      showToast('Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    showToast('Error', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
}

async function clearWorkerQueue(workerId) {
  if (!confirm(`Clear all queued tasks for ${WORKER_NAMES[workerId] || workerId}?`)) return;
  try {
    const res = await fetch(`/api/workers/${workerId}/clear`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Queue Cleared', data.message, 'success');
      refreshAll(true);
    } else {
      showToast('Failed', data.error, 'error');
    }
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

async function resetWorker(workerId) {
  if (!confirm(`Reset status for ${WORKER_NAMES[workerId] || workerId}?`)) return;
  try {
    const res = await fetch(`/api/workers/${workerId}/reset`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Worker Reset', data.message, 'success');
      refreshAll(true);
    } else {
      showToast('Failed', data.error, 'error');
    }
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

async function clearAllQueues() {
  if (!confirm('Clear ALL worker queues? This cannot be undone.')) return;
  const ids = Object.keys(allWorkersCache.workers || {}).filter(k => !k.startsWith('$') && !k.startsWith('_'));
  for (const id of ids) {
    try { await fetch(`/api/workers/${id}/clear`, { method: 'POST' }); } catch (_) {}
  }
  showToast('All Queues Cleared', `${ids.length} worker queues emptied`, 'success');
  refreshAll(true);
}

function cancelTask(taskId, workerId) {
  showToast('Not Implemented', 'Task cancellation requires queue modification API', 'error');
}

// ===================== HELPERS =====================
function renderLogItem(log, agent) {
  const level = log.level || 'info';
  return `
    <div class="log-item ${level}">
      <div class="log-time">${new Date(log.timestamp).toLocaleString()} · ${timeAgo(log.timestamp)}</div>
      <div class="log-agent">${agent}</div>
      <div class="log-msg">${escapeHtml(log.message)}</div>
      ${log.context && Object.keys(log.context).length ? `<div class="log-meta">${escapeHtml(JSON.stringify(log.context))}</div>` : ''}
    </div>
  `;
}

function updateSidebar(data) {
  const status = data.status || {};
  ['sophia', 'iris', 'pheme', 'kairos'].forEach(id => {
    const dot = document.getElementById(`nav-${id}`);
    if (!dot) return;
    const s = status[id];
    dot.className = 'dot';
    if (!s || !s.lastSeen) dot.classList.add('offline');
    else if (s.status === 'working') dot.classList.add('idle');
    else dot.classList.add('online');
  });
}

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toasts');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div><div class="toast-msg">${escapeHtml(message)}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function timeAgo(iso) {
  const date = new Date(iso);
  const now = new Date();
  const secs = Math.floor((now - date) / 1000);
  if (secs < 10) return 'Just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs}h ${mins}m ${secs}s`;
}

// ===================== INIT =====================
function init() {
  refreshAll(true);
  setInterval(() => refreshAll(false), 3000);
}

init();
