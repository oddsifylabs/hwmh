#!/usr/bin/env node
/**
 * HWMH Worker Deploy Script
 * Automates template -> live sync, install, validate, health-check.
 *
 * Usage:
 *   node scripts/deploy-worker.js <worker-name>
 *   node scripts/deploy-worker.js --all
 *   node scripts/deploy-worker.js --list
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================
// CONFIG
// ============================================

const BASE_DIR = '/data';
const TEMPLATE_DIR = path.join(BASE_DIR, 'hamh', 'workers');

// Worker definitions: name -> { templateDir, liveDir, requiredEnvKeys, restartCommand }
const WORKERS = {
  iris: {
    templateDir: path.join(TEMPLATE_DIR, 'iris'),
    liveDir: path.join(BASE_DIR, 'iris-worker'),
    requiredEnvKeys: ['HWMH_BASE_URL', 'POLL_INTERVAL_MS'],
    packageJson: true
  },
  pheme: {
    templateDir: path.join(TEMPLATE_DIR, 'pheme'),
    liveDir: path.join(BASE_DIR, 'pheme-worker'),
    requiredEnvKeys: ['HWMH_BASE_URL', 'POLL_INTERVAL_MS'],
    packageJson: true
  },
  kairos: {
    templateDir: path.join(TEMPLATE_DIR, 'kairos'),
    liveDir: path.join(BASE_DIR, 'kairos-worker'),
    requiredEnvKeys: ['HWMH_BASE_URL', 'POLL_INTERVAL_MS'],
    packageJson: true
  },
  markus: {
    templateDir: path.join(TEMPLATE_DIR, 'markus'),
    liveDir: path.join(BASE_DIR, 'markus-worker'),
    requiredEnvKeys: ['GITHUB_TOKEN'],
    packageJson: true
  },
  miah: {
    templateDir: path.join(TEMPLATE_DIR, 'miah'),
    liveDir: path.join(BASE_DIR, 'miah-worker'),
    requiredEnvKeys: ['GITHUB_TOKEN'],
    packageJson: true
  },
  mitch: {
    templateDir: path.join(TEMPLATE_DIR, 'mitch'),
    liveDir: path.join(BASE_DIR, 'mitch-worker'),
    requiredEnvKeys: ['GITHUB_TOKEN'],
    packageJson: true
  },
  ruth: {
    templateDir: path.join(TEMPLATE_DIR, 'ruth'),
    liveDir: path.join(BASE_DIR, 'ruth-worker'),
    requiredEnvKeys: [],
    packageJson: false
  },
  nova: {
    templateDir: null, // No template — manual only
    liveDir: path.join(BASE_DIR, 'nova-worker'),
    requiredEnvKeys: [],
    packageJson: false
  }
};

// ============================================
// UTILS
// ============================================

function run(cmd, cwd, timeout = 60000) {
  console.log(`[DEPLOY] $ ${cmd}`);
  return execSync(cmd, { cwd, stdio: 'inherit', timeout });
}

function runQuiet(cmd, cwd, timeout = 30000) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout }).trim();
  } catch (err) {
    return null;
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Template directory not found: ${src}`);
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
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

function validateEnv(workerName, liveDir, requiredKeys) {
  const envPath = path.join(liveDir, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env file at ${envPath}`);
  }
  const env = parseEnv(envPath);
  const missing = [];
  for (const key of requiredKeys) {
    if (!env.has(key) || !env.get(key)) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required env keys in ${workerName}: ${missing.join(', ')}`);
  }
  console.log(`[DEPLOY] ✅ .env valid (${env.size} keys, ${requiredKeys.length} required)`);
}

function healthCheckWorker(workerName, liveDir) {
  // Check if the worker has a package.json and can at least syntax-check
  const mainFile = path.join(liveDir, `${workerName}-worker.js`);
  if (fs.existsSync(mainFile)) {
    try {
      runQuiet(`node --check "${mainFile}"`, liveDir);
      console.log(`[DEPLOY] ✅ Syntax check passed for ${mainFile}`);
    } catch (err) {
      throw new Error(`Syntax check failed for ${mainFile}: ${err.message}`);
    }
  }

  // Check if node_modules exists for JS workers
  const pkgPath = path.join(liveDir, 'package.json');
  if (fs.existsSync(pkgPath) && !fs.existsSync(path.join(liveDir, 'node_modules'))) {
    console.log(`[DEPLOY] ⚠️ node_modules missing — running npm install...`);
    run('npm install', liveDir, 120000);
  }
}

// ============================================
// DEPLOY
// ============================================

function deployWorker(name, options = {}) {
  const cfg = WORKERS[name];
  if (!cfg) {
    throw new Error(`Unknown worker: ${name}. Use --list to see available workers.`);
  }

  console.log(`\n========================================`);
  console.log(`[DEPLOY] Deploying: ${name}`);
  console.log(`========================================`);

  // Step 1: Sync template -> live
  if (cfg.templateDir && fs.existsSync(cfg.templateDir)) {
    console.log(`[DEPLOY] Syncing template: ${cfg.templateDir} -> ${cfg.liveDir}`);
    copyDir(cfg.templateDir, cfg.liveDir);
  } else if (cfg.templateDir) {
    console.log(`[DEPLOY] ⚠️ Template not found: ${cfg.templateDir}, skipping sync`);
  } else {
    console.log(`[DEPLOY] ℹ️ No template configured for ${name}, using live dir as-is`);
  }

  // Step 2: Validate .env
  validateEnv(name, cfg.liveDir, cfg.requiredEnvKeys);

  // Step 3: Ensure .env permissions
  const envPath = path.join(cfg.liveDir, '.env');
  if (fs.existsSync(envPath)) {
    fs.chmodSync(envPath, 0o600);
  }

  // Step 4: npm install if needed
  if (cfg.packageJson && fs.existsSync(path.join(cfg.liveDir, 'package.json'))) {
    if (!fs.existsSync(path.join(cfg.liveDir, 'node_modules')) || options.forceInstall) {
      console.log(`[DEPLOY] Running npm install...`);
      run('npm install', cfg.liveDir, 120000);
    } else {
      console.log(`[DEPLOY] node_modules exists, skipping npm install (use --force-install to override)`);
    }
  }

  // Step 5: Health check
  healthCheckWorker(name, cfg.liveDir);

  // Step 6: Restart if systemd service exists
  const serviceName = `${name}-worker`;
  try {
    const systemctlCheck = runQuiet('which systemctl');
    if (systemctlCheck) {
      const svcFile = path.join('/etc/systemd/system', `${serviceName}.service`);
      if (fs.existsSync(svcFile)) {
        console.log(`[DEPLOY] Restarting systemd service: ${serviceName}`);
        run(`systemctl restart ${serviceName}`);
        const status = runQuiet(`systemctl is-active ${serviceName}`);
        if (status === 'active') {
          console.log(`[DEPLOY] ✅ Service ${serviceName} is active`);
        } else {
          console.log(`[DEPLOY] ⚠️ Service ${serviceName} status: ${status}`);
        }
      }
    }
  } catch (err) {
    console.log(`[DEPLOY] ℹ️ No systemd restart available: ${err.message}`);
  }

  console.log(`[DEPLOY] ✅ ${name} deployed successfully`);
  return true;
}

// ============================================
// CLI
// ============================================

function listWorkers() {
  console.log('Available workers:');
  for (const [name, cfg] of Object.entries(WORKERS)) {
    const hasTemplate = cfg.templateDir && fs.existsSync(cfg.templateDir) ? '✅' : '❌';
    const hasLive = fs.existsSync(cfg.liveDir) ? '✅' : '❌';
    console.log(`  ${name.padEnd(10)} template:${hasTemplate} live:${hasLive}`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list') || args.includes('-l')) {
    listWorkers();
    return;
  }

  if (args.includes('--all')) {
    const options = { forceInstall: args.includes('--force-install') };
    let failures = 0;
    for (const name of Object.keys(WORKERS)) {
      try {
        deployWorker(name, options);
      } catch (err) {
        console.error(`[DEPLOY] ❌ ${name} failed: ${err.message}`);
        failures++;
      }
    }
    console.log(`\n[DEPLOY] Batch complete: ${Object.keys(WORKERS).length - failures}/${Object.keys(WORKERS).length} succeeded`);
    if (failures > 0) process.exit(1);
    return;
  }

  const name = args[0];
  if (!name) {
    console.error('Usage: node scripts/deploy-worker.js <worker-name>');
    console.error('       node scripts/deploy-worker.js --all');
    console.error('       node scripts/deploy-worker.js --list');
    process.exit(1);
  }

  const options = { forceInstall: args.includes('--force-install') };
  try {
    deployWorker(name, options);
  } catch (err) {
    console.error(`[DEPLOY] ❌ Failed: ${err.message}`);
    process.exit(1);
  }
}

main();
