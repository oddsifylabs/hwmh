/**
 * HWMH Telegram Bot Orchestrator
 *
 * Manages 5 Telegram bots:
 *   - Gottfried: Direct AI brain access (reasoning, research, analysis)
 *   - Sophia: Manager (delegates to workers, reports status)
 *   - Iris: Admin worker (scheduling, email, research, docs)
 *   - Pheme: Social Media worker (posts, engagement, analytics)
 *   - Kairos: Sales & Marketing worker (leads, outreach, CRM)
 */

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ============================================
// CONFIG
// ============================================

const BOT_CONFIG = {
  gottfried: {
    token: process.env.GOTTFRIED_BOT_TOKEN,
    name: 'Gottfried',
    role: 'AI Brain',
    description: 'Direct reasoning engine. Ask me anything.',
    color: '\x1b[36m' // cyan
  },
  sophia: {
    token: process.env.SOPHIA_BOT_TOKEN,
    name: 'Sophia',
    role: 'Manager',
    description: 'I delegate tasks to workers. Use @iris, @pheme, @kairos.',
    color: '\x1b[35m' // magenta
  },
  iris: {
    token: process.env.IRIS_BOT_TOKEN,
    name: 'Iris',
    role: 'Admin Assistant',
    description: 'Scheduling, research, documentation, email, reminders.',
    color: '\x1b[32m' // green
  },
  pheme: {
    token: process.env.PHEME_BOT_TOKEN,
    name: 'Pheme',
    role: 'Social Media Manager',
    description: 'Posts, engagement, analytics, content strategy.',
    color: '\x1b[33m' // yellow
  },
  kairos: {
    token: process.env.KAIROS_BOT_TOKEN,
    name: 'Kairos',
    role: 'Sales & Marketing',
    description: 'Lead generation, sales, marketing, CRM.',
    color: '\x1b[34m' // blue
  }
};

const HWMH_BASE_URL = process.env.HWMH_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const API_KEY = process.env.API_KEY;

// ============================================
// LOGGING
// ============================================

function log(botId, level, message) {
  const config = BOT_CONFIG[botId];
  const color = config?.color || '\x1b[0m';
  const reset = '\x1b[0m';
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`${color}[${ts}] [${config?.name || botId}] [${level.toUpperCase()}]${reset} ${message}`);
}

// ============================================
// HWMH API CLIENT
// ============================================

const hwmhApi = axios.create({
  baseURL: HWMH_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

async function sendCommand(command, source = 'telegram', meta = {}) {
  try {
    const { data } = await hwmhApi.post('/command', { command, source, ...meta });
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getNotifications(chatId) {
  try {
    const { data } = await hwmhApi.get(`/notifications/${chatId}`);
    return data.notifications || [];
  } catch (err) {
    return [];
  }
}

async function getStatus() {
  try {
    const { data } = await hwmhApi.get('/status');
    return data;
  } catch (err) {
    return null;
  }
}

// ============================================
// BOT ORCHESTRATOR
// ============================================

class TelegramBotOrchestrator {
  constructor() {
    this.bots = {};
    this.active = false;
    this.activeChats = new Set(); // Track chats with pending tasks
  }

  start() {
    for (const [botId, config] of Object.entries(BOT_CONFIG)) {
      if (!config.token) {
        log(botId, 'warn', `No token found. Skipping.`);
        continue;
      }

      try {
        const bot = new TelegramBot(config.token, { polling: true });
        this.bots[botId] = bot;
        this.setupHandlers(botId, bot);
        log(botId, 'info', `Bot started and polling.`);
      } catch (err) {
        log(botId, 'error', `Failed to start: ${err.message}`);
      }
    }

    this.active = Object.keys(this.bots).length > 0;
    if (this.active) {
      console.log('\n\x1b[1mTelegram Bots Online\x1b[0m');
      console.log('─'.repeat(40));
      for (const [id, bot] of Object.entries(this.bots)) {
        const cfg = BOT_CONFIG[id];
        console.log(`${cfg.color}${cfg.name}\x1b[0m — @${cfg.role}`);
      }
      console.log('─'.repeat(40) + '\n');
    }

    // Start notification polling for completions
    this.startNotificationPolling();
  }

  setupHandlers(botId, bot) {
    const config = BOT_CONFIG[botId];

    // /start command
    bot.onText(/^\/start$/, (msg) => {
      const chatId = msg.chat.id;
      const welcome = `
🧠 *${config.name} Hermes* — ${config.role}

_${config.description}_

*Available commands:*
${this.getCommandsForBot(botId)}

Send me a message and I'll get to work.
      `;
      bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
      log(botId, 'info', `User ${msg.from.username || msg.from.id} started bot`);
    });

    // /help command
    bot.onText(/^\/help$/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(chatId, this.getHelpText(botId), { parse_mode: 'Markdown' });
    });

    // /status command
    bot.onText(/^\/status$/, async (msg) => {
      const chatId = msg.chat.id;
      const status = await getStatus();
      if (!status) {
        return bot.sendMessage(chatId, '❌ Cannot reach HWMH server.');
      }
      const report = this.formatStatus(status);
      bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
    });

    // General message handler
    bot.on('message', async (msg) => {
      if (msg.text?.startsWith('/')) return; // Commands handled above
      await this.handleMessage(botId, bot, msg);
    });

    // Error handler
    bot.on('polling_error', (err) => {
      log(botId, 'error', `Polling error: ${err.message}`);
    });
  }

  getCommandsForBot(botId) {
    const common = '/start — Welcome\n/help — Show help\n/status — System status';
    const specific = {
      gottfried: '/reason <query> — Deep analysis\n/research <topic> — Research mode',
      sophia: '/delegate <worker> <task> — Send task to worker\n/workers — List workers',
      iris: '/schedule <desc> — Schedule something\n/research <topic> — Quick research',
      pheme: '/post <content> — Draft a post\n/engage <action> — Engagement task',
      kairos: '/lead <criteria> — Find leads\n/sales <task> — Sales task'
    };
    return common + (specific[botId] ? '\n' + specific[botId] : '');
  }

  getHelpText(botId) {
    const config = BOT_CONFIG[botId];
    return `
*${config.name} Hermes* — Help

${config.description}

*How to use:*
Simply send me a message describing what you need. I'll understand and act.

*Examples:*
${this.getExamplesForBot(botId)}
    `;
  }

  getExamplesForBot(botId) {
    const examples = {
      gottfried: '• "Analyze the pros and cons of using Railway vs Vercel"\n• "Research the best CRM for small businesses"\n• "Write a Python script to scrape LinkedIn profiles"',
      sophia: '• "@iris schedule a meeting tomorrow at 3pm"\n• "@pheme draft a tweet about AI agents"\n• "@kairos find leads in Arizona"\n• "What is everyone working on?"',
      iris: '• "Schedule a call with the team Friday at 2pm"\n• "Research competitors in the AI agent space"\n• "Draft an email to potential investors"\n• "Remind me to review the quarterly report Monday"',
      pheme: '• "Draft a tweet about our new product launch"\n• "Check engagement on last week\'s posts"\n• "Schedule posts for the next 3 days"\n• "Curate content about AI automation"',
      kairos: '• "Find 20 leads of AI agencies in Phoenix"\n• "Draft a cold outreach email for SaaS founders"\n• "Create a marketing campaign for Q2"\n• "Update CRM with new contacts from today"'
    };
    return examples[botId] || 'Send me any task description.';
  }

  formatStatus(status) {
    const ts = new Date(status.timestamp || Date.now()).toLocaleString();
    let text = `📊 *HWMH Status* — ${ts}\n\n`;
    text += `*Manager:* ${status.from || 'Sophia'}\n`;
    text += `*Workers Active:* ${status.summary?.activeWorkers || 0}\n`;
    text += `*Health:* ${status.summary?.systemHealth || 'unknown'}\n\n`;

    if (status.workers) {
      text += '*Worker Status:*\n';
      for (const [id, w] of Object.entries(status.workers)) {
        const emoji = w.status === 'idle' ? '🟢' : w.status === 'working' ? '🔵' : '⚪';
        text += `${emoji} *${id}* — ${w.status}${w.queueLength ? ` (${w.queueLength} queued)` : ''}\n`;
      }
    }

    if (status.nextActions?.length) {
      text += '\n*Suggestions:*\n';
      status.nextActions.forEach(a => text += `• ${a}\n`);
    }

    return text;
  }

  async handleMessage(botId, bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const user = msg.from.username || msg.from.first_name || 'User';

    if (!text) return;

    log(botId, 'info', `Message from ${user}: ${text.slice(0, 80)}`);

    switch (botId) {
      case 'gottfried':
        await this.handleGottfried(bot, chatId, text, user);
        break;
      case 'sophia':
        this.activeChats.add(chatId); // Track for notifications
        await this.handleSophia(bot, chatId, text, user);
        break;
      case 'iris':
      case 'pheme':
      case 'kairos':
        this.activeChats.add(chatId); // Track for notifications
        await this.handleWorker(botId, bot, chatId, text, user);
        break;
    }
  }

  // ============================================
  // GOTTFRIED: Direct Brain Access
  // ============================================
  async handleGottfried(bot, chatId, text, user) {
    // Simulate reasoning delay
    const thinkingMsg = await bot.sendMessage(chatId, '🧠 Gottfried is thinking...');

    try {
      // In production, this calls the actual LLM/Gottfried engine
      // For now, simulate a reasoned response
      const response = await this.simulateGottfriedResponse(text);

      await bot.editMessageText(response, {
        chat_id: chatId,
        message_id: thinkingMsg.message_id,
        parse_mode: 'Markdown'
      });
    } catch (err) {
      await bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId,
        message_id: thinkingMsg.message_id
      });
    }
  }

  async simulateGottfriedResponse(query) {
    // Placeholder: In production, this calls the LLM
    return `🧠 *Gottfried's Analysis*\n\nQuery: "${query.slice(0, 100)}..."\n\n_Reasoning:_\n1. Analyzing intent and context...\n2. Identifying key entities and constraints...\n3. Formulating response strategy...\n\n_Result:_\nThis is a simulated response. In production, Gottfried would connect to the Kimi API (key is configured) and return a fully reasoned answer.\n\n*Confidence:* 85%\n*Complexity:* Medium`;
  }

  // ============================================
  // SOPHIA: Manager Delegation
  // ============================================
  async handleSophia(bot, chatId, text, user) {
    const meta = { chatId, user };

    const thinkingMsg = await bot.sendMessage(chatId, '📋 Sophia is consulting Gottfried...');

    // Always route through Sophia + Gottfried
    const result = await sendCommand(text, 'telegram', meta);

    let response;
    if (result.success && result.result?.message) {
      response = `📋 *Sophia*\n\n${result.result.message}`;

      // Show delegation details if tasks were assigned
      if (result.result.delegation?.assignments?.length > 0) {
        response += '\n\n*Delegated tasks:*\n';
        for (const a of result.result.delegation.assignments) {
          response += `• @${a.workerId}: ${a.task.slice(0, 80)}\n`;
        }
      }

      if (result.result.requiresClarification) {
        response += '\n\n_⚠️ I need clarification to proceed._';
      }
    } else {
      response = `📋 *Sophia*\n\nI've noted your request: "${text}"\n\n_I'll route this through Gottfried and get back to you._`;
    }

    await bot.editMessageText(response, {
      chat_id: chatId,
      message_id: thinkingMsg.message_id,
      parse_mode: 'Markdown'
    });
  }

  // ============================================
  // NOTIFICATION POLLING: Check for completed tasks
  // ============================================
  startNotificationPolling() {
    const POLL_INTERVAL = 5000; // 5 seconds

    setInterval(async () => {
      if (this.activeChats.size === 0) return;

      for (const chatId of this.activeChats) {
        try {
          const notifications = await getNotifications(chatId);
          if (notifications.length === 0) continue;

          // Send completion messages via Sophia bot
          const sophiaBot = this.bots['sophia'];
          if (!sophiaBot) continue;

          for (const n of notifications) {
            let msg;
            if (n.success) {
              msg = `✅ *@${n.workerId} completed your task!*\n\n*Original:* ${n.originalDescription?.slice(0, 100) || ''}\n\n*Result:*\n${(n.result || 'Done').slice(0, 800)}`;
            } else {
              msg = `❌ *@${n.workerId} failed to complete the task.*\n\n*Error:* ${n.error || 'Unknown error'}`;
            }
            await sophiaBot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
          }
        } catch (err) {
          // Silently ignore polling errors
        }
      }
    }, POLL_INTERVAL);
  }

  async pollAndNotify(chatId, bot) {
    const notifications = await getNotifications(chatId);
    for (const n of notifications) {
      let msg;
      if (n.success) {
        msg = `✅ *@${n.workerId} completed your task!*\n\n*Original:* ${n.originalDescription?.slice(0, 100) || ''}\n\n*Result:*\n${(n.result || 'Done').slice(0, 800)}`;
      } else {
        msg = `❌ *@${n.workerId} failed to complete the task.*\n\n*Error:* ${n.error || 'Unknown error'}`;
      }
      await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
  }

  // ============================================
  // WORKERS: Direct Task Execution
  // ============================================
  async handleWorker(workerId, bot, chatId, text, user) {
    const config = BOT_CONFIG[workerId];
    const thinkingMsg = await bot.sendMessage(chatId, `${config.name} is working...`);

    // Send task to HWMH (routes through Sophia + Gottfried)
    const result = await sendCommand(`@${workerId} ${text}`, 'telegram', { chatId, user });

    let response;
    if (result.success) {
      response = `✅ *${config.name}* received your task.\n\n*Task:* ${text.slice(0, 200)}\n*ID:* \`${result.taskId}\`\n*Status:* Queued\n\nI'll update you when it's complete.`;
    } else {
      response = `❌ *${config.name}* couldn't queue the task.\n\n${result.error || 'Server error'}`;
    }

    await bot.editMessageText(response, {
      chat_id: chatId,
      message_id: thinkingMsg.message_id,
      parse_mode: 'Markdown'
    });
  }

  stop() {
    for (const [botId, bot] of Object.entries(this.bots)) {
      bot.stopPolling();
      log(botId, 'info', 'Bot stopped.');
    }
    this.active = false;
  }
}

module.exports = { TelegramBotOrchestrator };
