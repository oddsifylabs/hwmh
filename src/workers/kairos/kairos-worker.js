/**
 * KAIROS HERMES - WORKER CLIENT
 * HAMH Free Tier - Sales & Marketing
 *
 * Polls HAMH for lead generation, outreach, CRM, and campaign tasks.
 */

const axios = require('axios');
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================

const HAMH_BASE_URL = process.env.HAMH_BASE_URL || 'http://localhost:3000';
const AGENT_ID = 'kairos';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS) || 30000;

const hamhApi = axios.create({
  baseURL: HAMH_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Kairos-Hermes-Worker/1.0'
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

  async 'lead-generation'(task) {
    log('info', `Lead gen: ${task.description}`);
    const result = {
      action: 'lead-generation',
      description: task.description,
      status: 'simulated',
      message: 'Lead gen stub. Wire in LinkedIn scraping, Apollo.io, or web research.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'sales'(task) {
    log('info', `Sales task: ${task.description}`);
    const result = {
      action: 'sales',
      description: task.description,
      status: 'simulated',
      message: 'Sales stub. Wire in outreach sequences, proposal generation, or demo scheduling.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'marketing'(task) {
    log('info', `Marketing: ${task.description}`);
    const result = {
      action: 'marketing',
      description: task.description,
      status: 'simulated',
      message: 'Marketing stub. Wire in campaign creation, ad copy, or funnel analytics.',
      executedAt: new Date().toISOString()
    };
    return { success: true, result };
  },

  async 'crm'(task) {
    log('info', `CRM: ${task.description}`);
    const result = {
      action: 'crm',
      description: task.description,
      status: 'simulated',
      message: 'CRM stub. Wire in HubSpot, Salesforce, or Airtable integration.',
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
      message: 'Analytics stub. Wire in pipeline metrics, conversion tracking, or reporting.',
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
      message: 'Content strategy stub. Wire in SEO research, competitor analysis, or campaign planning.',
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

log('info', `Kairos Hermes Worker starting...`);
log('info', `HAMH: ${HAMH_BASE_URL}`);
log('info', `Poll interval: ${POLL_INTERVAL_MS}ms`);

pollForTasks();
setInterval(pollForTasks, POLL_INTERVAL_MS);
