/**
 * HWMH Secrets Vault
 * Centralized, safe secret loader for the HWMH server.
 * Reads from process.env (populated by .env via dotenv).
 *
 * Usage:
 *   const { getSecret, getSecretOrThrow, hasSecret } = require('./lib/secrets');
 *   const token = getSecretOrThrow('GITHUB_TOKEN');
 */

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
  'HOST'
];

const TELEGRAM_BOT_TOKENS = [
  'GOTTFRIED_BOT_TOKEN',
  'SOPHIA_BOT_TOKEN',
  'IRIS_BOT_TOKEN',
  'PHEME_BOT_TOKEN',
  'KAIROS_BOT_TOKEN'
];

function hasSecret(key) {
  const val = process.env[key];
  return val !== undefined && val !== '' && val !== '***';
}

function getSecret(key, defaultValue = undefined) {
  const val = process.env[key];
  if (val === undefined || val === '' || val === '***') {
    return defaultValue;
  }
  return val;
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

function auditLog() {
  const lines = ['[SECRETS] Vault audit:'];
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

module.exports = {
  hasSecret,
  getSecret,
  getSecretOrThrow,
  mask,
  auditLog,
  REQUIRED_SECRETS,
  OPTIONAL_SECRETS,
  TELEGRAM_BOT_TOKENS
};
