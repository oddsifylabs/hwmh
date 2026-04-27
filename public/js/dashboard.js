/* ============================================================
   HWMH Dashboard JS v3
   Hermes Workers Management Hub — Oddsify Labs
   ============================================================ */

const API = {
  status:    '/status',
  workers:   '/workers',
  tasks:     '/api/tasks',
  requests:  '/api/requests',
  command:   '/command',
  reasoning: '/api/reasoning',
  decisions: '/api/decisions',
  errors:    '/api/errors',
  history:   '/api/history',
  system:    '/api/system',
  config:    '/api/config',
  profile:   (id) => `/api/workers/${id}/profile`,
  sophiaMsg: '/api/sophia/message',
  sophiaConv:'/api/sophia/conversation',
  workerMsg: (id) => `/api/workers/${id}/message`,
  workerConv:(id) => `/api/workers/${id}/conversation`,
  clear:     (id) => `/api/workers/${id}/clear`,
  reset:     (id) => `/api/workers/${id}/reset`,
};

let currentTab = 'dashboard';
let currentIntelTab = 'reasoning';
let chatMessages = [];
let chatUnread = 0;
let chatPollInterval = null;
let directorUnread = 0;
let directorPollInterval = null;
let workersData = null;
let currentWorkerId = null;
let workerChatPollInterval = null;
let workerChatMessages = [];

/* ---------- Tabs ---------- */
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (nav) nav.classList.add('active');

  if (tab === 'intelligence') {
    loadIntelTab();
  }
  if (tab === 'director') {
    directorUnread = 0;
    updateDirectorBadge();
    loadDirectorChat();
    loadRequests();
  }
  if (tab === 'workers') loadWorkersDetail();
  if (tab === 'tasks')   loadTasks();
  if (tab === 'system')  loadSystem();
  if (tab === 'config')  loadConfig();
  if (tab !== 'profile-detail') {
    currentWorkerId = null;
    stopWorkerChatPolling();
  }
}

/* ---------- Intelligence Sub-Tabs ---------- */
function switchIntelTab(intelTab) {
  currentIntelTab = intelTab;
  document.querySelectorAll('.intel-panel').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sub-nav-item').forEach(el => el.classList.remove('active'));

  const panel = document.getElementById('intel-' + intelTab);
  if (panel) panel.classList.add('active');

  const nav = document.querySelector(`.sub-nav-item[data-intel="${intelTab}"]`);
  if (nav) nav.classList.add('active');

  if (intelTab === 'reasoning') loadReasoning();
  if (intelTab === 'decisions') loadDecisions();
  if (intelTab === 'errors')    loadErrors();
  if (intelTab === 'chat')      loadChat();
}

function loadIntelTab() {
  if (currentIntelTab === 'reasoning') loadReasoning();
  if (currentIntelTab === 'decisions') loadDecisions();
  if (currentIntelTab === 'errors')    loadErrors();
  if (currentIntelTab === 'chat')      loadChat();
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
    workersData = data;
    renderWorkers(data.workers, data.status, data.queues);
    renderMetrics(data.status, data.queues);
    loadActivityFeed();
    if (currentTab === 'tasks') loadTasks();
    if (currentTab === 'system') loadSystem();
    if (currentTab === 'director') loadRequests();
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

  const completedToday = (window.taskHistory || []).filter(t => {
    const d = new Date(t.timestamp);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  document.getElementById('metric-completed').textContent  = completedToday;
  document.getElementById('badge-completed').textContent   = completedToday;
}

/* ---------- Workers ---------- */
const WORKER_META = {
  sophia: { icon: 'sophia', color: '#6366f1', name: 'Sophia Hermes' },
  iris:   { icon: 'iris', color: '#10b981', name: 'Iris Hermes' },
  pheme:  { icon: 'pheme', color: '#f59e0b', name: 'Pheme Hermes' },
  kairos: { icon: 'kairos', color: '#ef4444', name: 'Kairos Hermes' }
};

function renderWorkers(workers, status, queues) {
  const grid = document.getElementById('worker-grid');
  const detail = document.getElementById('worker-grid-detail');
  if (!grid && !detail) return;

  const html = Object.entries(workers).map(([id, info]) => {
    const st = status[id] || {};
    const meta = WORKER_META[id] || { icon: 'sophia', color: '#94a3b8' };
    const isOnline = st.status !== 'offline';
    const statusLabel = st.status || 'idle';
    const lastSeen = st.lastSeen ? timeAgo(st.lastSeen) : 'Never';
    const qlen = queues[id] || 0;
    const caps = (info.capabilities || []).slice(0, 4).map(c => `<span class="cap-chip">${c}</span>`).join('');

    return `
      <div class="worker-card ${isOnline ? 'online' : 'offline'}" onclick="openProfile('${id}')">
        <div class="worker-header">
          <div class="worker-avatar" style="background:${meta.color};color:#fff">${icon(meta.icon, 28)}</div>
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
        <div class="worker-capabilities">${caps}</div>
        <div class="worker-actions">
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();clearQueue('${id}')">Clear Queue</button>
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();resetWorker('${id}')">Reset</button>
          <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openProfile('${id}')">Profile</button>
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

/* ---------- Profiles (merged into Workers) ---------- */
async function openProfile(workerId) {
  try {
    const data = await get(API.profile(workerId));
    currentWorkerId = workerId;
    renderProfileDetail(data);
    switchTab('profile-detail');
    loadWorkerChat(workerId);
    startWorkerChatPolling(workerId);
  } catch (err) {
    toast('Failed to load profile: ' + err.message, 'error');
  }
}

function renderProfileDetail(data) {
  const meta = WORKER_META[data.workerId] || { icon: 'sophia', color: '#94a3b8' };
  const title = document.getElementById('profile-detail-title');
  if (title) title.textContent = `${data.name} — Profile`;

  const content = document.getElementById('profile-detail-content');
  if (!content) return;

  const st = data.status || {};
  const isOnline = st.status !== 'offline';

  content.innerHTML = `
    <div class="profile-detail-header">
      <div class="profile-detail-avatar" style="background:${meta.color};color:#fff">${icon(meta.icon, 44)}</div>
      <div class="profile-detail-info">
        <h3>${data.name}</h3>
        <div class="role">${data.role || ''} — ${data.description || ''}</div>
        <div style="margin-top:8px">
          <span class="worker-status-badge ${isOnline ? 'badge-success' : 'badge-danger'}">${isOnline ? 'Online' : 'Offline'}</span>
          <span class="badge badge-info">Risk Tier ${data.riskTier}</span>
        </div>
      </div>
    </div>

    <div class="profile-detail-grid">
      <div class="profile-detail-stat">
        <div class="value" style="color:var(--text)">${data.stats.totalTasks}</div>
        <div class="label">Total Tasks</div>
      </div>
      <div class="profile-detail-stat">
        <div class="value" style="color:var(--success)">${data.stats.completed}</div>
        <div class="label">Completed</div>
      </div>
      <div class="profile-detail-stat">
        <div class="value" style="color:var(--danger)">${data.stats.failed}</div>
        <div class="label">Failed</div>
      </div>
      <div class="profile-detail-stat">
        <div class="value" style="color:var(--info)">${data.stats.successRate}%</div>
        <div class="label">Success Rate</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="profile-section">
        <h4>Capabilities</h4>
        <div class="worker-capabilities">
          ${data.capabilities.map(c => `<span class="cap-chip">${c}</span>`).join('')}
        </div>
      </div>
      <div class="profile-section">
        <h4>Current Status</h4>
        <div style="font-size:13px;color:var(--text-muted)">
          <div>Status: <strong>${st.status || 'unknown'}</strong></div>
          <div>Queue: <strong>${data.stats.queueLength}</strong></div>
          <div>Last seen: <strong>${st.lastSeen ? timeAgo(st.lastSeen) : 'Never'}</strong></div>
          ${st.currentTask ? `<div>Current task: <code>${st.currentTask.slice(0,8)}</code></div>` : ''}
        </div>
      </div>
    </div>

    ${data.recentOutputs.length ? `
    <div class="profile-section">
      <h4>Recent Outputs</h4>
      <div class="chat-list" style="max-height: 400px;">
        ${data.recentOutputs.map(o => `
          <div class="chat-bubble">
            <div class="chat-body">
              <div class="chat-meta">
                <code>${o.taskId.slice(0,8)}</code>
                <span class="chat-time">${timeAgo(o.completedAt)}</span>
                ${o.duration ? `<span class="badge badge-info">${o.duration}s</span>` : ''}
              </div>
              <div class="chat-text">${escapeHtml(o.description || '')}</div>
              ${o.result ? `<div class="chat-result"><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit">${escapeHtml(String(o.result))}</pre></div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : `<div class="empty-state"><div class="empty-state-icon">${icon('empty', 48)}</div><div class="empty-state-text">No outputs yet. Tasks will appear here once completed.</div></div>`}

    ${data.timeline.length ? `
    <div class="profile-section">
      <h4>Activity Timeline</h4>
      <div class="card">
        ${data.timeline.map(t => `
          <div class="timeline-item">
            <div class="timeline-dot ${t.status}"></div>
            <div class="timeline-content">
              <div class="timeline-time">${timeAgo(t.timestamp)}</div>
              <div class="timeline-desc">${escapeHtml(t.description || '')}</div>
              ${t.result ? `<div class="timeline-result"><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit">${escapeHtml(String(t.result))}</pre></div>` : ''}
              ${t.error ? `<div class="timeline-error">${escapeHtml(t.error)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Two-way Chat Section -->
    <div class="profile-section">
      <h4>
        <span style="display:inline-flex;align-items:center;gap:8px">
          ${icon('chat', 18)}
          Chat with ${data.name}
        </span>
        <span class="badge badge-success" style="font-size:11px;margin-left:8px">Live</span>
      </h4>
      <div class="director-chat-container" style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div id="worker-chat-messages" class="director-chat-messages" style="height:320px;overflow-y:auto;padding:16px;background:var(--bg-elevated)">
          <div class="empty-state" style="padding:24px 0">
            <div class="empty-state-icon">${icon('chat', 40)}</div>
            <div class="empty-state-text">Start a conversation with ${data.name}.</div>
            <div class="empty-state-sub">Messages appear here in real-time. The worker will see your message as a chat task.</div>
          </div>
        </div>
        <div class="director-chat-input-bar" style="padding:12px 16px;background:var(--bg-card);border-top:1px solid var(--border)">
          <input
            type="text"
            id="worker-chat-input"
            class="director-chat-input"
            placeholder="Type a message to ${data.name}..."
            onkeydown="if(event.key==='Enter')sendWorkerMessage()"
            style="flex:1"
          />
          <button class="btn btn-primary" onclick="sendWorkerMessage()" style="display:flex;align-items:center;gap:6px">
            ${icon('send', 14)} Send
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Worker Chat ---------- */
async function sendWorkerMessage() {
  const input = document.getElementById('worker-chat-input');
  if (!input || !input.value.trim() || !currentWorkerId) return;

  const text = input.value.trim();
  input.value = '';

  // Optimistically add to UI
  workerChatMessages.push({
    sender: 'director',
    text,
    timestamp: new Date().toISOString()
  });
  renderWorkerChat();

  try {
    await post(API.workerMsg(currentWorkerId), { message: text, type: 'chat' });
  } catch (err) {
    toast('Failed to send: ' + err.message, 'error');
  }
}

async function loadWorkerChat(workerId) {
  if (!workerId) return;
  try {
    const data = await get(API.workerConv(workerId) + '?limit=100');
    workerChatMessages = data.conversation || [];
    renderWorkerChat();
  } catch (err) {
    console.error('Worker chat load failed:', err);
  }
}

function renderWorkerChat() {
  const container = document.getElementById('worker-chat-messages');
  if (!container) return;

  if (!workerChatMessages.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px 0">
        <div class="empty-state-icon">${icon('chat', 40)}</div>
        <div class="empty-state-text">No messages yet.</div>
        <div class="empty-state-sub">Send a message to start the conversation.</div>
      </div>`;
    return;
  }

  const meta = WORKER_META[currentWorkerId] || { icon: 'sophia', color: '#94a3b8', name: currentWorkerId };

  container.innerHTML = workerChatMessages.map(m => {
    const isDirector = m.sender === 'director';
    return `
      <div class="director-msg ${isDirector ? 'director-msg-user' : 'director-msg-sophia'}">
        <div class="director-msg-header">
          <div class="director-msg-avatar" style="background:${isDirector ? '#6366f1' : meta.color};color:#fff;width:28px;height:28px;font-size:12px">
            ${isDirector ? 'You' : icon(meta.icon, 14)}
          </div>
          <strong>${isDirector ? (m.senderName || 'You') : (m.senderName || meta.name)}</strong>
          <span class="director-msg-time">${timeAgo(m.timestamp)}</span>
        </div>
        <div class="director-msg-text">${escapeHtml(m.text || '')}</div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function startWorkerChatPolling(workerId) {
  stopWorkerChatPolling();
  workerChatPollInterval = setInterval(() => loadWorkerChat(workerId), 5000);
}

function stopWorkerChatPolling() {
  if (workerChatPollInterval) {
    clearInterval(workerChatPollInterval);
    workerChatPollInterval = null;
  }
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
      <td><button class="btn btn-sm btn-primary" onclick="viewTask('${t.id}', '${t.workerId}')">View</button></td>
    </tr>
  `).join('');

  document.getElementById('badge-tasks-nav').textContent = tasks.filter(t => t.status === 'active' || t.status === 'queued').length;
}

function renderTasksFiltered() { loadTasks(); }

async function viewTask(taskId, workerId) {
  try {
    // Fetch full history to find this task
    const data = await get(API.history + '?limit=500');
    const history = data.history || [];
    const task = history.find(t => t.id === taskId);

    if (!task) {
      toast('Task not found — it may have been cleared', 'error');
      return;
    }

    const meta = WORKER_META[task.workerId] || { name: task.workerId, color: '#94a3b8' };
    const resultStr = task.result
      ? (typeof task.result === 'object' ? JSON.stringify(task.result, null, 2) : String(task.result))
      : null;
    const errorStr = task.error ? String(task.error) : null;

    const modalBody = document.getElementById('task-modal-body');
    modalBody.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Worker</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="worker-status-badge badge-success" style="background:${meta.color};color:#fff;border:none">${meta.name}</span>
        </div>
      </div>
      <div style="margin-bottom:16px">
        <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Status</div>
        <span class="badge badge-${task.status === 'completed' ? 'success' : task.status === 'failed' ? 'danger' : 'warning'}">${task.status}</span>
      </div>
      <div style="margin-bottom:16px">
        <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Task ID</div>
        <code style="font-size:12px">${task.id}</code>
      </div>
      <div style="margin-bottom:16px">
        <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Description</div>
        <div style="background:var(--bg-elevated);padding:12px;border-radius:8px;border:1px solid var(--border)">${escapeHtml(task.description || '(no description)')}</div>
      </div>
      <div style="margin-bottom:16px">
        <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Timeline</div>
        <div style="font-size:13px;color:var(--text-muted)">
          ${task.startedAt ? `<div>Started: ${new Date(task.startedAt).toLocaleString()}</div>` : ''}
          ${task.timestamp ? `<div>Completed: ${new Date(task.timestamp).toLocaleString()}</div>` : ''}
        </div>
      </div>
      ${resultStr ? `
      <div style="margin-bottom:16px">
        <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Result</div>
        <pre style="background:var(--bg-elevated);padding:12px;border-radius:8px;border:1px solid var(--border);margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:300px;overflow:auto">${escapeHtml(resultStr)}</pre>
      </div>
      ` : ''}
      ${errorStr ? `
      <div style="margin-bottom:16px">
        <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Error</div>
        <pre style="background:rgba(239,68,68,0.1);padding:12px;border-radius:8px;border:1px solid var(--danger);margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;color:var(--danger)">${escapeHtml(errorStr)}</pre>
      </div>
      ` : ''}
    `;

    document.getElementById('task-modal').style.display = 'flex';
  } catch (err) {
    toast('Failed to load task: ' + err.message, 'error');
  }
}

function closeTaskModal() {
  document.getElementById('task-modal').style.display = 'none';
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('task-modal');
  if (modal && e.target === modal) closeTaskModal();
});

/* ---------- Request Form (now in Director tab) ---------- */
const REQUEST_TEMPLATES = {
  research: {
    title: 'Research: ',
    description: 'Please research the following topic and provide a detailed summary with sources:\n\n[TOPIC]',
    category: 'research',
    worker: 'auto'
  },
  content: {
    title: 'Write: ',
    description: 'Please write the following content:\n\n[CONTENT TYPE]\n\nTarget audience: [AUDIENCE]\nTone: [TONE]\nKey points to cover:\n- \n- \n- ',
    category: 'content',
    worker: 'auto'
  },
  social: {
    title: 'Social Post: ',
    description: 'Create a social media post for the following:\n\nPlatform: [X/Twitter/LinkedIn/etc]\nTopic: [TOPIC]\nTone: [TONE]\nInclude hashtags: yes/no',
    category: 'social',
    worker: 'pheme'
  },
  code: {
    title: 'Code Task: ',
    description: 'Please complete the following coding task:\n\nLanguage/Framework: [LANGUAGE]\nTask: [DESCRIPTION]\nRequirements:\n- \n- \n- ',
    category: 'development',
    worker: 'auto'
  },
  email: {
    title: 'Draft Email: ',
    description: 'Draft an email with the following details:\n\nRecipient: [NAME/ROLE]\nSubject: [SUBJECT]\nPurpose: [PURPOSE]\nKey points to include:\n- \n- ',
    category: 'admin',
    worker: 'iris'
  },
  meeting: {
    title: 'Schedule: ',
    description: 'Please schedule the following:\n\nEvent: [EVENT NAME]\nAttendees: [NAMES]\nPreferred times: [TIMES]\nDuration: [DURATION]\nNotes: [ANY SPECIAL REQUIREMENTS]',
    category: 'admin',
    worker: 'iris'
  }
};

function fillTemplate(type) {
  const tpl = REQUEST_TEMPLATES[type];
  if (!tpl) return;
  document.getElementById('req-title').value = tpl.title;
  document.getElementById('req-description').value = tpl.description;
  document.getElementById('req-category').value = tpl.category;
  document.getElementById('req-worker').value = tpl.worker;
}

function clearRequestForm() {
  document.getElementById('req-title').value = '';
  document.getElementById('req-description').value = '';
  document.getElementById('req-category').value = 'general';
  document.getElementById('req-worker').value = 'auto';
  document.getElementById('req-priority').value = 'normal';
  document.getElementById('req-tags').value = '';
}

async function submitRequest() {
  const title = document.getElementById('req-title').value.trim();
  const description = document.getElementById('req-description').value.trim();
  const worker = document.getElementById('req-worker').value;
  const priority = document.getElementById('req-priority').value;
  const category = document.getElementById('req-category').value;
  const tagsRaw = document.getElementById('req-tags').value;
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  if (!title || !description) {
    toast('Title and description are required', 'error');
    return;
  }

  const btn = document.getElementById('req-submit');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const res = await post(API.requests, { title, description, worker, priority, category, tags });
    toast(`Task submitted: ${res.request.title.slice(0, 40)}`, 'success');
    clearRequestForm();
    loadRequests();
  } catch (err) {
    toast('Submit failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Submit Task`;
  }
}

async function loadRequests() {
  try {
    const data = await get(API.requests);
    renderRequests(data.requests || []);
  } catch (err) {
    console.error('Requests load failed:', err);
  }
}

function renderRequests(requests) {
  const tbody = document.getElementById('requests-table-body');
  if (!tbody) return;

  if (!requests.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px"><div class="empty-state"><div class="empty-state-text">No tasks yet. Create one above!</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = requests.slice(0, 20).map(r => `
    <tr>
      <td><strong>${escapeHtml(r.title)}</strong></td>
      <td>${r.worker === 'auto' ? `${icon('sophia', 14)} Auto` : `${icon(WORKER_META[r.worker]?.icon || 'sophia', 14)} ${WORKER_META[r.worker]?.name || r.worker}`}</td>
      <td><span class="badge badge-${r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : r.priority === 'low' ? 'info' : 'success'}">${r.priority}</span></td>
      <td><span class="badge badge-${r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : r.status === 'queued' ? 'info' : 'warning'}">${r.status}</span></td>
      <td>${timeAgo(r.createdAt)}</td>
    </tr>
  `).join('');
}

/* ---------- Director Chat ---------- */
async function loadDirectorChat() {
  try {
    const data = await get(API.sophiaConv);
    renderDirectorMessages(data.conversation || [], data.directorName || 'Director');
  } catch (err) {
    console.error('Director chat load failed:', err);
  }
}

function renderDirectorMessages(messages, directorName) {
  const container = document.getElementById('director-chat-messages');
  if (!container) return;

  if (!messages.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('director', 48)}</div>
        <div class="empty-state-text">Welcome, ${directorName}. Send a message to Sophia to get started.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map(m => {
    const isDirector = m.sender === 'director';
    const isTaskComplete = m.type === 'task-complete';
    const isTaskFailed = m.type === 'task-failed';
    const avatarIcon = isDirector ? 'profiles' : 'sophia';
    const color = isDirector ? '#6366f1' : (isTaskComplete ? '#10b981' : isTaskFailed ? '#ef4444' : '#f59e0b');
    const name = isDirector ? directorName : 'Sophia Hermes';

    // Parse simple markdown from server
    let textHtml = escapeHtml(m.text || '')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/```(.*?)```/gs, '<pre style="margin:6px 0;padding:8px;background:rgba(0,0,0,0.3);border-radius:6px;font-size:12px;overflow:auto"><code>$1</code></pre>')
      .replace(/\n/g, '<br>');

    return `
      <div class="director-msg ${m.sender}" style="${isTaskComplete || isTaskFailed ? 'border-left:3px solid ' + color + ';padding-left:12px' : ''}">
        <div class="director-msg-avatar" style="background:${color};color:#fff">${icon(avatarIcon, 20)}</div>
        <div class="director-msg-body">
          <div class="director-msg-name">${name}${isTaskComplete ? ' — Task Complete' : isTaskFailed ? ' — Task Failed' : ''}</div>
          <div class="director-msg-text">${textHtml}</div>
          <div class="director-msg-time">${new Date(m.timestamp).toLocaleString()}</div>
          ${m.delegated && m.delegated.length ? `
            <div class="director-msg-delegated">
              Delegated to: ${m.delegated.map(d => d.workerId).join(', ')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

async function sendDirectorMessage() {
  const input = document.getElementById('director-input');
  const btn = document.getElementById('director-send-btn');
  const text = input.value.trim();
  if (!text) return;

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await post(API.sophiaMsg, { message: text, type: 'chat' });
    input.value = '';
    renderDirectorMessages(
      [...(res.userMsg ? [res.userMsg] : []), ...(res.sophiaReply ? [res.sophiaReply] : [])],
      res.userMsg?.senderName || 'Director'
    );
    setTimeout(loadDirectorChat, 300);
    setTimeout(loadRequests, 500);
  } catch (err) {
    toast('Message failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
}

function sendDirectorQuick(text) {
  document.getElementById('director-input').value = text;
  sendDirectorMessage();
}

function updateDirectorBadge() {
  const badge = document.getElementById('badge-director-nav');
  if (!badge) return;
  badge.textContent = directorUnread;
  badge.style.display = directorUnread > 0 ? 'inline-flex' : 'none';
}

/* ---------- Chat / History ---------- */
async function loadChat() {
  try {
    const data = await get(API.history);
    const history = data.history || [];

    if (currentTab !== 'intelligence' && currentIntelTab !== 'chat' && history.length > chatMessages.length) {
      chatUnread += history.length - chatMessages.length;
      updateIntelBadge();
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
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon('empty', 48)}</div><div class="empty-state-text">No messages yet. Send a command to get started.</div></div>`;
    return;
  }

  list.innerHTML = messages.map(m => {
    const meta = WORKER_META[m.workerId] || { icon: 'sophia', color: '#94a3b8' };
    const time = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
    const resultHtml = m.result
      ? `<div class="chat-result">${escapeHtml(String(m.result)).replace(/\n/g, '<br>')}</div>`
      : '';
    const errorHtml = m.error
      ? `<div class="chat-error">${icon('warning', 14)} ${escapeHtml(String(m.error))}</div>`
      : '';

    return `
      <div class="chat-bubble">
        <div class="chat-avatar" style="background:${meta.color};color:#fff">${icon(meta.icon, 22)}</div>
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

  list.scrollTop = list.scrollHeight;
}

function updateIntelBadge() {
  const badge = document.getElementById('badge-intel-nav');
  if (!badge) return;
  badge.textContent = chatUnread;
  badge.style.display = chatUnread > 0 ? 'inline-flex' : 'none';
}

/* ---------- Activity Feed ---------- */
async function loadActivityFeed() {
  try {
    const [histData, reqData] = await Promise.all([
      get(API.history),
      get(API.requests)
    ]);

    const history = histData.history || [];
    const requests = (reqData.requests || []).filter(r => r.status !== 'pending');

    const events = [
      ...history.map(h => ({
        type: h.status === 'completed' ? 'success' : h.status === 'failed' ? 'error' : 'info',
        text: h.status === 'completed'
          ? `<strong>${escapeHtml(WORKER_META[h.workerId]?.name || h.workerId)}</strong> completed a task`
          : h.status === 'failed'
          ? `<strong>${escapeHtml(WORKER_META[h.workerId]?.name || h.workerId)}</strong> failed a task`
          : `<strong>${escapeHtml(WORKER_META[h.workerId]?.name || h.workerId)}</strong> is working`,
        detail: escapeHtml(h.description || '').slice(0, 80),
        time: h.timestamp
      })),
      ...requests.map(r => ({
        type: r.status === 'completed' ? 'success' : r.status === 'failed' ? 'error' : 'info',
        text: `Task <strong>${escapeHtml(r.title)}</strong> marked ${r.status}`,
        detail: r.worker === 'auto' ? 'Auto-assigned' : `Assigned to ${escapeHtml(WORKER_META[r.worker]?.name || r.worker)}`,
        time: r.completedAt || r.createdAt
      }))
    ];

    events.sort((a, b) => new Date(b.time) - new Date(a.time));
    renderActivityFeed(events.slice(0, 20));
  } catch (err) {
    console.error('Activity feed failed:', err);
  }
}

function renderActivityFeed(events) {
  const dashboardFeed = document.getElementById('activity-feed');
  const systemFeed = document.getElementById('activity-feed-system');

  const html = events.length
    ? events.map(e => `
      <div class="activity-item">
        <div class="activity-dot ${e.type}"></div>
        <div class="activity-content">
          <div>${e.text}</div>
          ${e.detail ? `<div style="font-size:12px;margin-top:2px">${e.detail}</div>` : ''}
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${timeAgo(e.time)}</div>
        </div>
      </div>
    `).join('')
    : `<div class="empty-state" style="padding:24px"><div class="empty-state-text">No activity yet. Send a task to get started.</div></div>`;

  if (dashboardFeed) dashboardFeed.innerHTML = html;
  if (systemFeed) systemFeed.innerHTML = html;
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
    const badge = document.getElementById('badge-intel-nav');
    if (badge && items.length > 0) {
      badge.textContent = items.length;
      badge.style.display = 'inline-flex';
    }
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

/* ---------- Config (redesigned UX) ---------- */
async function loadConfig() {
  try {
    const data = await get(API.config);
    renderConfig(data);
  } catch (err) { console.error(err); }
}

function renderConfig(data) {
  const container = document.getElementById('config-container');
  if (!container) return;

  const workers = data.workers || {};
  const workerCards = Object.entries(workers).map(([id, cfg]) => {
    const meta = WORKER_META[id] || { icon: 'sophia', color: '#94a3b8' };
    return `
      <div class="config-worker-card">
        <div class="config-worker-header">
          <div class="config-worker-avatar" style="background:${meta.color};color:#fff">${icon(meta.icon, 24)}</div>
          <div>
            <div class="config-worker-name">${cfg.name}</div>
            <div class="config-worker-role">${cfg.role || ''}</div>
          </div>
        </div>
        <div class="config-worker-meta">
          <div><span class="config-label">Type:</span> ${cfg.type || '—'}</div>
          <div><span class="config-label">Transport:</span> ${cfg.transport || '—'}</div>
          <div><span class="config-label">Risk Tier:</span> <span class="badge badge-${cfg.riskTier >= 2 ? 'warning' : 'success'}">Tier ${cfg.riskTier}</span></div>
          <div><span class="config-label">Reports To:</span> ${cfg.reportsTo || cfg.isManager ? 'Director' : '—'}</div>
        </div>
        <div class="config-capabilities">
          ${(cfg.capabilities || []).map(c => `<span class="cap-chip">${c}</span>`).join('')}
        </div>
        <div class="config-description">${cfg.description || ''}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="grid grid-2">
      <div class="card config-meta-card">
        <h4>System Settings</h4>
        <div class="config-row">
          <span class="config-label">Director Name</span>
          <span class="config-value">${data.directorName || 'Director'}</span>
        </div>
        <div class="config-row">
          <span class="config-label">Gottfried Verbose</span>
          <span class="config-value">${data.gottfriedVerbose ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div class="config-row">
          <span class="config-label">Max History</span>
          <span class="config-value">${data.maxHistory || '—'}</span>
        </div>
        <div class="config-row">
          <span class="config-label">Data Directory</span>
          <span class="config-value"><code>${data.dataDir || '—'}</code></span>
        </div>
        <div class="config-row">
          <span class="config-label">State File</span>
          <span class="config-value"><code>${data.stateFile || '—'}</code></span>
        </div>
      </div>
      <div class="card config-meta-card">
        <h4>Raw JSON</h4>
        <pre class="code-block" style="max-height:280px;overflow:auto">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
      </div>
    </div>
    <h3 class="section-title">Workers</h3>
    <div class="config-workers-grid">
      ${workerCards}
    </div>
  `;
}

/* ---------- Command ---------- */
async function sendCommand() {
  const input = document.getElementById('command-input');
  const btn   = document.getElementById('cmd-btn');
  const text  = input.value.trim();
  if (!text) return;

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await post(API.command, { command: text, source: 'dashboard' });
    toast('Command sent: ' + res.parsed?.description?.slice(0, 60), 'success');
    input.value = '';
    setTimeout(() => {
      refreshAll();
      if (currentTab === 'intelligence' && currentIntelTab === 'chat') loadChat();
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

/* ---------- Icons Init ---------- */
function initIcons() {
  const logo = document.getElementById('logo-icon');
  if (logo) logo.innerHTML = icon('logo', 32);

  const footerLogo = document.getElementById('footer-logo');
  if (footerLogo) footerLogo.innerHTML = icon('logo', 16);

  document.querySelectorAll('.nav-icon[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    if (name) el.innerHTML = icon(name, 18);
  });
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  refreshAll();
  startChatPolling();

  // Periodic full refresh every 15s
  setInterval(() => refreshAll(), 15000);
});
