/**
 * PHEME HERMES - WORKER CLIENT
 * HAMH Free Tier - Social Media Manager
 *
 * Polls HAMH for social media content, scheduling, engagement, and analytics tasks.
 */

const axios = require('axios');
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================

const HAMH_BASE_URL = process.env.HAMH_BASE_URL || 'http://localhost:3000';
const AGENT_ID = 'pheme';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS) || 30000;

const hamhApi = axios.create({
  baseURL: HAMH_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Pheme-Hermes-Worker/1.0'
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

  async 'post-x'(task) {
    log('info', `Executing post-x: ${task.description}`);
    const result = {
      action: 'post-x',
      description: task.description,
      status: 'simulated',
      message: 'X post handler ready. Implement actual posting logic (xurl, API, or puppeteer).',
      postedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'engagement'(task) {
    log('info', `Executing engagement: ${task.description}`);
    const result = {
      action: 'engagement',
      description: task.description,
      status: 'simulated',
      message: 'Engagement handler ready. Implement reply/like/retweet/follow logic.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'analytics'(task) {
    log('info', `Analytics: ${task.description}`);
    const result = {
      action: 'analytics',
      description: task.description,
      status: 'simulated',
      message: 'Analytics stub. Wire in social platform metrics or reporting.',
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
      message: 'Schedule stub. Wire in content calendar or post scheduling API.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'content-strategy'(task) {
    log('info', `Content strategy: ${task.description}`);
    const result = {
      action: 'content-strategy',
      description: task.description,
      status: 'simulated',
      message: 'Content strategy stub. Wire in trend analysis, hashtag research, or campaign planning.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'curate-content'(task) {
    log('info', `Curate content: ${task.description}`);
    const result = {
      action: 'curate-content',
      description: task.description,
      status: 'simulated',
      message: 'Content curation stub. Wire in RSS, news aggregation, or source monitoring.',
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

log('info', `Pheme Hermes Worker starting...`);
log('info', `HAMH: ${HAMH_BASE_URL}`);
log('info', `Poll interval: ${POLL_INTERVAL_MS}ms`);

pollForTasks();
setInterval(pollForTasks, POLL_INTERVAL_MS);
