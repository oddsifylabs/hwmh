/* ============================================================
   HWMH Dashboard JS v2
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
  clear:     (id) => `/api/workers/${id}/clear`,
  reset:     (id) => `/api/workers/${id}/reset`,
};

let currentTab = 'dashboard';
let chatMessages = [];
let chatUnread = 0;
let chatPollInterval = null;
let directorUnread = 0;
let directorPollInterval = null;
let workersData = null;

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
  if (tab === 'director') {
    directorUnread = 0;
    updateDirectorBadge();
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
  if (tab === 'request') loadRequests();
  if (tab === 'profiles') loadProfiles();
  if (tab === 'director') loadDirectorChat();
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
    if (currentTab === 'tasks') loadTasks();
    if (currentTab === 'system') loadSystem();
    if (currentTab === 'profiles') loadProfiles();
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

/* ---------- Profiles ---------- */
async function loadProfiles() {
  try {
    const data = workersData || await get(API.workers);
    renderProfiles(data.workers, data.status);
  } catch (err) {
    console.error('Profiles load failed:', err);
  }
}

function renderProfiles(workers, status) {
  const grid = document.getElementById('profile-grid');
  if (!grid) return;

  grid.innerHTML = Object.entries(workers).map(([id, info]) => {
    const meta = WORKER_META[id] || { icon: 'sophia', color: '#94a3b8' };
    const st = status[id] || {};
    const isOnline = st.status !== 'offline';
    return `
      <div class="profile-card" onclick="openProfile('${id}')">
        <div class="profile-card-header">
          <div class="profile-avatar" style="background:${meta.color};color:#fff">${icon(meta.icon, 32)}</div>
          <div class="profile-info">
            <div class="profile-name">${info.name}</div>
            <div class="profile-role">${info.role || ''}</div>
          </div>
          <span class="worker-status-badge ${isOnline ? 'badge-success' : 'badge-danger'}">${isOnline ? 'Online' : 'Offline'}</span>
        </div>
        <div class="worker-capabilities">
          ${(info.capabilities || []).slice(0, 5).map(c => `<span class="cap-chip">${c}</span>`).join('')}
        </div>
        <div class="profile-stats">
          <div class="profile-stat">
            <div class="profile-stat-value" id="stat-${id}-total">-</div>
            <div class="profile-stat-label">Tasks</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-value" id="stat-${id}-rate">-</div>
            <div class="profile-stat-label">Success</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-value" id="stat-${id}-queue">${st.queueLength || 0}</div>
            <div class="profile-stat-label">Queue</div>
          </div>
        </div>
        <button class="btn btn-sm btn-primary profile-view-btn" onclick="event.stopPropagation();openProfile('${id}')">View Profile</button>
      </div>
    `;
  }).join('');

  // Load stats in background
  Object.keys(workers).forEach(id => loadProfileStats(id));
}

async function loadProfileStats(workerId) {
  try {
    const data = await get(API.profile(workerId));
    const totalEl = document.getElementById(`stat-${workerId}-total`);
    const rateEl = document.getElementById(`stat-${workerId}-rate`);
    if (totalEl) totalEl.textContent = data.stats.totalTasks;
    if (rateEl) rateEl.textContent = data.stats.successRate + '%';
  } catch (err) {
    console.error('Profile stats failed:', err);
  }
}

async function openProfile(workerId) {
  try {
    const data = await get(API.profile(workerId));
    renderProfileDetail(data);
    switchTab('profile-detail');
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
              ${o.result ? `<div class="chat-result">${escapeHtml(String(o.result))}</div>` : ''}
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
              ${t.result ? `<div class="timeline-result">${escapeHtml(t.result)}</div>` : ''}
              ${t.error ? `<div class="timeline-error">${escapeHtml(t.error)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
  `;
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

/* ---------- Request Form ---------- */
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
    toast(`Request submitted: ${res.request.title.slice(0, 40)}`, 'success');
    clearRequestForm();
    loadRequests();
  } catch (err) {
    toast('Submit failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icon('request', 14)} Submit Request`;
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
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px"><div class="empty-state"><div class="empty-state-icon">${icon('request', 48)}</div><div class="empty-state-text">No requests yet. Create one above!</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(r => `
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
    const avatarIcon = isDirector ? 'profiles' : 'sophia';
    const color = isDirector ? '#6366f1' : '#f59e0b';
    const name = isDirector ? directorName : 'Sophia Hermes';

    return `
      <div class="director-msg ${m.sender}">
        <div class="director-msg-avatar" style="background:${color};color:#fff">${icon(avatarIcon, 20)}</div>
        <div class="director-msg-body">
          <div class="director-msg-name">${name}</div>
          <div class="director-msg-text">${escapeHtml(m.text || '')}</div>
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
    // Refresh full conversation
    setTimeout(loadDirectorChat, 300);
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

/* ---------- Icons Init ---------- */
function initIcons() {
  // Logo
  const logo = document.getElementById('logo-icon');
  if (logo) logo.innerHTML = icon('logo', 32);

  // Footer logo
  const footerLogo = document.getElementById('footer-logo');
  if (footerLogo) footerLogo.innerHTML = icon('logo', 16);

  // Sidebar nav icons
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
