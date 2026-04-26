/**
 * HWMH Telegram Alert Pager
 *
 * Lightweight one-way alert system.
 * Sends critical events to the Director's Telegram DM.
 * Responds to /hwmh status command.
 *
 * Future paid upgrade: multi-platform (Slack, Discord, WhatsApp, Email)
 */

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ============================================
// CONFIG
// ============================================

const BOT_TOKEN = process.env.TELEGRAM_ALERT_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID;
const HWMH_BASE_URL = process.env.HWMH_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const ALERT_ENABLED = BOT_TOKEN && CHAT_ID;

// Throttling / dedup
const lastAlert = new Map(); // key -> timestamp
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes for same alert type

// Offline detection
const OFFLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes without poll = offline

// ============================================
// BOT SETUP
// ============================================

let bot = null;
let status = 'disabled';

function init() {
  if (!ALERT_ENABLED) {
    console.log('[ALERTS] Telegram alerts disabled. Set TELEGRAM_ALERT_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID.');
    return;
  }

  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    status = 'connected';
    console.log('[ALERTS] Telegram alert bot connected.');

    // Command: /hwmh status
    bot.onText(/\/hwmh status/, async (msg) => {
      if (String(msg.chat.id) !== String(CHAT_ID)) return; // Ignore unauthorized chats
      const snapshot = await fetchStatusSnapshot();
      await sendMessage(snapshot, { parse_mode: 'Markdown' });
    });

    // Command: /hwmh help
    bot.onText(/\/hwmh help/, async (msg) => {
      if (String(msg.chat.id) !== String(CHAT_ID)) return;
      await sendMessage(
        `*HWMH Alert Bot Commands*\n\n` +
        `/hwmh status - Live system snapshot\n` +
        `/hwmh help  - Show this message\n\n` +
        `_Alerts are sent automatically for critical events._`,
        { parse_mode: 'Markdown' }
      );
    });

    // Startup ping
    sendMessage(
      `*HWMH Alert Bot Online* ✅\n\n` +
      `Monitoring: Sophia, Iris, Pheme, Kairos\n` +
      `Dashboard: ${HWMH_BASE_URL}`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('[ALERTS] Failed to start Telegram bot:', err.message);
    status = 'error';
  }
}

// ============================================
// INTERNAL HELPERS
// ============================================

async function sendMessage(text, opts = {}) {
  if (!bot || !ALERT_ENABLED) return;
  try {
    await bot.sendMessage(CHAT_ID, text, { disable_web_page_preview: true, ...opts });
  } catch (err) {
    console.error('[ALERTS] sendMessage failed:', err.message);
  }
}

function shouldThrottle(key) {
  const now = Date.now();
  const last = lastAlert.get(key);
  if (last && now - last < ALERT_COOLDOWN_MS) return true;
  lastAlert.set(key, now);
  return false;
}

async function fetchStatusSnapshot() {
  try {
    const res = await axios.get(`${HWMH_BASE_URL}/status`, { timeout: 5000 });
    const data = res.data;
    const workers = data.workers || {};
    const status = data.status || {};
    const totalQueued = Object.values(status).reduce((sum, w) => sum + (w.queueLength || 0), 0);
    const onlineCount = Object.values(status).filter(w => w.status !== 'offline').length;
    const totalWorkers = Object.keys(workers).length;

    let msg = `*HWMH Status Snapshot* ⚡\n\n`;
    msg += `*Workers:* ${onlineCount}/${totalWorkers} online\n`;
    msg += `*Queue:* ${totalQueued} tasks waiting\n\n`;

    for (const [id, cfg] of Object.entries(workers)) {
      const s = status[id] || {};
      const icon = s.status === 'working' ? '🔵' : s.status === 'idle' ? '🟢' : '⚫';
      msg += `${icon} *${cfg.name}* — ${s.status || 'unknown'}`;
      if (s.queueLength) msg += ` (${s.queueLength} queued)`;
      msg += `\n`;
    }

    msg += `\n[Open Dashboard](${HWMH_BASE_URL})`;
    return msg;
  } catch (err) {
    return `*HWMH Status* ❌\nCould not reach server: ${err.message}`;
  }
}

// ============================================
// ALERT TRIGGERS
// ============================================

function alertWorkerOffline(workerId, workerName) {
  const key = `offline:${workerId}`;
  if (shouldThrottle(key)) return;
  sendMessage(
    `⚠️ *Worker Offline*\n\n` +
    `${workerName} (@${workerId}) has not polled in >3 minutes.`,
    { parse_mode: 'Markdown' }
  );
}

function alertWorkerOnline(workerId, workerName) {
  const key = `offline:${workerId}`;
  lastAlert.delete(key); // Reset throttle so next offline fires immediately
  sendMessage(
    `✅ *Worker Back Online*\n\n${workerName} (@${workerId}) is polling again.`,
    { parse_mode: 'Markdown' }
  );
}

function alertTaskFailed(workerId, workerName, taskId, error) {
  const key = `fail:${workerId}`;
  if (shouldThrottle(key)) return;
  sendMessage(
    `❌ *Task Failed*\n\n` +
    `*Worker:* ${workerName} (@${workerId})\n` +
    `*Task:* \`${taskId}\`\n` +
    `*Error:* ${error || 'Unknown error'}`,
    { parse_mode: 'Markdown' }
  );
}

function alertQueueBackup(workerId, workerName, length) {
  const key = `queue:${workerId}`;
  if (shouldThrottle(key)) return;
  sendMessage(
    `📥 *Queue Backup*\n\n` +
    `*Worker:* ${workerName} (@${workerId})\n` +
    `*Queued:* ${length} tasks`,
    { parse_mode: 'Markdown' }
  );
}

function alertErrorSpike(count, windowMinutes) {
  const key = 'error:spike';
  if (shouldThrottle(key)) return;
  sendMessage(
    `🔥 *Error Spike Detected*\n\n` +
    `${count} errors in the last ${windowMinutes} minutes.\n\n` +
    `[Check Dashboard](${HWMH_BASE_URL})`,
    { parse_mode: 'Markdown' }
  );
}

function alertSystemRestart(uptimeSeconds) {
  sendMessage(
    `🔄 *HWMH Restarted*\n\n` +
    `Server came back online (uptime: ${Math.floor(uptimeSeconds)}s).`,
    { parse_mode: 'Markdown' }
  );
}

// ============================================
// OFFLINE MONITOR
// ============================================

let monitorInterval = null;

function startOfflineMonitor(getWorkerStatus, getWorkersConfig) {
  if (monitorInterval) clearInterval(monitorInterval);
  monitorInterval = setInterval(() => {
    if (!ALERT_ENABLED) return;
    const now = Date.now();
    const status = getWorkerStatus();
    const config = getWorkersConfig();
    for (const [id, s] of Object.entries(status)) {
      const cfg = config[id];
      if (!cfg) continue;
      const lastSeen = s.lastSeen ? new Date(s.lastSeen).getTime() : 0;
      const isOffline = !lastSeen || (now - lastSeen > OFFLINE_THRESHOLD_MS);
      const wasOffline = s._alertedOffline;

      if (isOffline && !wasOffline) {
        s._alertedOffline = true;
        alertWorkerOffline(id, cfg.name);
      } else if (!isOffline && wasOffline) {
        s._alertedOffline = false;
        alertWorkerOnline(id, cfg.name);
      }
    }
  }, 30000); // Check every 30s
}

// ============================================
// ERROR SPIKE MONITOR
// ============================================

let errorHistory = []; // { timestamp }
const ERROR_SPIKE_WINDOW = 5 * 60 * 1000; // 5 min
const ERROR_SPIKE_THRESHOLD = 5; // 5 errors in 5 min

function recordError() {
  errorHistory.push({ timestamp: Date.now() });
  // Prune old
  const cutoff = Date.now() - ERROR_SPIKE_WINDOW;
  errorHistory = errorHistory.filter(e => e.timestamp > cutoff);
  if (errorHistory.length >= ERROR_SPIKE_THRESHOLD) {
    alertErrorSpike(errorHistory.length, 5);
    errorHistory = []; // Reset after alerting
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  init,
  status: () => status,
  sendMessage,
  alertWorkerOffline,
  alertWorkerOnline,
  alertTaskFailed,
  alertQueueBackup,
  alertErrorSpike,
  alertSystemRestart,
  startOfflineMonitor,
  recordError,
  fetchStatusSnapshot
};
