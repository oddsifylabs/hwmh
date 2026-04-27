#!/usr/bin/env node
/**
 * HWMH Railway Config Validator
 * Pre-deploy guardrail. Checks Railway service configs for drift.
 *
 * Usage:
 *   node scripts/validate-railway.js
 */

const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

// ============================================
// CONFIG
// ============================================

const RAILWAY_API = 'backboard.railway.app';
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const TOKEN = process.env.RAILWAY_TOKEN;

// Expected services by name
const EXPECTED_SERVICES = [
  'HWMH',
  'Sophia Hermes',
  'Gottfried',
  'Jesse(Human Director)'
];

// ============================================
// GRAPHQL CLIENT
// ============================================

function graphqlQuery(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: RAILWAY_API,
      path: '/graphql/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ============================================
// VALIDATORS
// ============================================

async function fetchProjectServices() {
  const query = `
    query GetProjectServices($projectId: String!) {
      project(id: $projectId) {
        services {
          edges {
            node {
              id
              name
              deployments(first: 1) {
                edges {
                  node {
                    id
                    status
                    createdAt
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const res = await graphqlQuery(query, { projectId: PROJECT_ID });
  if (res.errors) {
    throw new Error('GraphQL errors: ' + JSON.stringify(res.errors));
  }
  return res.data.project.services.edges.map(e => e.node);
}

async function fetchServiceDetails(serviceId) {
  const query = `
    query GetService($id: String!) {
      service(id: $id) {
        id
        name
        serviceInstances {
          edges {
            node {
              source {
                image
                template
                repo
              }
            }
          }
        }
      }
    }
  `;
  return graphqlQuery(query, { id: serviceId });
}

function validateService(service) {
  const issues = [];

  // Check latest deployment
  const latest = service.deployments?.edges?.[0]?.node;
  if (!latest) {
    issues.push({ level: 'warn', message: `${service.name}: No deployments found` });
  } else if (latest.status === 'FAILED' || latest.status === 'CRASHED') {
    issues.push({ level: 'error', message: `${service.name}: Latest deployment ${latest.id} is ${latest.status}` });
  } else if (latest.status !== 'SUCCESS') {
    issues.push({ level: 'warn', message: `${service.name}: Latest deployment status is ${latest.status}` });
  }

  return issues;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('[VALIDATE] Railway Config Validator');
  console.log(`[VALIDATE] Project: ${PROJECT_ID}`);

  if (!TOKEN || !PROJECT_ID) {
    console.error('[VALIDATE] ERROR: RAILWAY_TOKEN and RAILWAY_PROJECT_ID must be set');
    process.exit(1);
  }

  let services;
  try {
    services = await fetchProjectServices();
  } catch (err) {
    console.error('[VALIDATE] ERROR: Failed to fetch services:', err.message);
    process.exit(1);
  }

  console.log(`[VALIDATE] Found ${services.length} services`);

  let errors = 0;
  let warnings = 0;

  for (const svc of services) {
    const issues = validateService(svc);
    for (const issue of issues) {
      const icon = issue.level === 'error' ? '❌' : '⚠️';
      console.log(`[VALIDATE] ${icon} ${issue.message}`);
      if (issue.level === 'error') errors++;
      else warnings++;
    }
  }

  // Check for missing expected services
  const foundNames = new Set(services.map(s => s.name));
  for (const name of EXPECTED_SERVICES) {
    if (!foundNames.has(name)) {
      console.log(`[VALIDATE] ❌ Missing expected service: ${name}`);
      errors++;
    }
  }

  console.log(`\n[VALIDATE] Result: ${errors} errors, ${warnings} warnings`);

  if (errors > 0) {
    console.error('[VALIDATE] DEPLOY BLOCKED: Fix errors before deploying.');
    process.exit(1);
  }

  console.log('[VALIDATE] ✅ All checks passed. Safe to deploy.');
}

main().catch(err => {
  console.error('[VALIDATE] FATAL:', err.message);
  process.exit(1);
});
