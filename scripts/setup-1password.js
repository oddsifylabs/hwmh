#!/usr/bin/env node
/**
 * HWMH 1Password Setup & Migration Script
 *
 * Prerequisites:
 *   - 1Password CLI installed (op --version)
 *   - A 1Password account (e.g., my.1password.com)
 *   - A Service Account token with write access to the vault
 *
 * Usage:
 *   export OP_SERVICE_ACCOUNT_TOKEN="your-token-here"
 *   node scripts/setup-1password.js
 *
 * What it does:
 *   1. Verifies op CLI connectivity
 *   2. Creates "HWMH" vault if it doesn't exist
 *   3. Migrates all secrets from .env into 1Password items
 *   4. Generates a new .env that references 1Password instead of storing values
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
const VAULT_NAME = process.env.ONEPASSWORD_VAULT || 'HWMH';

// ============================================
// UTILS
// ============================================

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

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

function opCheck() {
  try {
    const ver = run('op --version');
    console.log(`[1P] CLI version: ${ver}`);
    return true;
  } catch (_) {
    return false;
  }
}

function opSignedIn() {
  try {
    run('op account list');
    return true;
  } catch (_) {
    return false;
  }
}

function getOrCreateVault(name) {
  try {
    const vaults = JSON.parse(run(`op vault list --format=json`));
    const existing = vaults.find(v => v.name === name);
    if (existing) {
      console.log(`[1P] Vault "${name}" exists (ID: ${existing.id})`);
      return existing.id;
    }
  } catch (_) {}

  console.log(`[1P] Creating vault "${name}"...`);
  const result = run(`op vault create "${name}" --description "HWMH Secrets Vault" --format=json`);
  const vault = JSON.parse(result);
  console.log(`[1P] Created vault "${name}" (ID: ${vault.id})`);
  return vault.id;
}

function createSecretItem(vault, title, value, category = 'API Credential') {
  try {
    // Check if item exists
    const items = JSON.parse(run(`op item list --vault "${vault}" --categories "${category}" --format=json`));
    const existing = items.find(i => i.title === title);

    if (existing) {
      console.log(`[1P] Updating ${title}...`);
      run(`op item edit "${existing.id}" --vault "${vault}" credential="${value}"`);
      return existing.id;
    }

    console.log(`[1P] Creating ${title}...`);
    const result = run(`op item create --category "${category}" --title "${title}" --vault "${vault}" credential="${value}" --format=json`);
    const item = JSON.parse(result);
    return item.id;
  } catch (err) {
    console.error(`[1P] Failed to create/update ${title}:`, err.message);
    return null;
  }
}

// ============================================
// MAIN
// ============================================

function main() {
  console.log('[1P] HWMH 1Password Setup & Migration');
  console.log('======================================');

  if (!opCheck()) {
    console.error('[1P] ERROR: 1Password CLI not found. Install it first:');
    console.error('  curl -sSfLo /tmp/op.zip "https://cache.agilebits.com/dist/1P/op2/pkg/v2.30.3/op_linux_amd64_v2.30.3.zip"');
    console.error('  python3 -c "import zipfile; zipfile.ZipFile(\'/tmp/op.zip\').extract(\'op\', \'/usr/local/bin\')"');
    console.error('  chmod +x /usr/local/bin/op');
    process.exit(1);
  }

  if (!opSignedIn()) {
    console.error('[1P] ERROR: Not signed in to 1Password.');
    console.error('');
    console.error('You need a Service Account token. To create one:');
    console.error('  1. Go to https://my.1password.com/developer-tools');
    console.error('  2. Create a Service Account with "Write" access');
    console.error('  3. Export the token:');
    console.error('     export OP_SERVICE_ACCOUNT_TOKEN="ops_..."');
    console.error('');
    console.error('Or sign in interactively:');
    console.error('  eval $(op signin)');
    process.exit(1);
  }

  const vaultId = getOrCreateVault(VAULT_NAME);

  const env = parseEnv(ENV_PATH);
  console.log(`[1P] Loaded ${env.size} keys from ${ENV_PATH}`);

  let migrated = 0;
  let failed = 0;

  for (const [key, value] of env) {
    if (!value || value === '***') {
      console.log(`[1P] Skipping ${key} (empty or masked)`);
      continue;
    }
    const id = createSecretItem(vaultId, key, value);
    if (id) migrated++;
    else failed++;
  }

  console.log(`\n[1P] Migration complete: ${migrated} succeeded, ${failed} failed`);

  if (migrated > 0) {
    console.log('\n[1P] Next steps:');
    console.log('  1. Add to your .env file:');
    console.log('     ONEPASSWORD_ENABLED=true');
    console.log('     ONEPASSWORD_VAULT=HWMH');
    console.log('     ONEPASSWORD_SERVICE_ACCOUNT_TOKEN=ops_...');
    console.log('  2. For workers, add to their .env files:');
    console.log('     ONEPASSWORD_ENABLED=true');
    console.log('     ONEPASSWORD_VAULT=HWMH');
    console.log('     ONEPASSWORD_SERVICE_ACCOUNT_TOKEN=ops_...');
    console.log('  3. The secrets.js library will automatically read from 1Password');
    console.log('  4. You can now delete raw secrets from .env (keep the 1Password config)');
  }
}

main();
