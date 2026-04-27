/**
 * HWMH Secrets Vault v2
 * Centralized secret loader with 1Password integration.
 *
 * Priority:
 *   1. Environment variables (process.env) — Railway, local dev
 *   2. 1Password CLI (op read) — production, shared secrets
 *   3. Default values
 *
 * Usage:
 *   const { getSecret, getSecretOrThrow, hasSecret } = require('./lib/secrets');
 *   const token = getSecretOrThrow('GITHUB_TOKEN');
 */

const { execSync } = require('child_process');

// ============================================
// CONFIG
// ============================================

const REQUIRED_SECRETS = [
  'API_KEY',
  'KIMI_API_KEY',
  'GITHUB_TOKEN'
];

const OPTIONAL_SECRETS = [
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'RAILWAY_TOKEN',
  'RAILWAY_PROJECT_ID',
  'DIRECTOR_NAME',
  'GOTTFRIED_VERBOSE',
  'PORT',
  'HOST',
  'ONEPASSWORD_ENABLED',
  'ONEPASSWORD_VAULT',
  'ONEPASSWORD_SERVICE_ACCOUNT_TOKEN'
];

const TELEGRAM_BOT_TOKENS = [
  'GOTTFRIED_BOT_TOKEN',
  'SOPHIA_BOT_TOKEN',
  'IRIS_BOT_TOKEN',
  'PHEME_BOT_TOKEN',
  'KAIROS_BOT_TOKEN'
];

// Cache for 1Password reads (TTL = 5 minutes)
const opCache = new Map();
const OP_CACHE_TTL_MS = 5 * 60 * 1000;

// Track if op CLI is available
let _opAvailable = null;

// ============================================
// 1PASSWORD INTEGRATION
// ============================================

function isOpAvailable() {
  if (_opAvailable !== null) return _opAvailable;
  try {
    execSync('op --version', { stdio: 'ignore', timeout: 5000 });
    _opAvailable = true;
    return true;
  } catch (_) {
    _opAvailable = false;
    return false;
  }
}

function getOpVault() {
  return process.env.ONEPASSWORD_VAULT || 'HWMH';
}

function isOpEnabled() {
  return process.env.ONEPASSWORD_ENABLED === 'true' && isOpAvailable();
}

function readFrom1Password(key) {
  if (!isOpEnabled()) return undefined;

  const cacheKey = `op:${key}`;
  const cached = opCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < OP_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    // Map env var names to 1Password item names
    // Convention: item = key, field = credential
    const vault = getOpVault();
    const cmd = `op read "op://${vault}/${key}/credential"`;
    const value = execSync(cmd, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    if (value && value !== '[ERROR]' && !value.startsWith('[ERROR]')) {
      opCache.set(cacheKey, { value, ts: Date.now() });
      return value;
    }
  } catch (err) {
    // Silently fail — will fall back to env var
  }
  return undefined;
}

function clearOpCache() {
  opCache.clear();
}

// ============================================
// CORE API
// ============================================

function hasSecret(key) {
  const val = getSecret(key);
  return val !== undefined && val !== '' && val !== '***';
}

function getSecret(key, defaultValue = undefined) {
  // 1. Environment variable
  const envVal = process.env[key];
  if (envVal !== undefined && envVal !== '' && envVal !== '***') {
    return envVal;
  }

  // 2. 1Password
  const opVal = readFrom1Password(key);
  if (opVal !== undefined) {
    return opVal;
  }

  // 3. Default
  return defaultValue;
}

function getSecretOrThrow(key) {
  const val = getSecret(key);
  if (val === undefined) {
    throw new Error(`Missing required secret: ${key}`);
  }
  return val;
}

function mask(value, visible = 4) {
  if (!value || value.length <= visible * 2) return '***';
  return value.slice(0, visible) + '...' + value.slice(-visible);
}

// ============================================
// AUDIT
// ============================================

function auditLog() {
  const lines = ['[SECRETS] Vault audit:'];
  const opStatus = isOpEnabled() ? 'enabled' : isOpAvailable() ? 'available but not enabled' : 'not installed';
  lines.push(`  1Password: ${opStatus}`);

  for (const key of REQUIRED_SECRETS) {
    lines.push(`  ${key}: ${hasSecret(key) ? 'OK (' + mask(getSecret(key)) + ')' : 'MISSING'}`);
  }
  for (const key of TELEGRAM_BOT_TOKENS) {
    lines.push(`  ${key}: ${hasSecret(key) ? 'OK' : 'MISSING'}`);
  }
  for (const key of OPTIONAL_SECRETS) {
    lines.push(`  ${key}: ${hasSecret(key) ? 'OK' : 'optional'}`);
  }
  console.log(lines.join('\n'));
}

function healthCheck() {
  const results = {};
  for (const key of REQUIRED_SECRETS) {
    results[key] = hasSecret(key);
  }
  const op = { available: isOpAvailable(), enabled: isOpEnabled(), vault: getOpVault() };
  return { ok: REQUIRED_SECRETS.every(k => results[k]), secrets: results, onepassword: op };
}

module.exports = {
  hasSecret,
  getSecret,
  getSecretOrThrow,
  mask,
  auditLog,
  healthCheck,
  clearOpCache,
  isOpAvailable,
  isOpEnabled,
  getOpVault,
  REQUIRED_SECRETS,
  OPTIONAL_SECRETS,
  TELEGRAM_BOT_TOKENS
};
