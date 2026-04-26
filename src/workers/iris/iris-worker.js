/**
 * IRIS HERMES - WORKER CLIENT
 * HAMH Free Tier - Admin Assistant
 *
 * Polls HAMH for admin, scheduling, documentation, and research tasks.
 */

const axios = require('axios');
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================

const HAMH_BASE_URL = process.env.HAMH_BASE_URL || 'http://localhost:3000';
const AGENT_ID = 'iris';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS) || 30000;

const hamhApi = axios.create({
  baseURL: HAMH_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Iris-Hermes-Worker/1.0'
  }
});

function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

// ============================================
// TASK HANDLERS
// ============================================

const handlers = {

  async 'admin'(task) {
    log('info', `Admin task: ${task.description}`);
    const result = {
      action: 'admin',
      description: task.description,
      status: 'simulated',
      message: 'Admin stub. Wire in calendar, email, or file organization logic.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'schedule'(task) {
    log('info', `Schedule: ${task.description}`);
    const result = {
      action: 'schedule',
      description: task.description,
      status: 'simulated',
      message: 'Schedule stub. Wire in calendar API (Google, Outlook, etc.).',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'research'(task) {
    log('info', `Research: ${task.description}`);
    const result = {
      action: 'research',
      description: task.description,
      status: 'simulated',
      message: 'Research stub. Wire in web search, data gathering, or RAG pipeline.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'documentation'(task) {
    log('info', `Documentation: ${task.description}`);
    const result = {
      action: 'documentation',
      description: task.description,
      status: 'simulated',
      message: 'Documentation stub. Wire in markdown generation, note-taking, or wiki updates.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'email'(task) {
    log('info', `Email: ${task.description}`);
    const result = {
      action: 'email',
      description: task.description,
      status: 'simulated',
      message: 'Email stub. Wire in SMTP/IMAP integration or email API.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'reminder'(task) {
    log('info', `Reminder: ${task.description}`);
    const result = {
      action: 'reminder',
      description: task.description,
      status: 'simulated',
      message: 'Reminder stub. Wire in notification system or cron jobs.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  }
};

// ============================================
// POLLING LOOP
// ============================================

async function pollForTasks() {
  try {
    log('debug', `Polling ${HAMH_BASE_URL}/poll/${AGENT_ID}`);
    const { data } = await hamhApi.get(`/poll/${AGENT_ID}`);

    if (!data.task) {
      log('debug', 'No tasks available');
      return;
    }

    const task = data.task;
    log('info', `Received task: ${task.id} | ${task.type} | ${task.description}`);

    const handler = handlers[task.type];
    let taskResult;

    if (handler) {
      taskResult = await handler(task);
    } else {
      log('warn', `No handler for task type: ${task.type}`);
      taskResult = {
        success: false,
        error: `Unknown task type: ${task.type}`,
        availableTypes: Object.keys(handlers)
      };
    }

    await hamhApi.post(`/complete/${AGENT_ID}`, {
      taskId: task.id,
      ...taskResult
    });

    log('info', `Task ${task.id} completed`);

  } catch (err) {
    if (err.response && err.response.status === 404) {
      log('debug', 'No tasks (404)');
    } else {
      log('error', `Poll failed: ${err.message}`);
    }
  }
}

// ============================================
// MAIN
// ============================================

log('info', `Iris Hermes Worker starting...`);
log('info', `HAMH: ${HAMH_BASE_URL}`);
log('info', `Poll interval: ${POLL_INTERVAL_MS}ms`);

pollForTasks();
setInterval(pollForTasks, POLL_INTERVAL_MS);
