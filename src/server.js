/**
 * HWMH - Hermes Workers Management Hub
 * Main Server
 *
 * Architecture:
 *   Director (You) -> Sophia (Manager) -> Gottfried (Brain) -> Workers (Iris, Pheme, Kairos)
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { Sophia } = require('./sophia/sophia');
const { TelegramBotOrchestrator } = require('./telegram/telegram-bots');
const telegramAlerts = require('./alerts/telegram-alerts');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================
// PERSISTENCE
// ============================================

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load state:', err.message);
  }
  return null;
}

function saveState(state) {
  try {
    ensureDir(DATA_DIR);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Failed to save state:', err.message);
  }
}

// ============================================
// AUTHENTICATION
// ============================================
const secrets = require('./lib/secrets');
const API_KEY = secrets.getSecret('API_KEY');

function requireAuth(req, res, next) {
  if (!API_KEY) return next(); // Dev mode
  const provided = req.headers['x-api-key'] || req.query.apiKey;
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Provide X-API-Key header.' });
  }
  next();
}

// ============================================
// CONFIG LOADER
// ============================================

function loadWorkersConfig() {
  const configPath = secrets.getSecret('WORKERS_CONFIG_PATH') || path.join(__dirname, '..', 'config', 'workers.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log(`[CONFIG] Loaded workers from ${configPath}`);
      return config;
    } catch (err) {
      console.error(`[CONFIG] Failed to load ${configPath}: ${err.message}`);
    }
  }
  return null;
}

// ============================================
// DEFAULT WORKER CONFIG
// ============================================

const DEFAULT_WORKERS = {
  sophia: {
    name: 'Sophia Hermes',
    type: 'director-facing',
    transport: 'internal',
    role: 'orchestrator',
    capabilities: ['task-orchestration', 'flow-control', 'agent-delegation', 'status-synthesis', 'director-reports', 'writing', 'research', 'admin'],
    description: 'The Manager. The only agent that speaks with the Director. Controls task flow between all agents.',
    isManager: true,
    riskTier: 2
  },
  iris: {
    name: 'Iris Hermes',
    type: 'local',
    transport: 'poll',
    capabilities: ['admin', 'schedule', 'research', 'documentation', 'email', 'reminder'],
    role: 'admin-assistant',
    description: 'Admin Assistant. Schedules, organizes, researches, and documents.',
    reportsTo: 'sophia',
    riskTier: 1
  },
  pheme: {
    name: 'Pheme Hermes',
    type: 'local',
    transport: 'poll',
    capabilities: ['post-x', 'engagement', 'analytics', 'schedule', 'content-strategy', 'curate-content'],
    role: 'social-media-manager',
    description: 'Social Media Manager. Creates content, manages engagement, tracks analytics.',
    reportsTo: 'sophia',
    riskTier: 2
  },
  kairos: {
    name: 'Kairos Hermes',
    type: 'local',
    transport: 'poll',
    capabilities: ['lead-generation', 'sales', 'marketing', 'crm', 'analytics', 'content-strategy'],
    role: 'sales-marketing',
    description: 'Sales & Marketing. Generates leads, manages outreach, tracks pipeline.',
    reportsTo: 'sophia',
    riskTier: 2
  }
};

const WORKERS_RAW = loadWorkersConfig() || DEFAULT_WORKERS;
// Filter out metadata keys like $schema, _comment
const WORKERS = Object.fromEntries(
  Object.entries(WORKERS_RAW).filter(([k]) => !k.startsWith('$') && !k.startsWith('_'))
);

// ============================================
// SOPHIA INSTANCE
// ============================================

const pendingNotifications = new Map(); // taskId -> { chatId, source, user }

const sophia = new Sophia({
  directorName: secrets.getSecret('DIRECTOR_NAME') || 'Director',
  gottfried: { verbose: secrets.getSecret('GOTTFRIED_VERBOSE') === 'true' },
  onDelegate: (assignments) => {
    // Push tasks to actual worker queues
    for (const assignment of assignments) {
      const task = {
        id: assignment.taskId,
        workerId: assignment.workerId,
        description: assignment.task,
        status: 'queued',
        timestamp: new Date().toISOString(),
        parentTaskId: assignment.parentTaskId
      };
      if (queues[assignment.workerId]) {
        queues[assignment.workerId].push(task);
        workerStatus[assignment.workerId].queueLength = queues[assignment.workerId].length;
        console.log(`[QUEUE] Task ${assignment.taskId} -> @${assignment.workerId} (${assignment.task.slice(0, 60)})`);
        // Alert if queue backs up
        const qLen = queues[assignment.workerId].length;
        if (qLen >= 10) {
          telegramAlerts.alertQueueBackup(assignment.workerId, WORKERS[assignment.workerId]?.name || assignment.workerId, qLen);
        }
      }
    }
  },
  onNotify: (notification) => {
    // Store notification for Telegram layer to pick up
    // The Telegram bots poll or use a webhook to check for notifications
    pendingNotifications.set(notification.taskId, notification);
    console.log(`[NOTIFY] Task ${notification.taskId} completed by @${notification.workerId}, success=${notification.success}`);
  }
});

// ============================================
// TASK QUEUES
// ============================================

const queues = {};
const workerStatus = {};

function initQueues() {
  for (const id of Object.keys(WORKERS)) {
    queues[id] = [];
    workerStatus[id] = { status: 'idle', lastSeen: null, queueLength: 0 };
  }
}
initQueues();
telegramAlerts.startOfflineMonitor(() => workerStatus, () => WORKERS);

function loadPersistedState() {
  const state = loadState();
  if (state && state.queues) {
    for (const [id, tasks] of Object.entries(state.queues)) {
      if (queues[id]) queues[id] = tasks;
    }
  }
}
loadPersistedState();

function persistState() {
  const state = { queues, workerStatus, timestamp: new Date().toISOString() };
  saveState(state);
}

setInterval(persistState, 30000); // Persist every 30s

// ============================================
// COMMAND PARSER
// ============================================

function parseCommand(text) {
  const trimmed = text.trim();

  // @sophia command (to manager)
  const sophiaMatch = trimmed.match(/^@sophia\s+(.+)$/i);
  if (sophiaMatch) {
    return { type: 'manager-directive', workerId: 'sophia', description: sophiaMatch[1] };
  }

  // Agent -> Sophia escalation
  const agentToSophiaMatch = trimmed.match(/^@sophia\s+from\s+@(iris|pheme|kairos)\s*:\s*(.+)$/i);
  if (agentToSophiaMatch) {
    return { type: 'agent-to-manager', agentId: agentToSophiaMatch[1].toLowerCase(), description: agentToSophiaMatch[2] };
  }

  // @worker command
  const mentionMatch = trimmed.match(/^@(iris|pheme|kairos|sophia)\s+(.+)$/i);
  if (mentionMatch) {
    return { type: 'worker-task', workerId: mentionMatch[1].toLowerCase(), description: mentionMatch[2] };
  }

  return { type: 'unknown', raw: trimmed };
}

// ============================================
// ROUTES
// ============================================

// Root serves dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Status endpoint
app.get('/status', (req, res) => {
  const report = sophia.statusReport(workerStatus);
  res.json(report);
});

// Worker status
app.get('/workers', (req, res) => {
  // Sophia runs inside the server — she's always online when this responds
  workerStatus.sophia.lastSeen = new Date().toISOString();
  workerStatus.sophia.status = 'idle';
  res.json({
    workers: WORKERS,
    status: workerStatus,
    queues: Object.fromEntries(Object.entries(queues).map(([k, v]) => [k, v.length]))
  });
});

// Command endpoint — open to dashboard (same-origin requests)
app.post('/command', async (req, res) => {
  const { command, source = 'api', chatId, user } = req.body;
  if (!command) return res.status(400).json({ error: 'Missing command field' });

  const parsed = parseCommand(command);
  const taskId = uuidv4();

  if (parsed.type === 'manager-directive' || parsed.type === 'unknown') {
    // Route everything through Sophia + Gottfried
    const desc = parsed.type === 'unknown' ? parsed.raw : parsed.description;
    const result = await sophia.receive({
      id: taskId,
      description: desc,
      source,
      chatId,
      user,
      timestamp: new Date().toISOString()
    });
    return res.json({ success: true, taskId, parsed: { type: 'manager-directive', description: desc }, result });
  }

  if (parsed.type === 'worker-task') {
    // Even @worker commands go through Sophia first
    const result = await sophia.receive({
      id: taskId,
      description: command,
      source,
      chatId,
      user,
      timestamp: new Date().toISOString()
    });
    return res.json({ success: true, taskId, parsed, result });
  }

  if (parsed.type === 'agent-to-manager') {
    const result = await sophia.receive({
      id: taskId,
      description: `[From @${parsed.agentId}] ${parsed.description}`,
      source: 'agent',
      agentId: parsed.agentId,
      chatId,
      user,
      timestamp: new Date().toISOString()
    });
    return res.json({ success: true, taskId, parsed, result });
  }

  res.status(400).json({ error: 'Could not parse command', parsed });
});

// Notification polling for Telegram bots
app.get('/notifications/:chatId', requireAuth, (req, res) => {
  const { chatId } = req.params;
  const notifications = [];
  for (const [taskId, notification] of pendingNotifications.entries()) {
    if (String(notification.chatId) === String(chatId)) {
      notifications.push(notification);
      pendingNotifications.delete(taskId);
    }
  }
  res.json({ chatId, notifications, count: notifications.length });
});

// Worker polling
app.get('/poll/:workerId', (req, res) => {
  const { workerId } = req.params;
  if (!WORKERS[workerId]) return res.status(404).json({ error: 'Unknown worker' });

  workerStatus[workerId].lastSeen = new Date().toISOString();
  workerStatus[workerId].status = 'polling';

  const queue = queues[workerId];
  const task = queue.find(t => t.status === 'queued');

  if (task) {
    task.status = 'active';
    task.startedAt = new Date().toISOString();
    workerStatus[workerId].status = 'working';
    workerStatus[workerId].currentTask = task.id;
    return res.json({ task });
  }

  workerStatus[workerId].status = 'idle';
  res.status(404).json({ message: 'No tasks available' });
});

// Worker completion
app.post('/complete/:workerId', (req, res) => {
  const { workerId } = req.params;
  const { taskId, success, result, error } = req.body;

  if (!WORKERS[workerId]) return res.status(404).json({ error: 'Unknown worker' });

  const queue = queues[workerId];
  const taskIndex = queue.findIndex(t => t.id === taskId);

  if (taskIndex === -1) return res.status(404).json({ error: 'Task not found' });

  const task = queue[taskIndex];
  task.status = success ? 'completed' : 'failed';
  task.completedAt = new Date().toISOString();
  task.result = result;
  task.error = error;

  // Move to history instead of deleting
  queue.splice(taskIndex, 1);

  workerStatus[workerId].status = 'idle';
  workerStatus[workerId].queueLength = queue.length;
  delete workerStatus[workerId].currentTask;

  // Notify Sophia
  sophia.handleCompletion(workerId, { taskId, success, result, error });

  // Save to history for chat feed
  const historyEntry = {
    id: taskId,
    workerId,
    description: task.description,
    status: task.status,
    result: result || null,
    error: error || null,
    timestamp: task.completedAt,
    startedAt: task.startedAt || null,
    parentTaskId: task.parentTaskId || null
  };
  if (!global.taskHistory) global.taskHistory = [];
  global.taskHistory.unshift(historyEntry);
  if (global.taskHistory.length > 500) global.taskHistory.pop();

  // Telegram alerts
  if (!success) {
    telegramAlerts.alertTaskFailed(workerId, WORKERS[workerId]?.name || workerId, taskId, error);
    telegramAlerts.recordError();
  }

  res.json({ success: true, message: `Task ${taskId} marked as ${task.status}` });
});

// Queue inspection
app.get('/queue/:workerId', requireAuth, (req, res) => {
  const { workerId } = req.params;
  if (!WORKERS[workerId]) return res.status(404).json({ error: 'Unknown worker' });
  res.json({ workerId, queue: queues[workerId] });
});

// ============================================
// DASHBOARD API
// ============================================

// All tasks across all workers (for dashboard)
app.get('/api/tasks', (req, res) => {
  const allTasks = [];
  for (const [workerId, queue] of Object.entries(queues)) {
    for (const task of queue) {
      allTasks.push({ ...task, workerId });
    }
  }
  // Also include recently completed from state file if available
  try {
    const state = loadState();
    if (state && state.history) {
      for (const task of state.history) {
        allTasks.push(task);
      }
    }
  } catch (_) {}
  allTasks.sort((a, b) => new Date(b.timestamp || b.startedAt || 0) - new Date(a.timestamp || a.startedAt || 0));
  res.json({ tasks: allTasks });
});

// Recent logs/activity (for dashboard)
app.get('/api/logs', (req, res) => {
  const logs = [];
  // Sophia logs
  if (sophia.taskHistory && sophia.taskHistory.length) {
    logs.push(...sophia.taskHistory.slice(-100));
  }
  // Gottfried logs
  if (sophia.gottfried && sophia.gottfried.reasoningLog && sophia.gottfried.reasoningLog.length) {
    for (const entry of sophia.gottfried.reasoningLog.slice(-50)) {
      logs.push({ ...entry, agent: 'Gottfried' });
    }
  }
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ logs: logs.slice(0, 100) });
});

// Health check for Railway — ALWAYS return 200 if the server is responsive.
// Railway only checks this at deploy time to know when to route traffic.
// Worker health / detailed status lives at /status.
app.get('/health', (req, res) => {
  const memory = process.memoryUsage();
  res.status(200).json({
    status: 'healthy',
    service: 'hwmh',
    version: '1.0.2',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB'
    }
  });
});

// Update Sophia's heartbeat since she runs inside the server
setInterval(() => {
  workerStatus.sophia.lastSeen = new Date().toISOString();
  workerStatus.sophia.status = 'idle';
}, 10000);

// ============================================
// DASHBOARD CONTROL API
// ============================================

// System information
app.get('/api/system', (req, res) => {
  res.json({
    version: '1.0.0',
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: secrets.getSecret('NODE_ENV') || 'development',
    port: PORT,
    workersConfigured: Object.keys(WORKERS),
    timestamp: new Date().toISOString()
  });
});

// Gottfried reasoning log
app.get('/api/reasoning', (req, res) => {
  const log = sophia.gottfried ? sophia.gottfried.reasoningLog.slice(-100).reverse() : [];
  res.json({ reasoning: log });
});

// Sophia decision history
app.get('/api/decisions', (req, res) => {
  const decisions = (sophia.taskHistory || [])
    .filter(e => e.level === 'info' && e.message && (e.message.includes('delegat') || e.message.includes('Received command') || e.message.includes('processed')))
    .slice(-100)
    .reverse();
  res.json({ decisions });
});

// Error log
app.get('/api/errors', (req, res) => {
  const logs = [];
  if (sophia.taskHistory && sophia.taskHistory.length) {
    logs.push(...sophia.taskHistory.filter(e => e.level === 'error' || e.level === 'warn'));
  }
  if (sophia.gottfried && sophia.gottfried.reasoningLog) {
    logs.push(...sophia.gottfried.reasoningLog.filter(e => e.level === 'error' || e.level === 'warn'));
  }
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ errors: logs.slice(0, 100) });
});

// Current configuration
app.get('/api/config', (req, res) => {
  res.json({
    workers: WORKERS,
    directorName: sophia.directorName,
    gottfriedVerbose: sophia.gottfried.verbose || false,
    maxHistory: sophia.maxHistory,
    dataDir: DATA_DIR,
    stateFile: STATE_FILE
  });
});

// Task history (chat feed)
app.get('/api/history', (req, res) => {
  const history = global.taskHistory || [];
  res.json({ history: history.slice(0, 100) });
});

// Clear worker queue
app.post('/api/workers/:workerId/clear', (req, res) => {
  const { workerId } = req.params;
  if (!WORKERS[workerId]) return res.status(404).json({ error: 'Unknown worker' });
  const cleared = queues[workerId].length;
  queues[workerId] = [];
  workerStatus[workerId].queueLength = 0;
  workerStatus[workerId].status = 'idle';
  delete workerStatus[workerId].currentTask;
  persistState();
  res.json({ success: true, workerId, cleared, message: `Cleared ${cleared} tasks from ${workerId}` });
});

// Reset worker status
app.post('/api/workers/:workerId/reset', (req, res) => {
  const { workerId } = req.params;
  if (!WORKERS[workerId]) return res.status(404).json({ error: 'Unknown worker' });
  workerStatus[workerId] = { status: 'idle', lastSeen: null, queueLength: queues[workerId].length };
  res.json({ success: true, workerId, message: `Reset ${workerId} status` });
});

// Recent errors
app.get('/api/errors', (req, res) => {
  const errors = [];
  if (sophia.taskHistory) {
    errors.push(...sophia.taskHistory.filter(e => e.level === 'error').slice(-50));
  }
  if (sophia.gottfried && sophia.gottfried.reasoningLog) {
    errors.push(...sophia.gottfried.reasoningLog.filter(e => e.level === 'error').slice(-50).map(e => ({...e, agent: 'Gottfried'})));
  }
  errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ errors: errors.slice(0, 50) });
});

// ============================================
// NEW FEATURES: Requests, Profiles, Director Chat
// ============================================

// Structured task requests storage
if (!global.taskRequests) global.taskRequests = [];
if (!global.sophiaConversation) global.sophiaConversation = [];

// POST /api/requests — Create a structured task request
app.post('/api/requests', async (req, res) => {
  const { title, description, worker = 'auto', priority = 'normal', category = 'general', tags = [] } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  const requestId = uuidv4();
  const request = {
    id: requestId,
    title: title.trim(),
    description: description.trim(),
    worker,
    priority,
    category,
    tags,
    status: 'pending',
    createdAt: new Date().toISOString(),
    taskId: null
  };

  global.taskRequests.unshift(request);
  if (global.taskRequests.length > 500) global.taskRequests.pop();

  // If auto, route through Sophia; otherwise direct to worker
  const commandText = worker === 'auto'
    ? `@sophia ${title}: ${description}`
    : `@${worker} ${title}: ${description}`;

  try {
    const result = await sophia.receive({
      id: requestId,
      description: commandText,
      source: 'dashboard-request',
      metadata: { title, priority, category, tags, originalWorker: worker },
      timestamp: new Date().toISOString()
    });

    request.status = 'queued';
    request.taskId = requestId;

    res.json({ success: true, request, result });
  } catch (err) {
    request.status = 'failed';
    request.error = err.message;
    res.status(500).json({ error: err.message, request });
  }
});

// GET /api/requests — List structured task requests
app.get('/api/requests', (req, res) => {
  const { status, worker, priority } = req.query;
  let requests = global.taskRequests || [];
  if (status) requests = requests.filter(r => r.status === status);
  if (worker) requests = requests.filter(r => r.worker === worker);
  if (priority) requests = requests.filter(r => r.priority === priority);
  res.json({ requests: requests.slice(0, 200) });
});

// GET /api/workers/:workerId/profile — Worker profile with stats
app.get('/api/workers/:workerId/profile', (req, res) => {
  const { workerId } = req.params;
  if (!WORKERS[workerId]) return res.status(404).json({ error: 'Unknown worker' });

  const cfg = WORKERS[workerId];
  const history = (global.taskHistory || []).filter(t => t.workerId === workerId);
  const completed = history.filter(t => t.status === 'completed');
  const failed = history.filter(t => t.status === 'failed');

  const total = history.length;
  const successRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  // Average completion time
  const durations = completed
    .filter(t => t.startedAt && t.timestamp)
    .map(t => new Date(t.timestamp) - new Date(t.startedAt));
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000)
    : 0;

  // Recent outputs (last 20 completed)
  const recentOutputs = completed
    .slice(0, 20)
    .map(t => ({
      taskId: t.id,
      description: t.description,
      result: t.result,
      completedAt: t.timestamp,
      duration: t.startedAt ? Math.round((new Date(t.timestamp) - new Date(t.startedAt)) / 1000) : null
    }));

  // Activity timeline (last 30 events)
  const timeline = history
    .slice(0, 30)
    .map(t => ({
      taskId: t.id,
      status: t.status,
      description: t.description,
      timestamp: t.timestamp,
      result: t.result ? String(t.result).slice(0, 200) : null,
      error: t.error ? String(t.error).slice(0, 200) : null
    }));

  res.json({
    workerId,
    name: cfg.name,
    role: cfg.role,
    description: cfg.description,
    capabilities: cfg.capabilities || [],
    riskTier: cfg.riskTier,
    stats: {
      totalTasks: total,
      completed: completed.length,
      failed: failed.length,
      successRate,
      avgDurationSeconds: avgDuration,
      queueLength: queues[workerId]?.length || 0
    },
    status: workerStatus[workerId] || {},
    recentOutputs,
    timeline
  });
});

// POST /api/sophia/message — Director sends message to Sophia
app.post('/api/sophia/message', async (req, res) => {
  const { message, type = 'chat' } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const msgId = uuidv4();
  const directorName = secrets.getSecret('DIRECTOR_NAME') || 'Director';

  const userMsg = {
    id: msgId,
    sender: 'director',
    senderName: directorName,
    text: message.trim(),
    type,
    timestamp: new Date().toISOString()
  };

  global.sophiaConversation.push(userMsg);

  // Route through Sophia
  let sophiaReply = null;
  try {
    const result = await sophia.receive({
      id: msgId,
      description: message.trim(),
      source: 'director-chat',
      timestamp: new Date().toISOString()
    });

    sophiaReply = {
      id: uuidv4(),
      sender: 'sophia',
      senderName: 'Sophia Hermes',
      text: result?.reply || result?.message || 'Acknowledged. I will handle this.',
      type: 'response',
      timestamp: new Date().toISOString(),
      taskId: msgId,
      delegated: result?.delegated || []
    };

    global.sophiaConversation.push(sophiaReply);
  } catch (err) {
    sophiaReply = {
      id: uuidv4(),
      sender: 'sophia',
      senderName: 'Sophia Hermes',
      text: `I encountered an issue: ${err.message}`,
      type: 'error',
      timestamp: new Date().toISOString()
    };
    global.sophiaConversation.push(sophiaReply);
  }

  // Trim conversation history
  if (global.sophiaConversation.length > 500) {
    global.sophiaConversation = global.sophiaConversation.slice(-500);
  }

  res.json({ success: true, userMsg, sophiaReply });
});

// GET /api/sophia/conversation — Get director <-> Sophia chat history
app.get('/api/sophia/conversation', (req, res) => {
  const { limit = 100, after } = req.query;
  let conversation = global.sophiaConversation || [];
  if (after) {
    conversation = conversation.filter(m => new Date(m.timestamp) > new Date(after));
  }
  res.json({
    conversation: conversation.slice(-parseInt(limit)),
    directorName: secrets.getSecret('DIRECTOR_NAME') || 'Director'
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = secrets.getSecret('PORT') || 3000;
const HOST = secrets.getSecret('HOST') || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  HWMH - Hermes Workers Management Hub          ║
║  Version 1.0.0 | MIT License                   ║
║                                               ║
║  Manager:  Sophia Hermes                      ║
║  Brain:    Gottfried (Leibniz Logic Engine)   ║
║  Workers:  Iris · Pheme · Kairos              ║
║                                               ║
║  Listening on port ${PORT}                          ║
╚═══════════════════════════════════════════════════════╝
  `);

  // Audit secrets at startup (masked)
  secrets.auditLog();

  // Initialize Telegram alert bot
  telegramAlerts.init();
  telegramAlerts.alertSystemRestart(process.uptime());

  // Initialize Telegram bots
  const telegramBots = new TelegramBotOrchestrator();
  telegramBots.start();
});
