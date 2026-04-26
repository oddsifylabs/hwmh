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
const API_KEY = process.env.API_KEY;

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
  const configPath = process.env.WORKERS_CONFIG_PATH || path.join(__dirname, '..', 'config', 'workers.json');
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
  directorName: process.env.DIRECTOR_NAME || 'Director',
  gottfried: { verbose: process.env.GOTTFRIED_VERBOSE === 'true' },
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
  res.json({
    workers: WORKERS,
    status: workerStatus,
    queues: Object.fromEntries(Object.entries(queues).map(([k, v]) => [k, v.length]))
  });
});

// Command endpoint
app.post('/command', requireAuth, async (req, res) => {
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

// Health check for Railway
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'hwmh', timestamp: new Date().toISOString() });
});

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
    env: process.env.NODE_ENV || 'development',
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

// Clear worker queue
app.post('/api/workers/:workerId/clear', requireAuth, (req, res) => {
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
app.post('/api/workers/:workerId/reset', requireAuth, (req, res) => {
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
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

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

  // Initialize Telegram bots
  const telegramBots = new TelegramBotOrchestrator();
  telegramBots.start();
});
