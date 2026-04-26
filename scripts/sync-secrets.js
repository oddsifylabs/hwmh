#!/usr/bin/env node
/**
 * HWMH Secret Sync
 * Pushes selected secrets from the master .env to standalone worker dirs.
 * Usage: node scripts/sync-secrets.js
 */

const fs = require('fs');
const path = require('path');

const MASTER_ENV = path.join(__dirname, '..', '.env');

const WORKER_DIRS = [
  { dir: '/data/iris-worker',   keys: ['HWMH_BASE_URL','POLL_INTERVAL_MS','KIMI_API_KEY','EMAIL_SMTP_HOST','EMAIL_SMTP_USER','EMAIL_SMTP_PASS'] },
  { dir: '/data/pheme-worker',  keys: ['HWMH_BASE_URL','POLL_INTERVAL_MS','X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_SECRET'] },
  { dir: '/data/kairos-worker', keys: ['HWMH_BASE_URL','POLL_INTERVAL_MS','SALESFORCE_CLIENT_ID','SALESFORCE_CLIENT_SECRET','HUBSPOT_API_KEY'] }
];

function parseEnv(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

function buildEnv(keys, masterMap, existingPath) {
  const out = ['# Auto-synced by HWMH sync-secrets.js', `# ${new Date().toISOString()}`, ''];
  const existing = fs.existsSync(existingPath) ? parseEnv(existingPath) : new Map();

  for (const key of keys) {
    const val = masterMap.get(key) || existing.get(key) || '';
    if (val) out.push(`${key}=${val}`);
    else out.push(`# ${key}=`);
  }

  // Preserve any extra keys in existing .env that aren't in our template
  for (const [k, v] of existing) {
    if (!keys.includes(k) && !k.startsWith('#')) {
      out.push(`${k}=${v}`);
    }
  }

  return out.join('\n') + '\n';
}

function main() {
  if (!fs.existsSync(MASTER_ENV)) {
    console.error('Master .env not found:', MASTER_ENV);
    process.exit(1);
  }

  const master = parseEnv(MASTER_ENV);
  console.log(`[SYNC] Master .env loaded (${master.size} keys)`);

  for (const { dir, keys } of WORKER_DIRS) {
    const envPath = path.join(dir, '.env');
    const content = buildEnv(keys, master, envPath);
    fs.writeFileSync(envPath, content, { mode: 0o600 });
    console.log(`[SYNC] Wrote ${envPath} (${keys.length} keys)`);
  }

  console.log('[SYNC] Done.');
}

main();
