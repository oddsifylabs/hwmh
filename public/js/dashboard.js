/**
 * HWMH Dashboard Controller
 * Polls API endpoints and renders real-time data.
 */

const WORKER_EMOJIS = {
  sophia: '👤',
  iris: '📚',
  pheme: '📢',
  kairos: '📊'
};

const WORKER_NAMES = {
  sophia: 'Sophia Hermes',
  iris: 'Iris Hermes',
  pheme: 'Pheme Hermes',
  kairos: 'Kairos Hermes'
};

let completedCount = 0;

// Initial load
async function init() {
  await refreshAll();
  setInterval(refreshAll, 3000);
}

async function refreshAll() {
  try {
    const [status, workers, tasks, logs] = await Promise.all([
      fetch('/status').then(r => r.json()),
      fetch('/workers').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()).catch(() => ({ tasks: [] })),
      fetch('/api/logs').then(r => r.json()).catch(() => ({ logs: [] }))
    ]);

    renderMetrics(status, workers, tasks);
    renderWorkers(workers);
    renderTasks(tasks);
    renderActivity(logs);
    updateSidebar(workers);
  } catch (err) {
    console.error('Refresh failed:', err);
    showToast('Connection lost', 'Unable to reach HWMH server', 'error');
  }
}

function renderMetrics(status, workers, tasksData) {
  const workerIds = Object.keys(workers.workers || {});
  const online = workerIds.filter(id => {
    const s = (workers.status || {})[id];
    return s && s.lastSeen;
  }).length;

  const allTasks = tasksData.tasks || [];
  const active = allTasks.filter(t => t.status === 'active').length;
  const queued = allTasks.filter(t => t.status === 'queued').length;

  document.getElementById('metric-workers').textContent = online;
  document.getElementById('badge-workers').textContent = `${online}/${workerIds.length}`;
  document.getElementById('metric-active').textContent = active;
  document.getElementById('badge-active').textContent = active;
  document.getElementById('metric-queue').textContent = queued;
  document.getElementById('badge-queue').textContent = queued;
  document.getElementById('metric-completed').textContent = completedCount;
  document.getElementById('badge-completed').textContent = completedCount;

  const sysStatus = document.getElementById('system-status');
  if (online === workerIds.length) {
    sysStatus.textContent = 'Operational';
  } else if (online > 0) {
    sysStatus.textContent = 'Degraded';
  } else {
    sysStatus.textContent = 'Offline';
  }
}

function renderWorkers(data) {
  const grid = document.getElementById('worker-grid');
  const workers = data.workers || {};
  const status = data.status || {};
  const queues = data.queues || {};

  grid.innerHTML = Object.entries(workers).map(([id, w]) => {
    const s = status[id] || { status: 'offline', lastSeen: null, queueLength: 0 };
    const stateClass = s.status === 'working' ? 'busy' : s.status === 'polling' ? 'online' : s.lastSeen ? 'idle' : 'offline';
    const stateLabel = s.status === 'working' ? 'Working' : s.status === 'polling' ? 'Online' : s.lastSeen ? 'Idle' : 'Offline';
    const badgeClass = s.status === 'working' ? 'badge-info' : s.status === 'polling' ? 'badge-success' : s.lastSeen ? 'badge-warning' : 'badge-danger';

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
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
          ${(w.capabilities || []).slice(0, 4).map(c => `<span style="background:var(--bg-hover);padding:2px 8px;border-radius:4px;margin-right:4px;">${c}</span>`).join('')}
        </div>
        <div class="worker-meta">
          <div class="worker-meta-item">
            <span>Queue</span>
            <strong>${queues[id] || 0}</strong>
          </div>
          <div class="worker-meta-item">
            <span>Last Seen</span>
            <strong>${s.lastSeen ? timeAgo(s.lastSeen) : 'Never'}</strong>
          </div>
          <div class="worker-meta-item">
            <span>Current</span>
            <strong>${s.currentTask ? s.currentTask.slice(0, 8) + '...' : 'None'}</strong>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTasks(data) {
  const tbody = document.getElementById('task-table');
  const tasks = (data.tasks || []).slice(0, 20);
  document.getElementById('task-count').textContent = `${tasks.length} tasks`;

  if (!tasks.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">No tasks in queue</td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map(t => {
    const statusClass = t.status;
    const statusLabel = t.status.charAt(0).toUpperCase() + t.status.slice(1);
    return `
      <tr>
        <td><code style="font-size:11px;background:var(--bg-hover);padding:2px 6px;border-radius:4px;">${t.id?.slice(0, 8) || 'N/A'}</code></td>
        <td>${WORKER_NAMES[t.workerId] || t.workerId || 'N/A'}</td>
        <td><span class="status-dot ${statusClass}"></span>${statusLabel}</td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.description || 'No description')}</td>
        <td>${t.startedAt ? timeAgo(t.startedAt) : t.timestamp ? timeAgo(t.timestamp) : '-'}</td>
      </tr>
    `;
  }).join('');

  // Update completed count from visible completed tasks
  const completed = (data.tasks || []).filter(t => t.status === 'completed').length;
  if (completed > completedCount) completedCount = completed;
}

function renderActivity(data) {
  const list = document.getElementById('activity-list');
  const logs = (data.logs || []).slice(0, 20);
  document.getElementById('activity-count').textContent = `${logs.length} events`;

  if (!logs.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:20px;">No recent activity</div>`;
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

function updateSidebar(data) {
  const status = data.status || {};
  ['sophia', 'iris', 'pheme', 'kairos'].forEach(id => {
    const dot = document.getElementById(`nav-${id}`);
    if (!dot) return;
    const s = status[id];
    dot.className = 'dot';
    if (!s || !s.lastSeen) {
      dot.classList.add('offline');
    } else if (s.status === 'working') {
      dot.classList.add('idle');
    } else {
      dot.classList.add('online');
    }
  });
}

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
      showToast('Command sent', data.result?.message || 'Task queued successfully', 'success');
      input.value = '';
      setTimeout(refreshAll, 500);
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

// Start
init();
